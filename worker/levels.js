export const AI_MODES = Object.freeze({
  Fast: { cost: 10, minLevel: 'BASE' },
  Deep: { cost: 100, minLevel: 'PLUS' },
  Maximum: { cost: 500, minLevel: 'PRO' },
});

export const LEVELS = Object.freeze([
  { id: 'BASE', name: 'BASE', minDeposit: 2000, signalLimit: 3, creditsLimit: 30, availableAiModes: ['Fast'], color: '#B2BDD0' },
  { id: 'PLUS', name: 'PLUS', minDeposit: 5000, signalLimit: 10, creditsLimit: 300, availableAiModes: ['Fast', 'Deep'], color: '#5796FF' },
  { id: 'PRO', name: 'PRO', minDeposit: 7500, signalLimit: 30, creditsLimit: 1000, availableAiModes: ['Fast', 'Deep', 'Maximum'], color: '#B58AFF' },
  { id: 'ADVANCED', name: 'ADVANCED', minDeposit: 10000, signalLimit: 70, creditsLimit: 3000, availableAiModes: ['Fast', 'Deep', 'Maximum'], color: '#FF788B' },
  { id: 'ULTRA', name: 'ULTRA', minDeposit: 20000, signalLimit: null, creditsLimit: 10000, availableAiModes: ['Fast', 'Deep', 'Maximum'], color: '#F6C75D' },
]);

export function levelFor(cents) { return [...LEVELS].reverse().find(level => cents >= level.minDeposit) || null; }
export function levelNamed(name) { return LEVELS.find(level => level.id === name) || null; }
