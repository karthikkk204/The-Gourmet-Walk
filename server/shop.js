import { createHash, randomBytes, randomUUID } from 'node:crypto';
import express from 'express';
import Stripe from 'stripe';
import { getPool, inTransaction } from './db.js';
import { calculateOrderTotals, normalizeCartItems, toMinorUnits, validateAddress } from './commerce.js';
import { sendNotification } from './notifications.js';

const router = express.Router();
const currency = (process.env.PAYMENT_CURRENCY || 'INR').toLowerCase();
const paymentMode = process.env.PAYMENT_MODE || 'test';
const taxRatePercent = Number(process.env.TAX_RATE_PERCENT || 0);
const shippingFee = process.env.SHIPPING_FEE || '0';
const freeShippingThreshold = process.env.FREE_SHIPPING_THRESHOLD || '';
const stripeEnabled = paymentMode === 'stripe';

if (!/^[a-z]{3}$/.test(currency)) throw new Error('PAYMENT_CURRENCY must be a three-letter currency code.');
if (!Number.isFinite(taxRatePercent) || taxRatePercent < 0 || taxRatePercent > 100) {
  throw new Error('TAX_RATE_PERCENT must be between 0 and 100.');
}
if (!['test', 'stripe'].includes(paymentMode)) throw new Error('PAYMENT_MODE must be either test or stripe.');
if (stripeEnabled && (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET)) {
  throw new Error('Stripe mode requires STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET.');
}
toMinorUnits(shippingFee);
if (freeShippingThreshold) toMinorUnits(freeShippingThreshold);

const stripe = stripeEnabled ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
const pricing = {
  taxRate: taxRatePercent / 100,
  shippingFee,
  freeShippingThreshold: freeShippingThreshold || null,
};

function hashAccessToken(value) {
  return createHash('sha256').update(value).digest('hex');
}

function checkIdempotencyKey(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9._:-]{16,100}$/.test(value);
}

function formatOrder(row) {
  return {
    reference: row.reference,
    firstName: row.first_name,
    items: typeof row.items === 'string' ? JSON.parse(row.items) : row.items,
    currency: row.currency,
    subtotal: row.subtotal_minor,
    tax: row.tax_minor,
    shipping: row.shipping_minor,
    total: row.total_minor,
    status: row.order_status,
    paymentStatus: row.payment_status,
    paymentMode: row.payment_provider,
    createdAt: row.created_at,
  };
}

async function createStripeCheckoutSession(order, idempotencyKey, confirmationToken) {
  const items = typeof order.items === 'string' ? JSON.parse(order.items) : order.items;
  const lineItems = [
    ...items.map((item) => ({
      quantity: item.quantity,
      price_data: {
        currency,
        unit_amount: item.unitPrice,
        product_data: { name: item.name },
      },
    })),
    ...(order.tax_minor > 0 ? [{
      quantity: 1,
      price_data: {
        currency,
        unit_amount: order.tax_minor,
        product_data: { name: `Tax (${taxRatePercent}%)` },
      },
    }] : []),
    ...(order.shipping_minor > 0 ? [{
      quantity: 1,
      price_data: {
        currency,
        unit_amount: order.shipping_minor,
        product_data: { name: 'Shipping' },
      },
    }] : []),
  ];
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: lineItems,
    customer_email: order.email,
    client_reference_id: order.reference,
    metadata: { orderReference: order.reference },
    success_url: `${process.env.APP_BASE_URL || 'http://localhost:5173'}/#order?reference=${order.reference}&token=${encodeURIComponent(confirmationToken)}`,
    cancel_url: `${process.env.APP_BASE_URL || 'http://localhost:5173'}/#checkout?payment=cancelled`,
  }, { idempotencyKey: `order-${idempotencyKey}` });
  await getPool().execute(
    'UPDATE orders SET stripe_session_id = ? WHERE reference = ?',
    [session.id, order.reference],
  );
  return session;
}

