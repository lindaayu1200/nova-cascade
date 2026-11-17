// Run statistics for Nova Cascade. The world reduces a tick to a bit mask and exposes its pools
// as plain state; this module folds those two sources into counters a results screen can print.
// No canvas, window, timers or Math.random, so replaying a seed always yields the same numbers.
import { ASTEROID_TIERS, FIELD } from './config.js';
import {
  EVENT_BOSS, EVENT_CRYSTAL, EVENT_EXPLODE, EVENT_HIT, EVENT_NOVA,
  EVENT_OVER, EVENT_SHOT, EVENT_VICTORY, EVENT_WAVE_CLEAR,
} from './world.js';

const TIER_LABELS = ['Small rocks', 'Medium rocks', 'Large rocks'];
/** A rock one step from sliding off the bottom is not a casualty of a bullet. */
const DRIFT_MARGIN = 28;
const EPS = 1e-6;

function num(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function tierLabel(index) {
  return TIER_LABELS[index] || `Tier ${index + 1} rocks`;
}

function bump(list, tier) {
  if (tier >= 0 && tier < list.length) list[tier] += 1;
}

function formatClock(seconds) {
  const whole = Math.max(0, Math.floor(num(seconds)));
  const minutes = Math.floor(whole / 60);
  const remainder = whole % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

// A rock keeps its crater geometry, spin and radius for its entire life, even though pooled slots
// are recycled the instant it breaks. Those fixed floats therefore act as a per-rock identity:
// when a slot's identity changes, the previous occupant is gone and a new one has taken its place.
function rockId(rock) {
  const shape = rock.shape || [];
  return [
    rock.tier, rock.radius, rock.maxHp, rock.spin,
    rock.craterAngle, rock.craterDist, rock.craterRadius,
    shape[0], shape[4],
  ].join(':');
}

/** True when a disappearing rock was already leaving through the floor on its own. */
function driftedOff(previous) {
  return previous.y > FIELD.height + previous.radius - DRIFT_MARGIN;
}

export function createRunStats() {
  const destroyed = new Array(ASTEROID_TIERS.length).fill(0);
  let crystals = 0;
  let waves = 0;
  let bestChain = 0;
  let hits = 0;
  let damage = 0;
  let shots = 0;
  let bosses = 0;
  let novas = 0;
  let outcome = '';

  let seenRocks = [];
  let seenBullets = [];
  let lastTime = null;
  let lastElapsed = null;
  let lastWave = null;
  let lastShield = 0;
  let lastLives = 0;
  let lastCrystals = 0;

  function resetCounters() {
    destroyed.fill(0);
    crystals = waves = bestChain = hits = damage = shots = bosses = novas = 0;
    outcome = '';
    seenRocks = [];
    seenBullets = [];
    lastShield = lastLives = lastCrystals = 0;
  }

  // A rewound clock means a new run, so one stats object can serve many restarts.
  function syncClock(state) {
    const time = num(state.time);
    const elapsed = num(state.elapsed);
    const wave = num(state.wave, 1);
    const rewound = lastTime !== null
      && (time < lastTime - EPS || elapsed < lastElapsed - EPS || wave < lastWave - EPS);
    if (lastTime === null || rewound) {
      if (rewound) resetCounters();
      lastCrystals = num(state.crystals);
      lastShield = num(state.player && state.player.shield);
      lastLives = num(state.lives);
    }
    lastTime = time; lastElapsed = elapsed; lastWave = wave;
  }

  // Return the rocks that vanished this tick, bucketed by tier. Identity changes mean a split,
  // which only happens on destruction; a freed slot means either a kill or a drift off-screen.
  function departedRocks(state) {
    const pool = Array.isArray(state.asteroids) ? state.asteroids : [];
    const ended = new Array(destroyed.length).fill(0);
    for (let slot = 0; slot < pool.length; slot += 1) {
      const rock = pool[slot];
      const previous = seenRocks[slot] || null;
      if (!rock || !rock.active) {
        if (previous !== null && !driftedOff(previous)) bump(ended, previous.tier);
        seenRocks[slot] = null;
        continue;
      }
      const id = rockId(rock);
      if (previous !== null && previous.id === id) {
        previous.y = num(rock.y);
        previous.radius = num(rock.radius);
        continue;
      }
      if (previous !== null && !driftedOff(previous)) bump(ended, previous.tier);
      seenRocks[slot] = { id, tier: num(rock.tier), y: num(rock.y), radius: num(rock.radius) };
    }
    seenRocks.length = pool.length;
    return ended;
  }

  // Count individual projectiles, not volleys, so Prism Spread shows up in the totals. The
  // flags are refreshed every tick; only a tick carrying EVENT_SHOT actually adds to the score.
  function freshBullets(state) {
    const pool = Array.isArray(state.bullets) ? state.bullets : [];
    let fresh = 0;
    for (let slot = 0; slot < pool.length; slot += 1) {
      const active = Boolean(pool[slot] && pool[slot].active);
      if (active && !seenBullets[slot]) fresh += 1;
      seenBullets[slot] = active;
    }
    seenBullets.length = pool.length;
    return fresh;
  }

  function onEvent(events, state) {
    const source = state || {};
    syncClock(source);
    const bits = num(events);

    const ended = departedRocks(source);
    if ((bits & EVENT_EXPLODE) !== 0) {
      for (let tier = 0; tier < destroyed.length; tier += 1) destroyed[tier] += ended[tier];
    }

    const crystalTotal = num(source.crystals);
    if ((bits & EVENT_CRYSTAL) !== 0 && crystalTotal > lastCrystals) {
      crystals += crystalTotal - lastCrystals;
    }
    lastCrystals = crystalTotal;

    if ((bits & EVENT_WAVE_CLEAR) !== 0) waves += 1;
    if ((bits & EVENT_VICTORY) !== 0) {
      waves += 1;
      outcome = 'Victory';
    }
    if ((bits & EVENT_OVER) !== 0) outcome = 'Defeat';
    if ((bits & EVENT_BOSS) !== 0) bosses += 1;
    if ((bits & EVENT_NOVA) !== 0) novas += 1;

    const launched = freshBullets(source);
    if ((bits & EVENT_SHOT) !== 0) shots += launched;

    const shield = num(source.player && source.player.shield);
    const lives = num(source.lives);
    if ((bits & EVENT_HIT) !== 0) {
      hits += 1;
      const shieldLost = Math.max(0, lastShield - shield);
      const livesLost = Math.max(0, lastLives - lives);
      const lifeWorth = Math.max(1, num(source.player && source.player.shieldMax, 100));
      damage += shieldLost + livesLost * lifeWorth;
    }
    lastShield = shield;
    lastLives = lives;

    bestChain = Math.max(bestChain, num(source.chain));
  }

  function summary(state) {
    const source = state || {};
    const rows = [
      ['Outcome', outcome || 'In progress'], ['Time survived', formatClock(source.elapsed)],
      ['Waves cleared', waves], ['Score', Math.floor(num(source.score))],
    ];
    let rockTotal = 0;
    for (let tier = 0; tier < destroyed.length; tier += 1) {
      rows.push([tierLabel(tier), destroyed[tier]]);
      rockTotal += destroyed[tier];
    }
    rows.push(
      ['Rocks destroyed', rockTotal], ['Crystals collected', crystals],
      ['Best chain', bestChain], ['Shots fired', shots],
      ['Damage taken', Math.round(damage)], ['Hits taken', hits],
      ['Bosses faced', bosses], ['Novas unleashed', novas],
    );
    return rows;
  }

  return { onEvent, summary };
}
