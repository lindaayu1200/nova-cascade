// One-time badges for Nova Cascade. The world reduces each tick to a bit mask and publishes its
// state as plain objects; this module folds those two feeds into a set of permanent achievements.
// Badges are remembered for the lifetime of the object, so replays and menu noise cannot re-award
// one, and reset() wipes the record for a fresh run. Pure logic: no canvas, no window, no timers,
// no Math.random. Using only flags and state means a replayed seed earns the same badges.
import {
  EVENT_EXPLODE, EVENT_HIT, EVENT_NOVA, EVENT_VICTORY, EVENT_WAVE_CLEAR,
} from './world.js';

/** Chain length that earns Chain Master; CHAIN.max is 8 in config. */
const CHAIN_TARGET = 5;
/** Crystals held at once that earn Crystal Hoard. */
const HOARD_TARGET = 60;
/** Chain length that turns a plain nova into Nova Surge. */
const NOVA_CHAIN_TARGET = 3;

function num(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

/** Active enemies of one kind, counted straight from the pool the world exposes. */
function activeCount(pool) {
  if (!Array.isArray(pool)) return 0;
  let total = 0;
  for (let slot = 0; slot < pool.length; slot += 1) {
    if (pool[slot] && pool[slot].active) total += 1;
  }
  return total;
}

/** Asteroids grouped by tier, used to tell a split (a smaller rock appears) from a fresh spawn. */
function tierCounts(pool) {
  const counts = [0, 0, 0];
  if (!Array.isArray(pool)) return counts;
  for (let slot = 0; slot < pool.length; slot += 1) {
    const rock = pool[slot];
    if (!rock || !rock.active) continue;
    const tier = Math.floor(num(rock.tier));
    if (tier >= 0 && tier < counts.length) counts[tier] += 1;
  }
  return counts;
}

/** True when any tier grew since the previous tick; with an explosion flag this means a split. */
function grew(previous, current) {
  if (!previous) return false;
  for (let tier = 0; tier < current.length; tier += 1) {
    if (current[tier] > previous[tier]) return true;
  }
  return false;
}

/**
 * The badge catalogue. Each test reads only the snapshot assembled in onEvent (flags plus a few
 * derived facts), never the outside world, so ordering and evaluation stay cheap and predictable.
 * The order below is also the order in which badges are reported to the caller.
 */
const BADGES = [
  {
    id: 'firstBlood',
    name: 'First Blood',
    description: 'Destroy your first target.',
    test: (ctx) => (ctx.flags & EVENT_EXPLODE) !== 0,
  },
  {
    id: 'rockSplitter',
    name: 'Rock Splitter',
    description: 'Break a rock apart into fragments.',
    test: (ctx) => ctx.split,
  },
  {
    id: 'chainMaster',
    name: 'Chain Master',
    description: `Reach a x${CHAIN_TARGET} kill chain.`,
    test: (ctx) => ctx.chain >= CHAIN_TARGET,
  },
  {
    id: 'bossSlayer',
    name: 'Boss Slayer',
    description: 'Bring down a boss ship.',
    test: (ctx) => ctx.sawBoss && !ctx.bossHere,
  },
  {
    id: 'untouchableWave',
    name: 'Untouchable Wave',
    description: 'Clear a wave without taking a hit.',
    test: (ctx) => (ctx.flags & EVENT_WAVE_CLEAR) !== 0 && !ctx.waveHit,
  },
  {
    id: 'novaSurge',
    name: 'Nova Surge',
    description: 'Fire a nova at the height of a chain.',
    test: (ctx) => (ctx.flags & EVENT_NOVA) !== 0 && ctx.chain >= NOVA_CHAIN_TARGET,
  },
  {
    id: 'victoryRun',
    name: 'Victory Run',
    description: 'Clear the final wave and win the run.',
    test: (ctx) => (ctx.flags & EVENT_VICTORY) !== 0,
  },
  {
    id: 'crystalHoard',
    name: 'Crystal Hoard',
    description: `Hold ${HOARD_TARGET} crystals at once.`,
    test: (ctx) => ctx.crystals >= HOARD_TARGET,
  },
];

/**
 * Build an achievement tracker. `onEvent(events, state)` digests one tick (or a merged batch of
 * flags), `earned()` lists the badges collected so far as fresh objects, and `reset()` forgets
 * everything for a new run.
 */
export function createAchievements() {
  const unlocked = Object.create(null);
  const order = [];

  let sawBoss = false;
  let waveHit = false;
  let lastWave = 1;
  let lastRocks = null;

  function reset() {
    for (const id of Object.keys(unlocked)) delete unlocked[id];
    order.length = 0;
    sawBoss = false;
    waveHit = false;
    lastWave = 1;
    lastRocks = null;
  }

  function grant(badge) {
    unlocked[badge.id] = true;
    const record = { id: badge.id, name: badge.name, description: badge.description };
    order.push(record);
    return record;
  }

  function onEvent(events, state) {
    const source = state || {};
    const bits = num(events);
    const wave = Math.floor(num(source.wave, 1));
    const chain = Math.floor(num(source.chain));
    const crystals = Math.floor(num(source.crystals));
    const bossHere = Boolean(source.boss && source.boss.active);
    const rocks = tierCounts(source.asteroids);

    // A hit taints the whole wave for Untouchable Wave; a new wave starts a clean slate.
    if (wave !== lastWave) {
      waveHit = false;
      lastWave = wave;
    }
    if ((bits & EVENT_HIT) !== 0) waveHit = true;

    // Remember that a boss was ever on screen so its disappearance can be read as a kill.
    if (bossHere) sawBoss = true;

    // A rock only turns into fragments on destruction, so count growth on an explosion tick.
    const split = (bits & EVENT_EXPLODE) !== 0 && grew(lastRocks, rocks);
    lastRocks = rocks;

    const ctx = {
      flags: bits,
      chain,
      crystals,
      wave,
      bossHere,
      sawBoss,
      waveHit,
      split,
    };

    const fresh = [];
    for (let index = 0; index < BADGES.length; index += 1) {
      const badge = BADGES[index];
      if (unlocked[badge.id] || !badge.test(ctx)) continue;
      fresh.push(grant(badge));
    }
    return fresh;
  }

  function earned() {
    return order.slice();
  }

  return { onEvent, earned, reset };
}
