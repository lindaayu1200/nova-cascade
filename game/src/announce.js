// Arena call-outs for Nova Cascade. The world boils a whole tick down to a bit mask; this module
// turns those bits (plus the odd state transition) into a short line, keeps a per-line cooldown so
// nothing repeats too fast, and fades the winner out. Pure logic: no canvas, no window, no
// Math.random. A replayed seed therefore replays the same call-outs at the same ticks, and the
// renderer only has to read current() and paint the text with the alpha it returns.
import { BOSS_NAMES, CHAIN, STEP } from './config.js';
import {
  EVENT_BOSS, EVENT_CRYSTAL, EVENT_EXPLODE, EVENT_HIT, EVENT_NOVA,
  EVENT_OVER, EVENT_SHOT, EVENT_VICTORY, EVENT_WAVE_CLEAR,
} from './world.js';

/** Longest gap a single update accounts for; matches the main loop's frame cap. */
const MAX_DT = 0.25;
/** Seconds spent easing a fresh line in and out of view. */
const FADE_IN = 0.09;

const CRYSTAL_LINES = ['Crystal secured!', 'Shard collected!', 'Crystal cache!', 'Gems in hand!'];
const BURST_LINES = ['Target destroyed!', 'Rock breached!', 'Fragment cleared!', 'Direct hit!'];
const FIRE_LINES = ['Fire at will!', 'Full salvo!', 'Hold the line!', 'Keep firing!'];