async function lookupOrderByIdempotencyKey(idempotencyKey, accessToken = null) {
  const [rows] = await getPool().execute(
    `SELECT o.*, JSON_ARRAYAGG(JSON_OBJECT(
       'id', oi.product_id, 'name', oi.product_name,
       'quantity', oi.quantity, 'unitPrice', oi.unit_price_minor
     )) AS items
     FROM orders o
     JOIN order_items oi ON oi.order_id = o.id
     WHERE o.idempotency_key = ?
     GROUP BY o.id`,
    [idempotencyKey],
  );
  const order = rows[0];
  if (!order) return null;
  if (accessToken && !constantTokenMatch(order.confirmation_token_hash, accessToken)) {
    throw new Error('Order confirmation access was not authorized.');
  }
  return order;
}

function constantTokenMatch(savedHash, token) {
  if (typeof savedHash !== 'string' || typeof token !== 'string') return false;
  const expected = Buffer.from(savedHash, 'hex');
  const actual = Buffer.from(hashAccessToken(token), 'hex');
  return expected.length === actual.length && expected.length > 0 && expected.equals(actual);
}

router.get('/checkout/config', (_request, response) => {
  response.json({
    currency: currency.toUpperCase(),
    taxRatePercent,
    shippingFeeMinor: toMinorUnits(shippingFee),
    freeShippingThresholdMinor: freeShippingThreshold ? toMinorUnits(freeShippingThreshold) : null,
    paymentMode,
    demoPaymentsEnabled: !stripeEnabled,
  });
});

router.post('/checkout/quote', async (request, response) => {
  let items;
  try {
    items = normalizeCartItems(request.body?.items);
  } catch (error) {
    response.status(400).json({ message: error.message });
    return;
  }
  try {
    const ids = items.map((item) => item.id);
    const [products] = await getPool().execute(
      `SELECT id, name, price FROM products WHERE active = 1 AND id IN (${ids.map(() => '?').join(',')})`,
      ids,
    );
    if (products.length !== ids.length) {
      response.status(400).json({ message: 'A product in your cart is no longer available. Refresh your cart and try again.' });
      return;
    }
    const productMap = new Map(products.map((product) => [product.id, product]));
    const lines = items.map(({ id, quantity }) => {
      const product = productMap.get(id);
      return {
        id,
        name: product.name,
        quantity,
        unitPrice: toMinorUnits(product.price),
      };
    });
    response.json({
      currency: currency.toUpperCase(),
      items: lines,
      totals: calculateOrderTotals(lines, pricing),
      paymentMode,
    });
  } catch (error) {
    console.error('Could not quote cart:', error.message);
    response.status(500).json({ message: 'Your order total could not be calculated.' });
  }
});

