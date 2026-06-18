export type WeightUnit = 'lb' | 'kg';
export type VolumeUnit = 'oz' | 'ml';
export type LengthUnit = 'ft' | 'cm';

export function toKg(value: number, unit: WeightUnit): number {
  return unit === 'lb' ? value * 0.453592 : value;
}
export function fromKg(value: number, unit: WeightUnit): number {
  return unit === 'lb' ? value / 0.453592 : value;
}
export function convertWeight(value: number, from: WeightUnit, to: WeightUnit): number {
  if (from === to) return value;
  return from === 'lb' ? value * 0.453592 : value / 0.453592;
}

export function toCm(value: number, unit: LengthUnit): number {
  return unit === 'ft' ? value * 30.48 : value;
}
export function fromCm(value: number, unit: LengthUnit): number {
  return unit === 'ft' ? value / 30.48 : value;
}

export function toMl(value: number, unit: VolumeUnit): number {
  return unit === 'oz' ? value * 29.5735 : value;
}

export function displayWeight(value: number, unit: WeightUnit, decimals = 1): string {
  return `${value.toFixed(decimals)} ${unit}`;
}

export function displayHeight(value: number, unit: LengthUnit): string {
  if (unit === 'ft') {
    const ft = Math.floor(value);
    const inches = Math.round((value - ft) * 12);
    return `${ft}'${inches}"`;
  }
  return `${Math.round(value)} cm`;
}

// SQLite stores local time without TZ offset using a space separator.
// new Date('YYYY-MM-DD HH:MM:SS') is implementation-defined (may parse as UTC in some browsers).
// Replacing the space with T produces ISO 8601 form which ES2015+ specifies as LOCAL time
// when no TZ offset is present, making this consistent everywhere.
export function parseSQLiteLocal(s: string): Date {
  // All timestamps stored as UTC in SQLite; append 'Z' so JS parses as UTC, not local time.
  return new Date(s.replace(' ', 'T') + 'Z');
}

export const UNIT_TO_G: Record<string, number> = {
  g: 1, ml: 1, oz: 28.35, cup: 240, tbsp: 15, tsp: 5,
};

export const MASS_VOL_UNITS = ['g', 'oz', 'cup', 'tbsp', 'tsp', 'ml'];

// Convert a quantity from one unit to another (only works for mass/volume units)
export function convertToServingUnit(value: number, fromUnit: string, toUnit: string): number {
  if (fromUnit === toUnit || !value) return value;
  const fromG = UNIT_TO_G[fromUnit];
  const toG = UNIT_TO_G[toUnit];
  if (fromG !== undefined && toG !== undefined) {
    return Math.round((value * fromG / toG) * 100) / 100;
  }
  return value;
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  if (m > 0) return s > 0 ? `${m}m ${s}s` : `${m}m`;
  return `${s}s`;
}
