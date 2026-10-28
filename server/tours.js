import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import express from 'express';
import { getPool, inTransaction } from './db.js';
import { normalizeGuestCount, toMinorUnits } from './commerce.js';
import { sendNotification } from './notifications.js';
import { mysqlDateTimeToIso } from './date-time.js';

const router = express.Router();
const adminRouter = express.Router();
const defaultCurrency = (process.env.PAYMENT_CURRENCY || 'INR').toUpperCase();
const cancellationHours = Number(process.env.BOOKING_CANCELLATION_HOURS || 24);
const appBaseUrl = process.env.APP_BASE_URL || 'http://localhost:5173';

if (!Number.isSafeInteger(cancellationHours) || cancellationHours < 0 || cancellationHours > 8760) {
  throw new Error('BOOKING_CANCELLATION_HOURS must be an integer between 0 and 8760.');
}

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

function safeTokenMatch(savedHash, token) {
  if (typeof savedHash !== 'string' || typeof token !== 'string') return false;
  const expected = Buffer.from(savedHash, 'hex');
  const actual = Buffer.from(hashToken(token), 'hex');
  return expected.length === actual.length && expected.length > 0 && timingSafeEqual(expected, actual);
}

function validIdempotencyKey(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9._:-]{16,100}$/.test(value);
}

function validEmail(value) {
  return typeof value === 'string' && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function validDateTime(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?Z$/.test(value)) {
    return false;
  }
  const date = new Date(value);
  return validDate(value.slice(0, 10)) && Number.isFinite(date.valueOf()) && date.valueOf() > Date.now();
}

function toMysqlDateTime(value) {
  return new Date(value).toISOString().slice(0, 19).replace('T', ' ');
}

function cleanTour(tour) {
  return {
    ...tour,
    priceMinor: Number(tour.priceMinor ?? tour.price_minor),
    durationMinutes: Number(tour.durationMinutes ?? tour.duration_minutes),
    minimumGuests: Number(tour.minimumGuests ?? tour.minimum_guests),
    maximumGuests: Number(tour.maximumGuests ?? tour.maximum_guests),
    currency: tour.currency || defaultCurrency,
    slots: (tour.slots || []).map((slot) => ({
      id: Number(slot.id),
      startsAt: mysqlDateTimeToIso(slot.startsAt ?? slot.starts_at),
      capacity: Number(slot.capacity),
      reservedGuests: Number(slot.reservedGuests ?? slot.reserved_guests),
      availableGuests: Number(slot.capacity) - Number(slot.reservedGuests ?? slot.reserved_guests),
    })),
  };
}

async function loadTours({ includeInactive = false, date = '' } = {}) {
  const pool = getPool();
  const tourWhere = includeInactive ? '' : 'WHERE active = 1';
  const [rows] = await pool.execute(
    `SELECT id, name, description, price_minor AS priceMinor, currency,
      duration_minutes AS durationMinutes, minimum_guests AS minimumGuests,
      maximum_guests AS maximumGuests, active
     FROM tours ${tourWhere}
     ORDER BY name`,
  );
  if (rows.length === 0) return [];

  const ids = rows.map((row) => row.id);
  const datePredicate = date ? ' AND DATE(starts_at) = ?' : '';
  const visibilityPredicate = includeInactive ? '' : ' AND active = 1 AND starts_at > UTC_TIMESTAMP()';
  const parameters = date ? [...ids, date] : [...ids];
  const [slots] = await pool.execute(
    `SELECT id, tour_id AS tourId, starts_at AS startsAt, capacity,
      reserved_guests AS reservedGuests
     FROM tour_slots
     WHERE tour_id IN (${ids.map(() => '?').join(',')})${visibilityPredicate}${datePredicate}
     ORDER BY starts_at`,
    parameters,
  );
  const byTour = new Map(rows.map((tour) => [Number(tour.id), []]));
  for (const slot of slots) {
    byTour.get(Number(slot.tourId))?.push(slot);
  }
  return rows.map((tour) => cleanTour({ ...tour, slots: byTour.get(Number(tour.id)) }));
}