function num(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

/** Boss encounters are numbered from one; the last name covers every later encounter. */
function bossName(state) {
  const boss = state && state.boss;
  const raw = boss && boss.active ? boss.index : (state && state.bossIndex);
  const slot = Math.min(BOSS_NAMES.length - 1, Math.max(0, Math.floor(num(raw, 1)) - 1));
  return BOSS_NAMES[slot];
}

/** Pick a phrasing from a state counter, never from chance. */
function variant(lines, seed) {
  return lines[Math.abs(Math.floor(seed)) % lines.length];
}

// Each cue says how loud it is, how long it stays up (hold), how much of that is the tail fade,
// and how long before it may fire again. Priority may depend on state, so a last-life hit or a
// long chain can talk over routine chatter without waiting for it to expire.
const CUES = {
  over: {
    priority: 100, cooldown: 60, hold: 2.4, fade: 0.9,
    text: (state) => (num(state.score, 0) >= 10000 ? 'Legendary run over!' : 'Run over.'),
  },
  victory: {
    priority: 100, cooldown: 60, hold: 2.6, fade: 0.9,
    text: () => 'Cascade cleared!',
  },
  boss: {
    priority: 92, cooldown: 9, hold: 2, fade: 0.55,
    text: (state) => `Boss: ${bossName(state)}`,
  },
  waveClear: {
    priority: 84, cooldown: 5, hold: 1.5, fade: 0.45,
    text: (state) => `Wave ${num(state.wave, 1)} clear!`,
  },
  waveStart: {
    priority: 80, cooldown: 3, hold: 1.3, fade: 0.4,
    text: (state) => `Wave ${num(state.wave, 1)} inbound!`,
  },
  nova: {
    priority: 76, cooldown: 4.5, hold: 1.3, fade: 0.4,
    text: () => 'Nova unleashed!',
  },
  hit: {
    priority: (state) => (num(state.lives, 1) <= 1 ? 88 : 70),
    cooldown: 1.6, hold: 1.1, fade: 0.35,
    text: (state) => {
      const lives = num(state.lives, 1);
      if (lives <= 1) return 'Last life!';
      if (lives === 2) return 'Hull critical!';
      return 'Shield impact!';
    },
  },
  chain: {
    priority: (state) => 44 + Math.min(CHAIN.max, num(state.chain, 0)) * 2,
    cooldown: 1, hold: 1.1, fade: 0.35,
    text: (state) => `Chain x${num(state.chain, 0)}!`,
  },
  crystal: {
    priority: 26, cooldown: 2.6, hold: 1, fade: 0.3,
    text: (state) => variant(CRYSTAL_LINES, num(state.crystals, 0)),
  },
  explode: {
    priority: 20, cooldown: 2.2, hold: 0.95, fade: 0.3,
    text: (state) => variant(BURST_LINES, Math.floor(num(state.score, 0) / 120)),
  },
  shot: {
    priority: 4, cooldown: 8, hold: 0.85, fade: 0.3,
    text: (state) => variant(FIRE_LINES, Math.floor(num(state.elapsed, 0) / 9)),
  },
};

// Bit -> cue. Listed loudest first only for readability; selection is by priority below.
const EVENT_CUES = [
  [EVENT_OVER, 'over'],
  [EVENT_VICTORY, 'victory'],
  [EVENT_BOSS, 'boss'],
  [EVENT_WAVE_CLEAR, 'waveClear'],
  [EVENT_NOVA, 'nova'],
  [EVENT_HIT, 'hit'],
  [EVENT_CRYSTAL, 'crystal'],
  [EVENT_EXPLODE, 'explode'],
  [EVENT_SHOT, 'shot'],
];

/** Fade-in at the start, fade-out over the tail, flat one in between. */
function alphaFor(line) {
  if (line.age < FADE_IN) return Math.max(0, Math.min(1, line.age / FADE_IN));
  return Math.max(0, Math.min(1, (line.hold - line.age) / line.fade));
}

/**
 * Build the announcer for a world state. `update(events, state, dt)` digests a flag mask (dt is
 * optional: it otherwise comes from state.time, with a fixed-step fallback when the clock is
 * frozen in a menu). `current()` returns { text, alpha } for the HUD; an empty text means there
 * is nothing worth showing. `reset(state)` clears cooldowns, e.g. on a new run.
 */
export function announceInit(state) {
  const cooldowns = Object.create(null);
  let lastTime = num(state && state.time, 0);
  let lastWave = num(state && state.wave, 1);
  let active = null;

  function reset(nextState) {
    const source = nextState || state;
    for (const key of Object.keys(cooldowns)) cooldowns[key] = 0;
    lastTime = num(source && source.time, 0);
    lastWave = num(source && source.wave, 1);
    active = null;
  }

  function elapsed(dt, source) {
    const given = Number.isFinite(dt) ? dt : -1;
    let seconds;
    if (given > 0) {
      seconds = given;
    } else {
      const time = source ? source.time : 0;
      seconds = Number.isFinite(time) && Number.isFinite(lastTime) && time > lastTime
        ? time - lastTime
        : STEP;
    }
    if (source && Number.isFinite(source.time)) lastTime = source.time;
    return Math.min(MAX_DT, Math.max(0, seconds));
  }

  function offer(key, source, queue) {
    const cue = CUES[key];
    if (!cue || num(cooldowns[key], 0) > 0) return;
    const priority = typeof cue.priority === 'function' ? cue.priority(source) : cue.priority;
    queue.push({ key, priority });
  }

  function update(events, worldState, dt) {
    const source = worldState || state;
    const seconds = elapsed(dt, source);
    for (const key of Object.keys(cooldowns)) {
      if (cooldowns[key] > 0) cooldowns[key] = Math.max(0, cooldowns[key] - seconds);
    }
    if (active !== null) {
      active.age += seconds;
      if (active.age >= active.hold) active = null;
    }

    const queue = [];
    const bits = num(events, 0);
    for (const [bit, key] of EVENT_CUES) {
      if ((bits & bit) !== 0) offer(key, source, queue);
    }
    // A kill also feeds the combo; only call it out once the chain is worth hearing about.
    if ((bits & EVENT_EXPLODE) !== 0 && num(source && source.chain, 0) >= 3) {
      offer('chain', source, queue);
    }
    const wave = num(source && source.wave, 1);
    if (wave > lastWave) offer('waveStart', source, queue);
    lastWave = wave;

    let winner = null;
    for (const candidate of queue) {
      if (winner === null || candidate.priority > winner.priority) winner = candidate;
    }
    if (winner !== null && (active === null || winner.priority > active.priority)) {
      const cue = CUES[winner.key];
      active = {
        key: winner.key,
        text: cue.text(source),
        priority: winner.priority,
        // Start half-way through the fade-in so the very first read already has a line and alpha.
        age: FADE_IN * 0.5,
        hold: cue.hold,
        fade: cue.fade,
      };
      cooldowns[winner.key] = cue.cooldown;
    }
    return current().text;
  }

  function current() {
    if (active === null) return { text: '', alpha: 0 };
    const alpha = alphaFor(active);
    if (alpha <= 0) return { text: '', alpha: 0 };
    return { text: active.text, alpha };
  }

  reset(state);
  return { update, current, reset };
}
