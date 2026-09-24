export const formatMoney = (value, currency = 'INR') =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value);

export const formatMoneyRange = (low, high, currency = 'INR') =>
  (low == null || high == null ? null : `${formatMoney(low, currency)}–${formatMoney(high, currency)}`);
