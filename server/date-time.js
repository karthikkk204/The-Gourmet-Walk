function mysqlDateTimeToIso(value) {
  if (!value) return null;
  if (value instanceof Date) {
    if (!Number.isFinite(value.valueOf())) throw new RangeError('Database returned an invalid date and time.');
    return value.toISOString();
  }
  if (typeof value !== 'string') throw new TypeError('Database returned an unsupported date and time.');
  const normalized = value.replace(' ', 'T').replace(/\.\d{1,3}$/, '');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(normalized)) {
    throw new RangeError('Database returned an invalid date and time.');
  }
  return `${normalized}Z`;
}

export { mysqlDateTimeToIso };
