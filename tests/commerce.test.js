import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateOrderTotals,
  normalizeCartItems,
  normalizeGuestCount,
  toMinorUnits,
  validateAddress,
} from '../server/commerce.js';
import { mysqlDateTimeToIso } from '../server/date-time.js';
import { getUpcomingSlots, zonedDateTimeToUtc } from '../server/tour-schedule.js';

test('checkout totals calculate tax and free-shipping thresholds in minor units', () => {
  const items = [{ unitPrice: 1250, quantity: 2 }];

  assert.deepEqual(calculateOrderTotals(items, {
    taxRate: 0.1,
    shippingFee: '5.00',
    freeShippingThreshold: '30.00',
  }), { subtotal: 2500, tax: 250, shipping: 500, total: 3250 });
  assert.deepEqual(calculateOrderTotals(items, {
    taxRate: 0.1,
    shippingFee: '5.00',
    freeShippingThreshold: '25.00',
  }), { subtotal: 2500, tax: 250, shipping: 0, total: 2750 });
});

test('cart normalization merges duplicate products and enforces quantity limits', () => {
  assert.deepEqual(normalizeCartItems([
    { id: 'p1', quantity: 2 },
    { id: 'p1', quantity: 3 },
    { id: 'p12', quantity: 1 },
  ]), [
    { id: 'p1', quantity: 5 },
    { id: 'p12', quantity: 1 },
  ]);
  assert.throws(() => normalizeCartItems([{ id: 'p1', quantity: 21 }]), /quantities must be between/);
  assert.throws(() => normalizeCartItems([{ id: 'x1', quantity: 1 }]), /invalid product/);
});

test('amounts reject values with unsupported precision or negative values', () => {
  assert.equal(toMinorUnits('12.34'), 1234);
  assert.throws(() => toMinorUnits('-1.00'));
  assert.throws(() => toMinorUnits('1.234'));
});

test('tour guest counts respect configured limits', () => {
  assert.equal(normalizeGuestCount('3', { minimum: 1, maximum: 8 }), 3);
  assert.throws(() => normalizeGuestCount(0, { minimum: 1, maximum: 8 }), /between 1 and 8/);
  assert.throws(() => normalizeGuestCount(9, { minimum: 1, maximum: 8 }), /between 1 and 8/);
});

test('Chicago tour schedules retain local start times across the daylight-saving transition', () => {
  assert.equal(
    zonedDateTimeToUtc({ year: 2026, month: 10, day: 31, hour: 10, minute: 0 }, 'America/Chicago').toISOString(),
    '2026-10-31T15:00:00.000Z',
  );
  assert.equal(
    zonedDateTimeToUtc({ year: 2026, month: 11, day: 1, hour: 10, minute: 0 }, 'America/Chicago').toISOString(),
    '2026-11-01T16:00:00.000Z',
  );
  assert.throws(
    () => zonedDateTimeToUtc({ year: 2026, month: 3, day: 8, hour: 2, minute: 30 }, 'America/Chicago'),
    /does not exist/,
  );
});

test('upcoming tour slots include future local weekends and exclude past start times', () => {
  const slots = getUpcomingSlots({
    weekday: 6,
    hour: 10,
    minute: 0,
  }, {
    now: new Date('2026-10-28T12:00:00.000Z'),
    timeZone: 'America/Chicago',
    days: 15,
  });

  assert.deepEqual(slots.map((slot) => slot.toISOString()), [
    '2026-10-31T15:00:00.000Z',
    '2026-11-07T16:00:00.000Z',
  ]);
});

test('MySQL tour timestamps serialize as valid UTC for JavaScript clients', () => {
  assert.equal(
    mysqlDateTimeToIso(new Date('2026-10-31T15:00:00.000Z')),
    '2026-10-31T15:00:00.000Z',
  );
  assert.equal(
    mysqlDateTimeToIso('2026-10-31 15:00:00.000'),
    '2026-10-31T15:00:00Z',
  );
  assert.throws(() => mysqlDateTimeToIso('not a timestamp'), /invalid date and time/);
});

test('checkout address validation requires valid customer and delivery details', () => {
  const address = {
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada@example.com',
    phone: '+44123456789',
    addressLine1: '12 Market Street',
    city: 'London',
    region: 'London',
    postalCode: 'SW1A 1AA',
    country: 'United Kingdom',
  };
  assert.equal(validateAddress(address), null);
  assert.equal(validateAddress({ ...address, email: 'invalid' }), 'Enter a valid email address.');
  assert.equal(validateAddress({ ...address, city: ' ' }), 'Complete all customer and delivery details.');
});
