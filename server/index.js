import 'dotenv/config';
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import express from 'express';
import path from 'node:path';
import { closePool, getPool } from './db.js';
import { sendNotification } from './notifications.js';
import shopRouter, { stripeWebhookRouter } from './shop.js';
import toursRouter, { adminToursRouter } from './tours.js';

const app = express();
const port = Number(process.env.PORT || 3001);
const isProduction = process.env.NODE_ENV === 'production';
const adminUsername = process.env.ADMIN_USERNAME || 'admin';
const adminPassword = process.env.ADMIN_PASSWORD || (isProduction ? '' : 'admin123');
const configuredSessionSecret = process.env.SESSION_SECRET;
const sessionSecret = configuredSessionSecret && configuredSessionSecret !== 'replace-this-with-a-long-random-secret'
  ? configuredSessionSecret
  : isProduction ? '' : randomBytes(32).toString('hex');
if (isProduction && (!adminPassword || adminPassword === 'admin123' || sessionSecret.length < 32)) {
  throw new Error('Production requires a custom ADMIN_PASSWORD and a SESSION_SECRET of at least 32 characters.');
}
const sessionCookie = 'gourmet_admin';
const sessionLifetime = 8 * 60 * 60 * 1000;
const adminPasswordHash = scryptSync(adminPassword, 'the-gourmet-walk-admin', 64);
const loginAttempts = new Map();
const loginWindow = 15 * 60 * 1000;
const loginAttemptLimit = 5;

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function createSessionToken(username) {
  const payload = Buffer.from(JSON.stringify({
    username,
    expiresAt: Date.now() + sessionLifetime,
  })).toString('base64url');
  const signature = createHmac('sha256', sessionSecret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function getSession(request) {
  const cookie = request.headers.cookie
    ?.split(';')
    .map((value) => value.trim())
    .find((value) => value.startsWith(`${sessionCookie}=`));
  if (!cookie) return null;

  const [payload, signature] = cookie.slice(sessionCookie.length + 1).split('.');
  if (!payload || !signature) return null;

  const expected = createHmac('sha256', sessionSecret).update(payload).digest('base64url');
  if (!safeEqual(signature, expected)) return null;

  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (session.username !== adminUsername || !Number.isFinite(session.expiresAt) || session.expiresAt <= Date.now()) {
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

function adminOnly(request, response, next) {
  const session = getSession(request);
  if (!session) {
    response.status(401).json({ message: 'Please sign in as an administrator.' });
    return;
  }
  request.admin = { username: session.username };
  next();
}

function cookieOptions(request, maxAge) {
  return {
    httpOnly: true,
    secure: isProduction || request.secure,
    sameSite: 'strict',
    path: '/api/admin',
    maxAge,
  };
}

app.use('/api/stripe/webhook', stripeWebhookRouter);
app.use(express.json({ limit: '20kb' }));

// Render and other single-service hosts can serve the built Vite frontend and API together.
const frontendDist = path.resolve(process.cwd(), 'dist');

app.get('/api/health', (_request, response) => {
  response.json({ status: 'ok' });
});

app.get('/api/admin/session', (request, response) => {
  const session = getSession(request);
  if (!session) {
    response.status(401).json({ message: 'Please sign in as an administrator.' });
    return;
  }
  response.json({ username: session.username });
});

app.post('/api/admin/login', (request, response) => {
  const address = request.ip || request.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const attempts = (loginAttempts.get(address) || []).filter((time) => now - time < loginWindow);
  if (attempts.length >= loginAttemptLimit) {
    loginAttempts.set(address, attempts);
    response.set('Retry-After', String(Math.ceil((loginWindow - (now - attempts[0])) / 1000)));
    response.status(429).json({ message: 'Too many sign-in attempts. Please wait 15 minutes and try again.' });
    return;
  }

  const { username, password } = request.body ?? {};
  const validInput = typeof username === 'string' && typeof password === 'string';
  const passwordHash = validInput
    ? scryptSync(password, 'the-gourmet-walk-admin', 64)
    : Buffer.alloc(64);
  const validCredentials = validInput
    && safeEqual(username, adminUsername)
    && timingSafeEqual(passwordHash, adminPasswordHash);

  if (!validCredentials) {
    attempts.push(now);
    loginAttempts.set(address, attempts);
    response.status(401).json({ message: 'The username or password is incorrect.' });
    return;
  }

  loginAttempts.delete(address);
  response.cookie(sessionCookie, createSessionToken(adminUsername), cookieOptions(request, sessionLifetime));
  response.json({ username: adminUsername });
});

app.post('/api/admin/logout', (request, response) => {
  response.clearCookie(sessionCookie, cookieOptions(request, 0));
  response.status(204).end();
});

app.get('/api/admin/inquiries', adminOnly, async (request, response) => {
  try {
    const [inquiries] = await getPool().execute(
      `SELECT id, first_name AS firstName, last_name AS lastName, email, phone,
        experience_types AS experienceTypes, preferred_date AS preferredDate,
        party_size AS partySize, dietary_requirements AS dietaryRequirements,
        notes, status, created_at AS createdAt
       FROM inquiries
       ORDER BY created_at DESC
       LIMIT 500`,
    );
    response.json(inquiries);
  } catch (error) {
    console.error('Could not load admin inquiries:', error.message);
    response.status(500).json({ message: 'Inquiries could not be loaded. Check the database schema.' });
  }
});

app.patch('/api/admin/inquiries/:id/status', adminOnly, async (request, response) => {
  const inquiryId = Number(request.params.id);
  const { status } = request.body ?? {};
  const validStatuses = new Set(['new', 'contacted', 'confirmed', 'closed']);
  if (!Number.isSafeInteger(inquiryId) || inquiryId < 1 || !validStatuses.has(status)) {
    response.status(400).json({ message: 'Choose a valid inquiry and status.' });
    return;
  }

  try {
    const [result] = await getPool().execute(
      'UPDATE inquiries SET status = ? WHERE id = ?',
      [status, inquiryId],
    );
    if (result.affectedRows === 0) {
      const [rows] = await getPool().execute('SELECT id FROM inquiries WHERE id = ?', [inquiryId]);
      if (rows.length === 0) {
        response.status(404).json({ message: 'Inquiry not found.' });
        return;
      }
    }
    response.json({ id: inquiryId, status });
  } catch (error) {
    console.error('Could not update inquiry status:', error.message);
    response.status(500).json({ message: 'Inquiry status could not be updated. Check the database schema.' });
  }
});

app.post('/api/admin/inquiries/:id/reply', adminOnly, async (request, response) => {
  const inquiryId = Number(request.params.id);
  const { message } = request.body ?? {};
  if (!Number.isSafeInteger(inquiryId) || inquiryId < 1
    || typeof message !== 'string' || !message.trim() || message.length > 5000) {
    response.status(400).json({ message: 'Enter a reply of no more than 5,000 characters.' });
    return;
  }

  try {
    const [rows] = await getPool().execute(
      'SELECT first_name AS firstName, email FROM inquiries WHERE id = ?',
      [inquiryId],
    );
    if (!rows[0]) {
      response.status(404).json({ message: 'Inquiry not found.' });
      return;
    }

    const sent = await sendNotification({
      to: rows[0].email,
      subject: 'Re: Your inquiry to The Gourmet Walk',
      text: `Hello ${rows[0].firstName},\n\n${message.trim()}\n\nThe Gourmet Walk Concierge`,
    });
    if (!sent) {
      response.status(503).json({
        message: 'Email replies are not configured. Set SMTP_HOST and NOTIFICATION_FROM in .env, then restart the API.',
      });
      return;
    }

    await getPool().execute(
      "UPDATE inquiries SET status = 'contacted' WHERE id = ?",
      [inquiryId],
    );
    response.json({ id: inquiryId, status: 'contacted', sentTo: rows[0].email });
  } catch (error) {
    console.error('Could not send inquiry reply:', error.message);
    response.status(500).json({ message: 'The email reply could not be sent. Check the email service configuration.' });
  }
});

app.get('/api/admin/orders', adminOnly, async (_request, response) => {
  try {
    const [orders] = await getPool().execute(
      `SELECT o.reference, o.first_name AS firstName, o.last_name AS lastName,
        o.email, o.phone, o.address_line_1 AS addressLine1,
        o.address_line_2 AS addressLine2, o.city, o.region,
        o.postal_code AS postalCode, o.country, o.currency, o.subtotal_minor AS subtotal,
        o.tax_minor AS tax, o.shipping_minor AS shipping, o.total_minor AS total,
        o.order_status AS status, o.payment_status AS paymentStatus,
        o.payment_provider AS paymentProvider, o.created_at AS createdAt,
        JSON_ARRAYAGG(JSON_OBJECT(
          'name', oi.product_name, 'quantity', oi.quantity, 'unitPrice', oi.unit_price_minor
        )) AS items
       FROM orders o
       JOIN order_items oi ON oi.order_id = o.id
       GROUP BY o.id
       ORDER BY o.created_at DESC
       LIMIT 500`,
    );
    response.json(orders);
  } catch (error) {
    console.error('Could not load admin orders:', error.message);
    response.status(500).json({ message: 'Orders could not be loaded.' });
  }
});

app.patch('/api/admin/orders/:reference/status', adminOnly, async (request, response) => {
  const { reference } = request.params;
  const { status } = request.body ?? {};
  if (!/^[0-9a-f-]{36}$/i.test(reference) || !['confirmed', 'cancelled'].includes(status)) {
    response.status(400).json({ message: 'Choose a valid order and status.' });
    return;
  }
  try {
    const [result] = await getPool().execute(
      `UPDATE orders SET order_status = ?
       WHERE reference = ? AND (payment_status IN ('paid', 'test_paid') OR ? = 'cancelled')`,
      [status, reference, status],
    );
    if (result.affectedRows === 0) {
      const [rows] = await getPool().execute(
        'SELECT reference, payment_status AS paymentStatus FROM orders WHERE reference = ?',
        [reference],
      );
      if (!rows[0]) {
        response.status(404).json({ message: 'Order not found.' });
        return;
      }
      if (status === 'confirmed' && !['paid', 'test_paid'].includes(rows[0].paymentStatus)) {
        response.status(409).json({ message: 'An order cannot be confirmed until payment has been verified.' });
        return;
      }
    }
    response.json({ reference, status });
  } catch (error) {
    console.error('Could not update order status:', error.message);
    response.status(500).json({ message: 'Order status could not be updated.' });
  }
});

app.get('/api/health', async (_request, response) => {
  try {
    await getPool().query('SELECT 1');
    response.json({ status: 'ok', database: 'connected' });
  } catch (error) {
    console.error('Database health check failed:', error.message);
    response.status(503).json({ status: 'error', message: 'Database is unavailable.' });
  }
});

app.get('/api/config/business', (_request, response) => {
  const locationMode = process.env.BUSINESS_LOCATION_MODE || '';
  const chicagoReference = locationMode === 'chicago_reference';
  const rawLatitude = process.env.BUSINESS_LATITUDE?.trim();
  const rawLongitude = process.env.BUSINESS_LONGITUDE?.trim();
  const latitude = rawLatitude ? Number(rawLatitude) : chicagoReference ? 41.8827 : NaN;
  const longitude = rawLongitude ? Number(rawLongitude) : chicagoReference ? -87.6233 : NaN;
  const coordinatesConfigured = Number.isFinite(latitude) && Number.isFinite(longitude)
    && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
  response.json({
    name: process.env.BUSINESS_NAME || 'The Gourmet Walk',
    address: process.env.BUSINESS_ADDRESS || '',
    locationLabel: process.env.BUSINESS_LOCATION_LABEL
      || (chicagoReference
        ? 'Downtown Chicago reference point (approximate; not the verified tour meeting point)'
        : ''),
    locationIsReference: chicagoReference,
    timeZone: process.env.BUSINESS_TIME_ZONE || (chicagoReference ? 'America/Chicago' : 'UTC'),
    tourCurrency: (process.env.TOUR_CURRENCY || (chicagoReference ? 'USD' : process.env.PAYMENT_CURRENCY || 'INR')).toUpperCase(),
    hours: process.env.BUSINESS_HOURS || '',
    latitude: coordinatesConfigured ? latitude : null,
    longitude: coordinatesConfigured ? longitude : null,
    directionsUrl: process.env.BUSINESS_DIRECTIONS_URL
      || (chicagoReference && coordinatesConfigured
        ? `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`
        : ''),
    cancellationHours: Number(process.env.BOOKING_CANCELLATION_HOURS || 24),
  });
});

app.get('/api/products', async (_request, response) => {
  try {
    const [products] = await getPool().execute(
      'SELECT id, name, price, category, image_url AS imageUrl, description FROM products WHERE active = 1 ORDER BY sort_order, name',
    );
    response.json(products);
  } catch (error) {
    console.error('Could not load products:', error.message);
    response.status(500).json({ message: 'Products could not be loaded. Check the MySQL setup and try again.' });
  }
});

app.post('/api/inquiries', async (request, response) => {
  const {
    firstName,
    lastName,
    email,
    phone = '',
    experienceTypes,
    preferredDate = '',
    partySize = '',
    dietaryRequirements = 'None',
    notes = '',
  } = request.body ?? {};

  const allowedExperiences = new Set([
    'Private Food Walk',
    'Bespoke Multi-Day Itinerary',
    'Corporate Dining Event',
    'Chef’s Table & Tasting Masterclass',
  ]);
  const dateIsValid = (value) => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
  };
  const textFields = [firstName, lastName, email, phone, dietaryRequirements, notes];
  if (
    textFields.some((value) => typeof value !== 'string') ||
    !firstName.trim() ||
    !lastName.trim() ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
    firstName.length > 100 ||
    lastName.length > 100 ||
    email.length > 254 ||
    phone.length > 40 ||
    dietaryRequirements.length > 100 ||
    notes.length > 3000 ||
    !Array.isArray(experienceTypes) ||
    experienceTypes.length === 0 ||
    experienceTypes.some((type) => !allowedExperiences.has(type))
  ) {
    response.status(400).json({ message: 'Please provide valid contact details and at least one experience type.' });
    return;
  }

  const parsedPartySize = partySize === '' ? null : Number(partySize);
  if (
    (preferredDate !== '' && !dateIsValid(preferredDate)) ||
    (typeof partySize !== 'string' && partySize !== '') ||
    (parsedPartySize !== null && (!Number.isInteger(parsedPartySize) || parsedPartySize < 1 || parsedPartySize > 100))
  ) {
    response.status(400).json({ message: 'Please provide a valid preferred date and party size.' });
    return;
  }

  try {
    const [result] = await getPool().execute(
      `INSERT INTO inquiries
        (first_name, last_name, email, phone, experience_types, preferred_date, party_size, dietary_requirements, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        firstName.trim(),
        lastName.trim(),
        email.trim().toLowerCase(),
        phone.trim() || null,
        JSON.stringify(experienceTypes),
        preferredDate || null,
        parsedPartySize,
        dietaryRequirements.trim(),
        notes.trim() || null,
      ],
    );
    response.status(201).json({ id: result.insertId, message: 'Your inquiry has been received.' });
  } catch (error) {
    console.error('Could not save inquiry:', error.message);
    response.status(500).json({ message: 'Your inquiry could not be saved. Please try again later.' });
  }
});

app.use('/api', shopRouter);
app.use('/api', toursRouter);
app.use('/api/admin', adminOnly, adminToursRouter);

// Keep API routes above this fallback so client-side routes load on refresh.
app.use(express.static(frontendDist, { index: false }));
app.get('*', (request, response, next) => {
  if (request.path.startsWith('/api/')) return next();
  response.sendFile(path.join(frontendDist, 'index.html'), (error) => {
    if (error) next(error);
  });
});

app.use((error, _request, response, _next) => {
  if (error instanceof SyntaxError && 'body' in error) {
    response.status(400).json({ message: 'Request body must be valid JSON.' });
    return;
  }
  console.error('Unexpected API error:', error.message);
  response.status(500).json({ message: 'An unexpected server error occurred.' });
});

const server = app.listen(port, () => {
  console.log(`The Gourmet Walk API listening on http://localhost:${port}`);
});

async function shutdown() {
  server.close();
  await closePool();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
