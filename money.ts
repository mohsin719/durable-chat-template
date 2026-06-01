const MINOR_UNITS_PER_PKR = 100;

/**
 * Convert PKR amount (major units) to minor units (stored integer).
 * Example: 30.5 PKR -> 3050
 */
export function pkrToMinorUnits(amountPkr: number): number {
  return Math.round(amountPkr * MINOR_UNITS_PER_PKR);
}

/**
 * Convert stored minor units to PKR major units.
 * Example: 3050 -> 30.5 PKR
 */
export function minorUnitsToPkr(amountMinor: number): number {
  return Number((amountMinor / MINOR_UNITS_PER_PKR).toFixed(2));
}
