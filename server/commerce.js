export function toMinorUnits(value) {
  const match = String(value).match(/^(\d+)(?:\.(\d{1,2}))?$/);
  if (!match) throw new Error('Expected a non-negative amount with at most two decimal places.');
  const amount = Number(match[1]) * 100 + Number((match[2] || '').padEnd(2, '0') || 0);
  if (!Number.isSafeInteger(amount) || amount > 4294967295) {
    throw new Error('The amount exceeds the supported order limit.');
  }
  return amount;
}

export function fromMinorUnits(value) {
  return (value / 100).toFixed(2);
}

export function calculateOrderTotals(items, { taxRate = 0, shippingFee = 0, freeShippingThreshold = null } = {}) {
  const subtotal = items.reduce((total, item) => total + item.unitPrice * item.quantity, 0);
  const tax = Math.round(subtotal * taxRate);
  const threshold = freeShippingThreshold === null ? null : toMinorUnits(freeShippingThreshold);
  const shipping = threshold !== null && subtotal >= threshold ? 0 : toMinorUnits(shippingFee);
  const total = subtotal + tax + shipping;
  if ([subtotal, tax, shipping, total].some((amount) => !Number.isSafeInteger(amount) || amount > 4294967295)) {
    throw new Error('The order total exceeds the supported limit.');
  }
  return { subtotal, tax, shipping, total };
}

export function normalizeCartItems(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 50) {
    throw new Error('Add between 1 and 50 distinct products to your cart.');
  }
  const merged = new Map();
  for (const item of value) {
    if (!item || typeof item.id !== 'string' || !/^p[0-9]{1,6}$/.test(item.id)) {
      throw new Error('Your cart contains an invalid product.');
    }
    if (!Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 20) {
      throw new Error('Product quantities must be between 1 and 20.');
    }
    const quantity = (merged.get(item.id) || 0) + item.quantity;
    if (quantity > 20) throw new Error('A product quantity cannot exceed 20.');
    merged.set(item.id, quantity);
  }
  return [...merged].map(([id, quantity]) => ({ id, quantity }));
}

export function validateAddress(address) {
  const fields = ['firstName', 'lastName', 'email', 'phone', 'addressLine1', 'city', 'region', 'postalCode', 'country'];
  if (!address || fields.some((field) => typeof address[field] !== 'string')) return 'Complete all customer and delivery details.';
  if (!address.firstName.trim() || !address.lastName.trim() || !address.addressLine1.trim()
    || !address.city.trim() || !address.region.trim() || !address.postalCode.trim() || !address.country.trim()) {
    return 'Complete all customer and delivery details.';
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address.email.trim()) || address.email.length > 254) {
    return 'Enter a valid email address.';
  }
  if (address.phone.trim().length < 7 || address.phone.length > 40) return 'Enter a valid phone number.';
  if (fields.some((field) => address[field].length > (field === 'email' ? 254 : field === 'addressLine1' ? 200 : 100))) {
    return 'One or more delivery fields are too long.';
  }
  return null;
}

export function normalizeGuestCount(value, limits) {
  const guests = Number(value);
  if (!Number.isSafeInteger(guests) || guests < limits.minimum || guests > limits.maximum) {
    throw new Error(`Guest count must be between ${limits.minimum} and ${limits.maximum}.`);
  }
  return guests;
}
