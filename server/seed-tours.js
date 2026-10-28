import 'dotenv/config';
import { closePool, getPool } from './db.js';
import { getUpcomingSlots, tourListings } from './tour-schedule.js';

const timeZone = process.env.BUSINESS_TIME_ZONE || 'America/Chicago';

async function seedTours() {
  const pool = getPool();
  const connection = await pool.getConnection();
  let createdTours = 0;
  let createdSlots = 0;

  try {
    await connection.beginTransaction();
    for (const listing of tourListings) {
      const [existing] = await connection.execute(
        'SELECT id, active FROM tours WHERE name = ? LIMIT 1',
        [listing.name],
      );
      let tourId = existing[0]?.id;

      if (!existing[0]) {
        const [result] = await connection.execute(
          `INSERT INTO tours
            (name, description, price_minor, currency, duration_minutes, minimum_guests, maximum_guests)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            listing.name,
            listing.description,
            listing.priceMinor,
            listing.currency,
            listing.durationMinutes,
            listing.minimumGuests,
            listing.maximumGuests,
          ],
        );
        tourId = result.insertId;
        createdTours += 1;
      } else if (!existing[0].active) {
        console.log(`Skipped inactive tour "${listing.name}".`);
        continue;
      }

      for (const startsAt of getUpcomingSlots(listing, { timeZone })) {
        const mysqlDateTime = startsAt.toISOString().slice(0, 19).replace('T', ' ');
        const [result] = await connection.execute(
          'INSERT IGNORE INTO tour_slots (tour_id, starts_at, capacity) VALUES (?, ?, ?)',
          [tourId, mysqlDateTime, listing.capacity],
        );
        createdSlots += result.affectedRows;
      }
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  console.log(`Tour schedule ready in ${timeZone}: ${createdTours} new tours and ${createdSlots} new bookable time slots.`);
  console.log('Existing tour details, reservations, and availability were left unchanged.');
}

try {
  await seedTours();
} catch (error) {
  console.error('Tour schedules could not be created:', error.message);
  process.exitCode = 1;
} finally {
  await closePool();
}
