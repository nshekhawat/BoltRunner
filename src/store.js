// Persistence: one JSON blob under a versioned key. Bump CONFIG.STORAGE_KEY to reset everyone's saves.
import { CONFIG as C } from './config.js';
const defaults = { best: 0, bestTime: 0, mute: false, mode: C.DIFFICULTY_DEFAULT, quality: null };
export const store = { ...defaults };
try { Object.assign(store, JSON.parse(localStorage.getItem(C.STORAGE_KEY) || '{}')); } catch { /* corrupt or blocked storage: run with defaults */ }
export function save() { try { localStorage.setItem(C.STORAGE_KEY, JSON.stringify(store)); } catch { /* private mode etc. */ } }
