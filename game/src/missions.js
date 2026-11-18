// Mission chain for Nova Cascade: a tick's state snapshot and event mask become lasting goals.
// Pure logic - no drawing, no DOM, no chance - so a replayed seed replays the same objectives.
import {
  EVENT_BOSS, EVENT_CRYSTAL, EVENT_EXPLODE, EVENT_HIT, EVENT_NOVA,
  EVENT_OVER, EVENT_SHOT, EVENT_VICTORY, EVENT_WAVE_CLEAR,
} from './world.js';

const SHOT_TARGET = 12;
const CRYSTAL_TARGET = 10;
const NOVA_TARGET = 2;
const SCORE_TARGET = 6000;

const num = (value, fallback = 0) => (Number.isFinite(value) ? value : fallback);
const clamp01 = (value) => Math.max(0, Math.min(1, value));
const progress = (current, target, ratio, label) => (
  { current, target, ratio: clamp01(ratio), label }
);

// init() makes a mission's counter bag, advance() folds in one digest, measure() formats the HUD,
// and done() decides when to move on. All of them read only the digest assembled by update().
const CHAIN = [
  {
    title: 'Opening Barrage',
    objectiveText: 'Fire 12 volleys and clear wave 1.',
    init: () => ({ shots: 0, waves: 0 }),
    advance: (r, c) => {
      if (c.flags & EVENT_SHOT) r.shots += 1;
      if (c.flags & EVENT_WAVE_CLEAR) r.waves += 1;
    },
    measure: (r) => {
      const shots = Math.min(SHOT_TARGET, r.shots), waves = Math.min(1, r.waves);
      return progress(shots + waves, SHOT_TARGET + 1, (shots / SHOT_TARGET + waves) / 2,
        `${shots}/${SHOT_TARGET} volleys · ${waves}/1 wave`);
    },
    done: (r) => r.shots >= SHOT_TARGET && r.waves >= 1,
  },
  {
    title: 'Crystal Convoy',
    objectiveText: 'Protect the haul: bank 10 crystals without taking a hit.',
    init: () => ({ hauled: 0, clean: true }),
    advance: (r, c) => {
      if (c.flags & EVENT_HIT) { r.hauled = 0; r.clean = false; }
      if (c.flags & EVENT_CRYSTAL) r.hauled += c.crystalGain;
    },
    measure: (r) => {
      const hauled = Math.min(CRYSTAL_TARGET, r.hauled);
      return progress(hauled, CRYSTAL_TARGET, hauled / CRYSTAL_TARGET,
        `${hauled}/${CRYSTAL_TARGET} crystals · ${r.clean ? 'hull clean' : 'new streak'}`);
    },
    done: (r) => r.hauled >= CRYSTAL_TARGET,
  },
  {
    title: 'Nova Discipline',
    objectiveText: 'Unleash 2 nova bursts and clear another wave.',
    init: () => ({ novas: 0, waves: 0 }),
    advance: (r, c) => {
      if (c.flags & EVENT_NOVA) r.novas += 1;
      if (c.flags & EVENT_WAVE_CLEAR) r.waves += 1;
    },
    measure: (r) => {
      const novas = Math.min(NOVA_TARGET, r.novas), waves = Math.min(1, r.waves);
      return progress(novas + waves, NOVA_TARGET + 1, (novas / NOVA_TARGET + waves) / 2,
        `${novas}/${NOVA_TARGET} novas · ${waves}/1 wave`);
    },
    done: (r) => r.novas >= NOVA_TARGET && r.waves >= 1,
  },
  {
    title: 'Boss Breaker',
    objectiveText: 'Bring down a boss ship.',
    init: () => ({ kills: 0, seen: false, here: false }),
    advance: (r, c) => {
      r.kills = Math.max(r.kills, c.bossKills); r.seen = c.bossSeen; r.here = c.bossHere;
    },
    measure: (r) => {
      const down = r.kills > 0;
      const label = down ? 'Boss down' : r.here ? 'Boss engaged'
        : r.seen ? 'Boss sighted' : 'Awaiting boss';
      return progress(down ? 1 : 0, 1, down ? 1 : (r.seen ? 0.5 : 0), label);
    },
    done: (r) => r.kills > 0,
  },
  {
    title: 'Cascade Crown',
    objectiveText: 'Reach 6000 points and clear the final wave.',
    init: () => ({ score: 0, victory: false }),
    advance: (r, c) => {
      r.score = Math.max(r.score, c.score);
      if (c.flags & EVENT_VICTORY) r.victory = true;
    },
    measure: (r) => {
      const score = Math.min(SCORE_TARGET, r.score);
      return progress(score, SCORE_TARGET, score / SCORE_TARGET,
        `${score}/${SCORE_TARGET} pts · ${r.victory ? 'final wave clear' : 'final wave pending'}`);
    },
    done: (r) => r.score >= SCORE_TARGET && r.victory,
  },
];

/**
 * Build one chain per run. update(state, events) digests a tick; onEvent swaps the argument order
 * to match the other systems in the loop. current() and completed() are read-only HUD views.
 * reset() forgets all counters, so a restart cannot inherit a finished mission.
 */
export function createMissions() {
  let index = 0, record = CHAIN[0].init();
  let lastCrystals = null, bossSeen = false, bossKills = 0, over = false;

  function reset() {
    index = 0; record = CHAIN[0].init();
    lastCrystals = null; bossSeen = false; bossKills = 0; over = false;
  }

  function update(state, events) {
    if (over) return current();
    const source = state || {}, flags = num(events);
    if (flags & EVENT_OVER) { over = true; return current(); }

    const crystals = num(source.crystals);
    let crystalGain = 0;
    if (lastCrystals === null) lastCrystals = crystals;
    else { crystalGain = Math.max(0, crystals - lastCrystals); lastCrystals = crystals; }

    const bossHere = Boolean(source.boss && source.boss.active);
    if (bossHere || (flags & EVENT_BOSS)) bossSeen = true;
    if (bossSeen && !bossHere && (flags & EVENT_EXPLODE)) {
      bossKills += 1; bossSeen = false;
    }
    const ctx = {
      flags, crystalGain, bossHere, bossSeen, bossKills,
      score: Math.max(0, Math.floor(num(source.score))),
    };
    while (index < CHAIN.length) {
      const mission = CHAIN[index];
      mission.advance(record, ctx);
      if (!mission.done(record, ctx)) break;
      index += 1;
      record = index < CHAIN.length ? CHAIN[index].init() : null;
    }
    return current();
  }

  const onEvent = (events, state) => update(state, events);

  function current() {
    if (index >= CHAIN.length) {
      return {
        title: 'Cascade Complete', objectiveText: 'All missions complete.',
        progress: progress(CHAIN.length, CHAIN.length, 1, `${CHAIN.length}/${CHAIN.length}`),
      };
    }
    const mission = CHAIN[index];
    return {
      title: mission.title,
      objectiveText: mission.objectiveText,
      progress: mission.measure(record),
    };
  }

  const completed = () => CHAIN.slice(0, index).map((mission) => mission.title);

  return { update, onEvent, current, completed, reset };
}

