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

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}
