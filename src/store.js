// Persistence: one JSON blob under a versioned key. Bump CONFIG.STORAGE_KEY to reset everyone's saves.
import { CONFIG as C } from './config.js';
const defaults = { best: 0, bestTime: 0, mute: false, mode: C.DIFFICULTY_DEFAULT, quality: null, records: {}, biome: 'desert', lifetime: { distance: 0, runs: 0, cleared: {}, biomeRuns: {}, combo: 0, powers: 0, night: 0 }, ghosts: {} }; // records: per biome (+ 'journey') { best, bestTime, cleared, combo }; ghosts: best-run y samples per key
export const store = { ...defaults };
try { const j = JSON.parse(localStorage.getItem(C.STORAGE_KEY) || '{}'); Object.assign(store, j); store.lifetime = { ...defaults.lifetime, ...(j.lifetime ?? {}) }; store.records = j.records ?? {}; store.ghosts = j.ghosts ?? {}; } catch { /* corrupt or blocked storage: run with defaults */ }
export function save() { try { localStorage.setItem(C.STORAGE_KEY, JSON.stringify(store)); } catch { /* private mode etc. */ } }