router.post('/orders', async (request, response) => {
  const idempotencyKey = request.get('Idempotency-Key');
  if (!checkIdempotencyKey(idempotencyKey)) {
    response.status(400).json({ message: 'Submit a valid checkout request token and try again.' });
    return;
  }

  const address = request.body?.customer;
  const addressError = validateAddress(address);
  if (addressError) {
    response.status(400).json({ message: addressError });
    return;
  }

  let items;
  try {
    items = normalizeCartItems(request.body?.items);
  } catch (error) {
    response.status(400).json({ message: error.message });
    return;
  }

  try {
    const existing = await lookupOrderByIdempotencyKey(idempotencyKey);
    if (existing) {
      const token = request.body?.confirmationToken;
      if (!constantTokenMatch(existing.confirmation_token_hash, token)) {
        response.status(409).json({ message: 'This checkout request was already used. Refresh checkout and try again.' });
        return;
      }
      const session = existing.payment_provider === 'stripe'
        ? existing.stripe_session_id
          ? await stripe.checkout.sessions.retrieve(existing.stripe_session_id)
          : await createStripeCheckoutSession(existing, idempotencyKey, token)
        : null;
      response.json({
        ...formatOrder(existing),
        checkoutUrl: session?.url || null,
        confirmationToken: token,
        testModeNotice: existing.payment_provider === 'test' ? 'Test checkout only — no real payment was collected.' : null,
      });
      return;
    }

    const reference = randomUUID();
    const confirmationToken = request.body?.confirmationToken;
    if (typeof confirmationToken !== 'string' || confirmationToken.length !== 64) {
      response.status(400).json({ message: 'Refresh checkout and try again.' });
      return;
    }

    const order = await inTransaction(async (connection) => {
      const ids = items.map((item) => item.id);
      const [products] = await connection.execute(
        `SELECT id, name, price FROM products WHERE active = 1 AND id IN (${ids.map(() => '?').join(',')}) FOR UPDATE`,
        ids,
      );
      if (products.length !== ids.length) {
        const error = new Error('A product in your cart is no longer available. Refresh your cart and try again.');
        error.status = 409;
        throw error;
      }

      const productMap = new Map(products.map((product) => [product.id, product]));
      const lines = items.map(({ id, quantity }) => {
        const product = productMap.get(id);
        return { id, name: product.name, quantity, unitPrice: toMinorUnits(product.price) };
      });
      const totals = calculateOrderTotals(lines, pricing);
      const [insert] = await connection.execute(
        `INSERT INTO orders (
          reference, idempotency_key, first_name, last_name, email, phone,
          address_line_1, address_line_2, city, region, postal_code, country,
          currency, subtotal_minor, tax_minor, shipping_minor, total_minor,
          order_status, payment_status, payment_provider, confirmation_token_hash
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
        [
          reference,
          idempotencyKey,
          address.firstName.trim(),
          address.lastName.trim(),
          address.email.trim().toLowerCase(),
          address.phone.trim(),
          address.addressLine1.trim(),
          (address.addressLine2 || '').trim() || null,
          address.city.trim(),
          address.region.trim(),
          address.postalCode.trim(),
          address.country.trim(),
          currency.toUpperCase(),
          totals.subtotal,
          totals.tax,
          totals.shipping,
          totals.total,
          stripeEnabled ? 'unpaid' : 'test_paid',
          stripeEnabled ? 'stripe' : 'test',
          hashAccessToken(confirmationToken),
        ],
      );
      for (const line of lines) {
        await connection.execute(
          `INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price_minor)
           VALUES (?, ?, ?, ?, ?)`,
          [insert.insertId, line.id, line.name, line.quantity, line.unitPrice],
        );
      }
      const [rows] = await connection.execute(
        `SELECT o.*, JSON_ARRAYAGG(JSON_OBJECT(
           'id', oi.product_id, 'name', oi.product_name,
           'quantity', oi.quantity, 'unitPrice', oi.unit_price_minor
         )) AS items
         FROM orders o JOIN order_items oi ON oi.order_id = o.id
         WHERE o.id = ? GROUP BY o.id`,
        [insert.insertId],
      );
      return rows[0];
    });

    let checkoutUrl = null;
    if (stripeEnabled) {
      try {
        const session = await createStripeCheckoutSession(order, idempotencyKey, confirmationToken);
        checkoutUrl = session.url;
      } catch (error) {
        console.error('Could not create Stripe checkout session:', error.message);
        response.status(502).json({ message: 'Secure payment could not be started. You can return to checkout and try again.' });
        return;
      }
    } else {
      try {
        await sendNotification({
          to: address.email.trim(),
          subject: `Order ${reference} — The Gourmet Walk (test checkout)`,
          text: `Thank you, ${address.firstName.trim()}. Your order ${reference} was saved in test mode. No payment was collected.`,
        });
      } catch (error) {
        console.error('Could not send order confirmation email:', error.message);
      }
    }

    response.status(201).json({
      ...formatOrder(order),
      checkoutUrl,
      confirmationToken,
      testModeNotice: stripeEnabled ? null : 'Test checkout only — no real payment was collected.',
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      try {
        const existing = await lookupOrderByIdempotencyKey(idempotencyKey);
        if (existing) {
          const token = request.body?.confirmationToken;
          if (!constantTokenMatch(existing.confirmation_token_hash, token)) {
            response.status(409).json({ message: 'This checkout request was already used.' });
            return;
          }
          const session = existing.payment_provider === 'stripe'
            ? existing.stripe_session_id
              ? await stripe.checkout.sessions.retrieve(existing.stripe_session_id)
              : await createStripeCheckoutSession(existing, idempotencyKey, token)
            : null;
          response.json({
            ...formatOrder(existing),
            checkoutUrl: session?.url || null,
            confirmationToken: token,
            testModeNotice: existing.payment_provider === 'test' ? 'Test checkout only — no real payment was collected.' : null,
          });
          return;
        }
      } catch (lookupError) {
        console.error('Could not retrieve retried order:', lookupError.message);
      }
      response.status(409).json({ message: 'This order request was already processed.' });
      return;
    }
    console.error('Could not save order:', error.message);
    response.status(error.status || 500).json({
      message: error.status ? error.message : 'Your order could not be saved. Please try again later.',
    });
  }
});

router.get('/orders/:reference', async (request, response) => {
  const { reference } = request.params;
  const token = request.query.token;
  if (typeof token !== 'string' || token.length !== 64 || !/^[0-9a-f-]{36}$/i.test(reference)) {
    response.status(404).json({ message: 'Order not found.' });
    return;
  }
  try {
    const [rows] = await getPool().execute(
      `SELECT o.*, JSON_ARRAYAGG(JSON_OBJECT(
         'id', oi.product_id, 'name', oi.product_name,
         'quantity', oi.quantity, 'unitPrice', oi.unit_price_minor
       )) AS items
       FROM orders o JOIN order_items oi ON oi.order_id = o.id
       WHERE o.reference = ? GROUP BY o.id`,
      [reference],
    );
    const order = rows[0];
    if (!order || !constantTokenMatch(order.confirmation_token_hash, token)) {
      response.status(404).json({ message: 'Order not found.' });
      return;
    }
    response.json(formatOrder(order));
  } catch (error) {
    console.error('Could not retrieve order confirmation:', error.message);
    response.status(500).json({ message: 'Order confirmation could not be loaded.' });
  }
});

export const stripeWebhookRouter = express.Router();

stripeWebhookRouter.post('/', express.raw({ type: 'application/json' }), async (request, response) => {
  if (!stripeEnabled) {
    response.status(404).end();
    return;
  }
  let event;
  try {
    event = stripe.webhooks.constructEvent(
      request.body,
      request.get('stripe-signature'),
      process.env.STRIPE_WEBHOOK_SECRET,
    );
  } catch (error) {
    console.error('Stripe webhook signature verification failed:', error.message);
    response.status(400).send('Invalid Stripe webhook signature.');
    return;
  }

  const session = event.data.object;
  const reference = session.metadata?.orderReference;
  if (!reference) {
    response.json({ received: true });
    return;
  }

  try {
    if (event.type === 'checkout.session.completed' && session.payment_status === 'paid') {
      const [result] = await getPool().execute(
        `UPDATE orders SET payment_status = 'paid', order_status = 'confirmed', paid_at = CURRENT_TIMESTAMP
         WHERE reference = ? AND payment_provider = 'stripe' AND payment_status <> 'paid'`,
        [reference],
      );
      if (result.affectedRows > 0) {
        const [rows] = await getPool().execute('SELECT email, first_name FROM orders WHERE reference = ?', [reference]);
        if (rows[0]) {
          try {
            await sendNotification({
              to: rows[0].email,
              subject: `Payment confirmed — The Gourmet Walk order ${reference}`,
              text: `Thank you, ${rows[0].first_name}. Payment for order ${reference} was verified.`,
            });
          } catch (error) {
            console.error('Could not send paid order notification:', error.message);
          }
        }
      }
    } else if (event.type === 'checkout.session.async_payment_failed' || event.type === 'checkout.session.expired') {
      await getPool().execute(
        `UPDATE orders SET payment_status = 'failed'
         WHERE reference = ? AND payment_provider = 'stripe' AND payment_status = 'unpaid'`,
        [reference],
      );
    }
    response.json({ received: true });
  } catch (error) {
    console.error('Could not process Stripe webhook:', error.message);
    response.status(500).json({ message: 'Payment event could not be processed.' });
  }
});

export default router;
