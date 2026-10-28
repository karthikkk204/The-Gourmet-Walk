const tourListings = [
  {
    name: 'Chicago Neighborhood Tasting Walk',
    description: 'Enjoy a guided small-group stroll with thoughtfully chosen savory tastings and stories about Chicago food culture. Stops may vary by season; your confirmed meeting details are shared after reservation.',
    priceMinor: 8900,
    currency: 'USD',
    durationMinutes: 180,
    minimumGuests: 1,
    maximumGuests: 8,
    capacity: 8,
    weekday: 6,
    hour: 10,
    minute: 0,
  },
  {
    name: 'West Loop Market & Tasting Walk',
    description: 'Explore the West Loop through a guided neighborhood walk and a selection of market-inspired bites. Stops may vary by season; your confirmed meeting details are shared after reservation.',
    priceMinor: 9900,
    currency: 'USD',
    durationMinutes: 180,
    minimumGuests: 1,
    maximumGuests: 8,
    capacity: 8,
    weekday: 6,
    hour: 14,
    minute: 0,
  },
  {
    name: 'Chicago Pastry & Coffee Walk',
    description: 'Spend a relaxed morning discovering neighborhood coffee and pastry favorites on a guided small-group walk. Stops may vary by season; your confirmed meeting details are shared after reservation.',
    priceMinor: 6900,
    currency: 'USD',
    durationMinutes: 120,
    minimumGuests: 1,
    maximumGuests: 8,
    capacity: 8,
    weekday: 0,
    hour: 10,
    minute: 30,
  },
];

function getZonedParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  return Object.fromEntries(parts
    .filter(({ type }) => type !== 'literal')
    .map(({ type, value }) => [type, Number(value)]));
}

function zonedDateTimeToUtc({ year, month, day, hour, minute }, timeZone) {
  const target = Date.UTC(year, month - 1, day, hour, minute);
  let timestamp = target;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const observed = getZonedParts(new Date(timestamp), timeZone);
    const observedAsUtc = Date.UTC(
      observed.year,
      observed.month - 1,
      observed.day,
      observed.hour,
      observed.minute,
      observed.second,
    );
    const nextTimestamp = timestamp + target - observedAsUtc;
    if (nextTimestamp === timestamp) break;
    timestamp = nextTimestamp;
  }

  const resolved = getZonedParts(new Date(timestamp), timeZone);
  if (resolved.year !== year || resolved.month !== month || resolved.day !== day
    || resolved.hour !== hour || resolved.minute !== minute) {
    throw new RangeError(`The requested local time does not exist in ${timeZone}.`);
  }
  return new Date(timestamp);
}

function getUpcomingSlots(listing, { now = new Date(), timeZone = 'America/Chicago', days = 42 } = {}) {
  const today = getZonedParts(now, timeZone);
  const start = Date.UTC(today.year, today.month - 1, today.day);
  const slots = [];

  for (let offset = 0; offset < days; offset += 1) {
    const day = new Date(start + offset * 24 * 60 * 60 * 1000);
    if (day.getUTCDay() !== listing.weekday) continue;

    const startsAt = zonedDateTimeToUtc({
      year: day.getUTCFullYear(),
      month: day.getUTCMonth() + 1,
      day: day.getUTCDate(),
      hour: listing.hour,
      minute: listing.minute,
    }, timeZone);
    if (startsAt > now) slots.push(startsAt);
  }

  return slots;
}

export { getUpcomingSlots, tourListings, zonedDateTimeToUtc };
