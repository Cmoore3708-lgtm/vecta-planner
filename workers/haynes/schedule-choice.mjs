import { HaynesError } from '../../lib/haynes-vehicle.js';

// Match extended supplier labels without treating build ranges as interchangeable.
export function normalSchedules(options) {
  const seen = new Set();
  return options.filter(option => {
    const label = String(option.label || '').replace(/\s+/g, ' ').trim();
    const system = String(option.value || '').split(',')[0];
    if (!/^Normal conditions\b/i.test(label) || !/\(United Kingdom\)\s*$/i.test(label) || !/^ms_\d+$/.test(system) || seen.has(option.value)) return false;
    seen.add(option.value);
    return true;
  }).map(option => ({ value: option.value, label: String(option.label).replace(/\s+/g, ' ').trim(), system: String(option.value).split(',')[0] }));
}

export async function chooseSchedule(options, vehicle, choose) {
  const choices = normalSchedules(options);
  if (!choices.length) throw new HaynesError('SCHEDULE_REQUIRED');
  if (choices.length === 1) return choices[0];
  if (!choose) throw new HaynesError('SCHEDULE_REQUIRED');
  const value = await choose(choices, vehicle);
  const selected = choices.find(option => option.value === value);
  if (!selected) throw new HaynesError('SCHEDULE_REQUIRED');
  return selected;
}
