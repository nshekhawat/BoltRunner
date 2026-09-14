// Worker: computes noise fields off the main thread (see noise.js). Module worker with no bare imports, so no import map is needed.
import { computeNoise } from './noise.js';
onmessage = e => { const { key, size, opts } = e.data; const data = computeNoise(size, opts); postMessage({ key, data }, [data.buffer]); };