router.get('/tours', async (request, response) => {
  const date = request.query.date || '';
  if (date && !validDate(date)) {
    response.status(400).json({ message: 'Choose a valid tour date.' });
    return;
  }
  try {
    response.json(await loadTours({ date }));
  } catch (error) {
    console.error('Could not load available tours:', error.message);
    response.status(500).json({ message: 'Available tour schedules could not be loaded.' });
  }
});

router.post('/bookings', async (request, response) => {
  const key = request.get('Idempotency-Key');
  if (!validIdempotencyKey(key)) {
    response.status(400).json({ message: 'Refresh the booking form and try again.' });
    return;
  }
  const data = request.body ?? {};
  const requiredTextFields = ['firstName', 'lastName', 'email', 'phone', 'dietaryRequirements', 'notes'];
  if (
    requiredTextFields.some((field) => typeof data[field] !== 'string') ||
    !data.firstName.trim() || !data.lastName.trim() || !validEmail(data.email) ||
    data.firstName.length > 100 || data.lastName.length > 100 || data.phone.trim().length < 7 ||
    data.phone.length > 40 || data.dietaryRequirements.length > 100 || data.notes.length > 3000 ||
    !/^[0-9a-f-]{36}$/i.test(data.cancellationToken || '') ||
    !Number.isSafeInteger(Number(data.tourId)) || Number(data.tourId) < 1 ||
    !Number.isSafeInteger(Number(data.slotId)) || Number(data.slotId) < 1
  ) {
    response.status(400).json({ message: 'Enter valid contact details and choose an available tour time.' });
    return;
  }

  let booking;
  try {
    booking = await inTransaction(async (connection) => {
      const [existingRows] = await connection.execute(
        'SELECT reference, cancellation_token_hash FROM bookings WHERE idempotency_key = ?',
        [key],
      );
      if (existingRows[0]) {
        if (!safeTokenMatch(existingRows[0].cancellation_token_hash, data.cancellationToken)) {
          const error = new Error('This booking request was already used. Select a new tour time and try again.');
          error.status = 409;
          throw error;
        }
        return { reference: existingRows[0].reference, duplicate: true };
      }

      const [slotRows] = await connection.execute(
        `SELECT s.id, s.tour_id, s.starts_at, s.capacity, s.reserved_guests, s.active,
          t.name, t.description, t.price_minor, t.currency, t.minimum_guests, t.maximum_guests, t.active AS tour_active
         FROM tour_slots s JOIN tours t ON t.id = s.tour_id
         WHERE s.id = ? AND s.tour_id = ? FOR UPDATE`,
        [Number(data.slotId), Number(data.tourId)],
      );
      const slot = slotRows[0];
      if (!slot || !slot.active || !slot.tour_active || new Date(mysqlDateTimeToIso(slot.starts_at)).valueOf() <= Date.now()) {
        const error = new Error('That tour time is no longer available. Choose another slot.');
        error.status = 409;
        throw error;
      }
      const guests = normalizeGuestCount(data.guestCount, {
        minimum: Number(slot.minimum_guests),
        maximum: Number(slot.maximum_guests),
      });
      if (Number(slot.capacity) - Number(slot.reserved_guests) < guests) {
        const error = new Error('There are not enough seats remaining for that tour. Choose another time or reduce your guest count.');
        error.status = 409;
        throw error;
      }

      const [duplicateRows] = await connection.execute(
        `SELECT reference FROM bookings
         WHERE slot_id = ? AND email = ? AND status IN ('pending', 'confirmed')`,
        [Number(data.slotId), data.email.trim().toLowerCase()],
      );
      if (duplicateRows.length > 0) {
        const error = new Error('An active booking already exists for this email and tour time.');
        error.status = 409;
        throw error;
      }

      const total = Number(slot.price_minor) * guests;
      if (total > 4294967295) {
        const error = new Error('The selected booking total is too large.');
        error.status = 400;
        throw error;
      }
      const reference = randomUUID();
      await connection.execute(
        'UPDATE tour_slots SET reserved_guests = reserved_guests + ? WHERE id = ?',
        [guests, Number(data.slotId)],
      );
      await connection.execute(
        `INSERT INTO bookings
          (reference, idempotency_key, tour_id, slot_id, first_name, last_name, email, phone,
           guest_count, dietary_requirements, notes, total_minor, currency, status, cancellation_token_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
        [
          reference, key, Number(data.tourId), Number(data.slotId),
          data.firstName.trim(), data.lastName.trim(), data.email.trim().toLowerCase(),
          data.phone.trim(), guests, data.dietaryRequirements.trim(), data.notes.trim() || null,
          total, slot.currency, hashToken(data.cancellationToken),
        ],
      );
      return {
        reference,
        tourName: slot.name,
        startsAt: mysqlDateTimeToIso(slot.starts_at),
        guestCount: guests,
        totalMinor: total,
        currency: slot.currency,
        status: 'pending',
        firstName: data.firstName.trim(),
        email: data.email.trim().toLowerCase(),
      };
    });
  } catch (error) {
    console.error('Could not reserve tour slot:', error.message);
    const transientConflict = error.code === 'ER_LOCK_DEADLOCK' || error.code === 'ER_LOCK_WAIT_TIMEOUT';
    const status = error.status || (transientConflict ? 503 : error.code === 'ER_DUP_ENTRY' ? 409 : 500);
    response.status(status).json({
      message: error.status
        ? error.message
        : transientConflict
          ? 'The booking service is busy. Please retry your reservation.'
          : error.code === 'ER_DUP_ENTRY'
            ? 'This booking request was already processed. Refresh availability and try again.'
            : 'Your reservation could not be saved. Please try again later.',
    });
    return;
  }

  if (!booking.duplicate) {
    const cancellationUrl = `${appBaseUrl}/#booking-confirm?reference=${booking.reference}&token=${encodeURIComponent(data.cancellationToken)}`;
    try {
      const mailed = await sendNotification({
        to: booking.email,
        subject: `Tour request received — ${booking.tourName}`,
        text: `Thank you, ${booking.firstName}. Your request for ${booking.tourName} on ${booking.startsAt} is pending confirmation. Reference: ${booking.reference}. You may cancel it before the configured ${cancellationHours}-hour cutoff here: ${cancellationUrl}`,
      });
      booking.notificationSent = mailed;
    } catch (error) {
      console.error('Could not send booking request notification:', error.message);
      booking.notificationSent = false;
    }
  }
  response.status(booking.duplicate ? 200 : 201).json({
    reference: booking.reference,
    tourName: booking.tourName || null,
    startsAt: booking.startsAt || null,
    guestCount: booking.guestCount || null,
    totalMinor: booking.totalMinor || null,
    currency: booking.currency || null,
    status: booking.status || 'pending',
    notificationSent: booking.notificationSent || false,
    cancellationToken: data.cancellationToken,
    cancellationHours,
  });
});

router.get('/bookings/:reference', async (request, response) => {
  const { reference } = request.params;
  const token = request.query.token;
  if (!/^[0-9a-f-]{36}$/i.test(reference) || typeof token !== 'string' || !/^[0-9a-f-]{36}$/i.test(token)) {
    response.status(404).json({ message: 'Booking not found.' });
    return;
  }
  try {
    const [rows] = await getPool().execute(
      `SELECT b.reference, b.first_name AS firstName, b.guest_count AS guestCount,
        b.total_minor AS totalMinor, b.currency, b.status, b.created_at AS createdAt,
        t.name AS tourName, s.starts_at AS startsAt
       FROM bookings b
       JOIN tours t ON t.id = b.tour_id
       JOIN tour_slots s ON s.id = b.slot_id
       WHERE b.reference = ? AND b.cancellation_token_hash = ?`,
      [reference, hashToken(token)],
    );
    if (!rows[0]) {
      response.status(404).json({ message: 'Booking not found.' });
      return;
    }
    response.json({ ...rows[0], startsAt: mysqlDateTimeToIso(rows[0].startsAt), cancellationHours });
  } catch (error) {
    console.error('Could not load booking confirmation:', error.message);
    response.status(500).json({ message: 'Your booking details could not be loaded.' });
  }
});

router.post('/bookings/:reference/cancel', async (request, response) => {
  const { reference } = request.params;
  const { email, cancellationToken } = request.body ?? {};
  if (!/^[0-9a-f-]{36}$/i.test(reference) || !validEmail(email)
    || !/^[0-9a-f-]{36}$/i.test(cancellationToken || '')) {
    response.status(404).json({ message: 'Booking not found or cancellation access is invalid.' });
    return;
  }
  try {
    const booking = await inTransaction(async (connection) => {
      const [rows] = await connection.execute(
        'SELECT id, slot_id, email, cancellation_token_hash, status, guest_count FROM bookings WHERE reference = ? FOR UPDATE',
        [reference],
      );
      const row = rows[0];
      if (!row || row.email !== email.trim().toLowerCase() || !safeTokenMatch(row.cancellation_token_hash, cancellationToken)) {
        const error = new Error('Booking not found or cancellation access is invalid.');
        error.status = 404;
        throw error;
      }
      if (row.status === 'cancelled') {
        const error = new Error('This booking has already been cancelled.');
        error.status = 409;
        throw error;
      }

      const [slots] = await connection.execute(
        'SELECT id, starts_at, capacity, reserved_guests FROM tour_slots WHERE id = ? FOR UPDATE',
        [row.slot_id],
      );
      const slot = slots[0];
      const startsAt = new Date(mysqlDateTimeToIso(slot.starts_at)).valueOf();
      const cutoff = startsAt - cancellationHours * 60 * 60 * 1000;
      if (Date.now() > cutoff) {
        const error = new Error(`This booking can only be cancelled at least ${cancellationHours} hours before the tour.`);
        error.status = 409;
        throw error;
      }

      await connection.execute("UPDATE bookings SET status = 'cancelled' WHERE id = ?", [row.id]);
      const [updatedSlots] = await connection.execute(
        'UPDATE tour_slots SET reserved_guests = reserved_guests - ? WHERE id = ? AND reserved_guests >= ?',
        [Number(row.guest_count), slot.id, Number(row.guest_count)],
      );
      if (updatedSlots.affectedRows !== 1) throw new Error('Tour seat availability is inconsistent.');
      return { email: row.email };
    });
    try {
      await sendNotification({
        to: booking.email,
        subject: `Tour cancellation received — ${reference}`,
        text: `Your tour booking ${reference} has been cancelled.`,
      });
    } catch (error) {
      console.error('Could not send cancellation notification:', error.message);
    }
    response.json({ reference, status: 'cancelled' });
  } catch (error) {
    response.status(error.status || 500).json({
      message: error.status ? error.message : 'Your booking could not be cancelled. Please try again.',
    });
  }
});

adminRouter.get('/tours', async (_request, response) => {
  try {
    response.json(await loadTours({ includeInactive: true }));
  } catch (error) {
    console.error('Could not load admin tours:', error.message);
    response.status(500).json({ message: 'Tour management could not be loaded.' });
  }
});

adminRouter.post('/tours', async (request, response) => {
  const { name, description, price, durationMinutes, minimumGuests, maximumGuests, currency = defaultCurrency } = request.body ?? {};
  const priceMinor = Number.isSafeInteger(price) ? price : typeof price === 'string' ? parseDecimalPrice(price) : null;
  if (
    typeof name !== 'string' || !name.trim() || name.length > 150 ||
    typeof description !== 'string' || !description.trim() || description.length > 3000 ||
    priceMinor === null || priceMinor < 0 || priceMinor > 4294967295 ||
    !Number.isSafeInteger(durationMinutes) || durationMinutes < 15 || durationMinutes > 1440 ||
    !Number.isSafeInteger(minimumGuests) || minimumGuests < 1 || minimumGuests > 50 ||
    !Number.isSafeInteger(maximumGuests) || maximumGuests < minimumGuests || maximumGuests > 50 ||
    typeof currency !== 'string' || !/^[A-Z]{3}$/.test(currency)
  ) {
    response.status(400).json({ message: 'Enter valid tour details, price, duration, and guest limits.' });
    return;
  }
  try {
    const [result] = await getPool().execute(
      `INSERT INTO tours (name, description, price_minor, currency, duration_minutes, minimum_guests, maximum_guests)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [name.trim(), description.trim(), priceMinor, currency, durationMinutes, minimumGuests, maximumGuests],
    );
    response.status(201).json({ id: result.insertId });
  } catch (error) {
    console.error('Could not add tour:', error.message);
    response.status(500).json({ message: 'Tour could not be saved.' });
  }
});

function parseDecimalPrice(value) {
  if (typeof value !== 'string' || !/^\d{1,8}(?:\.\d{1,2})?$/.test(value)) return null;
  try {
    const [whole, fraction = ''] = value.split('.');
    return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  } catch {
    return null;
  }
}

adminRouter.patch('/tours/:id', async (request, response) => {
  const tourId = Number(request.params.id);
  const { active } = request.body ?? {};
  if (!Number.isSafeInteger(tourId) || tourId < 1 || typeof active !== 'boolean') {
    response.status(400).json({ message: 'Choose a valid tour and availability setting.' });
    return;
  }
  try {
    const [result] = await getPool().execute('UPDATE tours SET active = ? WHERE id = ?', [active, tourId]);
    response.status(result.affectedRows ? 200 : 404).json(
      result.affectedRows ? { id: tourId, active } : { message: 'Tour not found.' },
    );
  } catch (error) {
    console.error('Could not update tour:', error.message);
    response.status(500).json({ message: 'Tour availability could not be updated.' });
  }
});

adminRouter.post('/tours/:id/slots', async (request, response) => {
  const tourId = Number(request.params.id);
  const { startsAt, capacity } = request.body ?? {};
  if (!Number.isSafeInteger(tourId) || tourId < 1 || !validDateTime(startsAt)
    || !Number.isSafeInteger(capacity) || capacity < 1 || capacity > 500) {
    response.status(400).json({ message: 'Choose a future date and time and a capacity between 1 and 500.' });
    return;
  }
  try {
    const [toursFound] = await getPool().execute('SELECT id FROM tours WHERE id = ? AND active = 1', [tourId]);
    if (toursFound.length === 0) {
      response.status(404).json({ message: 'An active tour is required to add an available time.' });
      return;
    }
    const [result] = await getPool().execute(
      'INSERT INTO tour_slots (tour_id, starts_at, capacity) VALUES (?, ?, ?)',
      [tourId, toMysqlDateTime(startsAt), capacity],
    );
    response.status(201).json({ id: result.insertId });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      response.status(409).json({ message: 'An availability slot already exists for that tour and time.' });
      return;
    }
    console.error('Could not add tour availability:', error.message);
    response.status(500).json({ message: 'Tour availability could not be saved.' });
  }
});

adminRouter.patch('/tour-slots/:id', async (request, response) => {
  const slotId = Number(request.params.id);
  const { active, capacity } = request.body ?? {};
  if (!Number.isSafeInteger(slotId) || slotId < 1 || typeof active !== 'boolean'
    || !Number.isSafeInteger(capacity) || capacity < 1 || capacity > 500) {
    response.status(400).json({ message: 'Choose valid slot availability and capacity.' });
    return;
  }
  try {
    const result = await inTransaction(async (connection) => {
      const [slots] = await connection.execute(
        'SELECT id, reserved_guests FROM tour_slots WHERE id = ? FOR UPDATE',
        [slotId],
      );
      if (!slots[0]) return 'not-found';
      if (capacity < Number(slots[0].reserved_guests)) return 'capacity-too-low';
      await connection.execute('UPDATE tour_slots SET active = ?, capacity = ? WHERE id = ?', [active, capacity, slotId]);
      return 'updated';
    });
    if (result === 'not-found') {
      response.status(404).json({ message: 'Availability slot not found.' });
      return;
    }
    if (result === 'capacity-too-low') {
      response.status(409).json({ message: 'Capacity cannot be lower than the number of already reserved guests.' });
      return;
    }
    response.json({ id: slotId, active, capacity });
  } catch (error) {
    console.error('Could not update tour availability:', error.message);
    response.status(500).json({ message: 'Tour availability could not be updated.' });
  }
});

adminRouter.get('/bookings', async (_request, response) => {
  try {
    const [bookings] = await getPool().execute(
      `SELECT b.id, b.reference, b.first_name AS firstName, b.last_name AS lastName,
        b.email, b.phone, b.guest_count AS guestCount, b.dietary_requirements AS dietaryRequirements,
        b.notes, b.total_minor AS totalMinor, b.currency, b.status,
        b.created_at AS createdAt, t.name AS tourName, s.starts_at AS startsAt
       FROM bookings b
       JOIN tours t ON t.id = b.tour_id
       JOIN tour_slots s ON s.id = b.slot_id
       ORDER BY s.starts_at DESC
       LIMIT 500`,
    );
    response.json(bookings.map((booking) => ({ ...booking, startsAt: mysqlDateTimeToIso(booking.startsAt) })));
  } catch (error) {
    console.error('Could not load admin bookings:', error.message);
    response.status(500).json({ message: 'Bookings could not be loaded.' });
  }
});

adminRouter.patch('/bookings/:id/status', async (request, response) => {
  const bookingId = Number(request.params.id);
  const { status } = request.body ?? {};
  if (!Number.isSafeInteger(bookingId) || bookingId < 1 || !['pending', 'confirmed', 'cancelled'].includes(status)) {
    response.status(400).json({ message: 'Choose a valid booking and status.' });
    return;
  }
  try {
    const result = await inTransaction(async (connection) => {
      const [bookingRows] = await connection.execute(
        'SELECT id, reference, slot_id, email, first_name AS firstName, guest_count AS guestCount, status FROM bookings WHERE id = ? FOR UPDATE',
        [bookingId],
      );
      const booking = bookingRows[0];
      if (!booking) return { error: 'not-found' };
      if (booking.status === status) return { booking };
      const [slotRows] = await connection.execute(
        'SELECT id, capacity, reserved_guests FROM tour_slots WHERE id = ? FOR UPDATE',
        [booking.slot_id],
      );
      const slot = slotRows[0];
      const wasReserved = booking.status !== 'cancelled';
      const becomesReserved = status !== 'cancelled';
      if (!wasReserved && becomesReserved && Number(slot.capacity) - Number(slot.reserved_guests) < Number(booking.guestCount)) {
        return { error: 'no-capacity' };
      }
      if (wasReserved !== becomesReserved) {
        const delta = Number(booking.guestCount) * (becomesReserved ? 1 : -1);
        await connection.execute('UPDATE tour_slots SET reserved_guests = reserved_guests + ? WHERE id = ?', [delta, slot.id]);
      }
      await connection.execute('UPDATE bookings SET status = ? WHERE id = ?', [status, bookingId]);
      return { booking: { ...booking, status }, changed: true };
    });

    if (result.error === 'not-found') {
      response.status(404).json({ message: 'Booking not found.' });
      return;
    }
    if (result.error === 'no-capacity') {
      response.status(409).json({ message: 'The available slot no longer has enough capacity to reactivate this booking.' });
      return;
    }
    if (result.changed) {
      try {
        await sendNotification({
          to: result.booking.email,
          subject: `Tour booking ${status} — ${result.booking.reference}`,
          text: `Hello ${result.booking.firstName}, your tour booking ${result.booking.reference} is now ${status}.`,
        });
      } catch (error) {
        console.error('Could not send booking status notification:', error.message);
      }
    }
    response.json({ id: bookingId, status: result.booking.status });
  } catch (error) {
    console.error('Could not update booking status:', error.message);
    response.status(500).json({ message: 'Booking status could not be updated.' });
  }
});

export default router;
export { adminRouter as adminToursRouter };
