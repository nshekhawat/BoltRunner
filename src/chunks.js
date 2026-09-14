// Authored level chunks. A chunk is a short pattern of archetypes with time-domain gaps (units of MIN_GAP_TIME, so 1.0 = the minimum
// clearable spacing at any speed; the first gap is measured from the previous chunk's last obstacle). Every chunk carries a difficulty
// 1–10 and the skill it exercises: jump (one clean jump), timing (a jump whose moment matters), rhythm (a run of jumps in tempo).
// Hitboxes and physics are identical in every world, so one library serves all four; a world can weight skills (chunkWeights).
export const SKILLS = ['jump', 'timing', 'rhythm'];
export const CHUNKS = [
  { id: 'lone-small',     diff: 1,  skill: 'jump',   items: [['small', 1.6]] },
  { id: 'lone-tall',      diff: 1,  skill: 'jump',   items: [['tall', 1.6]] },
  { id: 'small-pair',     diff: 2,  skill: 'rhythm', items: [['small', 1.4], ['small', 1.3]] },
  { id: 'tall-pair',      diff: 2,  skill: 'rhythm', items: [['tall', 1.4], ['tall', 1.4]] },
  { id: 'small-tall',     diff: 2,  skill: 'timing', items: [['small', 1.3], ['tall', 1.2]] },
  { id: 'tall-small',     diff: 2,  skill: 'timing', items: [['tall', 1.3], ['small', 1.2]] },
  { id: 'triple-small',   diff: 3,  skill: 'rhythm', items: [['small', 1.3], ['small', 1.1], ['small', 1.1]] },
  { id: 'wide-solo',      diff: 3,  skill: 'jump',   items: [['wide', 1.5]] },
  { id: 'wide-small',     diff: 4,  skill: 'timing', items: [['wide', 1.4], ['small', 1.3]] },
  { id: 'small-wide',     diff: 4,  skill: 'timing', items: [['small', 1.3], ['wide', 1.3]] },
  { id: 'tall-run',       diff: 4,  skill: 'rhythm', items: [['tall', 1.3], ['tall', 1.1], ['tall', 1.1]] },
  { id: 'flyer-low',      diff: 4,  skill: 'jump',   items: [['flyer_low', 1.5]] },
  { id: 'flyer-tall',     diff: 4,  skill: 'jump',   items: [['flyer_tall', 1.5]] },
  { id: 'small-flyer',    diff: 5,  skill: 'timing', items: [['small', 1.3], ['flyer_low', 1.2]] },
  { id: 'flyer-small',    diff: 5,  skill: 'timing', items: [['flyer_tall', 1.3], ['small', 1.2]] },
  { id: 'wide-pair',      diff: 5,  skill: 'rhythm', items: [['wide', 1.4], ['wide', 1.3]] },
  { id: 'stairs',         diff: 5,  skill: 'rhythm', items: [['small', 1.3], ['tall', 1.1], ['wide', 1.1]] },
  { id: 'hazard-solo',    diff: 6,  skill: 'timing', items: [['hazard', 1.6]] },
  { id: 'hazard-small',   diff: 6,  skill: 'timing', items: [['hazard', 1.4], ['small', 1.3]] },
  { id: 'flyer-pair',     diff: 6,  skill: 'rhythm', items: [['flyer_low', 1.3], ['flyer_tall', 1.2]] },
  { id: 'tall-hazard',    diff: 7,  skill: 'timing', items: [['tall', 1.3], ['hazard', 1.3]] },
  { id: 'chaser-solo',    diff: 7,  skill: 'timing', items: [['chaser', 1.6]] },
  { id: 'chaser-small',   diff: 7,  skill: 'timing', items: [['chaser', 1.4], ['small', 1.3]] },
  { id: 'quad-small',     diff: 7,  skill: 'rhythm', items: [['small', 1.2], ['small', 1.0], ['small', 1.0], ['small', 1.0]] },
  { id: 'small-chaser',   diff: 8,  skill: 'timing', items: [['small', 1.3], ['chaser', 1.3]] },
  { id: 'wide-flyer',     diff: 8,  skill: 'timing', items: [['wide', 1.3], ['flyer_tall', 1.1]] },
  { id: 'hazard-flyer',   diff: 8,  skill: 'timing', items: [['hazard', 1.4], ['flyer_low', 1.2]] },
  { id: 'chaser-wide',    diff: 9,  skill: 'timing', items: [['chaser', 1.4], ['wide', 1.2]] },
  { id: 'gauntlet',       diff: 9,  skill: 'rhythm', items: [['tall', 1.2], ['small', 1.0], ['wide', 1.1], ['tall', 1.0]] },
  { id: 'everything',     diff: 10, skill: 'rhythm', items: [['small', 1.2], ['flyer_low', 1.0], ['hazard', 1.1], ['chaser', 1.2], ['wide', 1.0]] },
];
// Generator tuning
export const CHUNK_RULES = {
  bandPoints: 110,      // difficulty band = 1 + score / bandPoints (capped at 10): widens as the score climbs
  easyAfterHit: 2,      // after a hit the next chunk's difficulty is at most this — a stumble never compounds
  noRepeatWithin: 2,    // the same chunk id never appears within the last N chunks
  skillRunCap: 2,       // never the same skill tag more than N chunks in a row
  restEvery: 20,        // s between rest beats (±restJitter) …
  restJitter: 4,
  restSeconds: [1.5, 2.0], // … each an empty stretch this long
};
