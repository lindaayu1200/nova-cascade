// The screenshot scenes behind ?shot=start|play|end. Each one plays the real rules forward from a
// fresh world for a fixed number of steps, steered by a scripted autopilot (sample ahead each way
// the ship could thrust, keep clear of the rocks, chase the nearest crystal when that is safe),
// so the frame is what a short game really looks like and the same seed always gives the same
// frame. The play scene's pilot plays well; the end scene's looks only a moment ahead and
// ignores drones and bullets entirely, so it is caught out, as a hurried player is.
import { FIELD, MAX_WAVES, PLAYER, STEP } from './config.js';
import { EVENT_OVER, EVENT_VICTORY, PHASE_CLEAR } from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const START_SECONDS = 5;
const PLAY_SECONDS = 26;
const END_LIMIT_SECONDS = 600;
const HORIZON_PLAY = 0.7;
const HORIZON_END = 0.22;
const SAMPLE = 1 / 30;
const MARGIN = 16;
const DRONE_RADIUS = 14;
const BOSS_RADIUS = 62;
const MOVES = [
  [0, 0], [1, 0], [-1, 0], [0, 1], [0, -1],
  [0.7, 0.7], [0.7, -0.7], [-0.7, 0.7], [-0.7, -0.7],
];
const IDLE = { dx: 0, dy: 0, special: false };

/** Seconds until thrusting in `move` runs the ship into a rock (and, unless careless, a drone, a bullet or the boss); Infinity when it never does. */
function dangerTime(state, move, horizon, careless) {
  const player = state.player;
  const radius = PLAYER.radius;
  for (let t = SAMPLE; t <= horizon; t += SAMPLE) {
    const x = Math.min(FIELD.width - radius, Math.max(radius, player.x + move[0] * PLAYER.speed * t));
    const y = Math.min(FIELD.height - radius, Math.max(radius, player.y + move[1] * PLAYER.speed * t));
    const rocks = state.asteroids;
    for (let index = 0; index < rocks.length; index += 1) {
      const rock = rocks[index];
      if (!rock.active) continue;
      const dx = rock.x + rock.vx * t - x;
      const dy = rock.y + rock.vy * t - y;
      if (dx * dx + dy * dy < (rock.radius + radius + MARGIN) * (rock.radius + radius + MARGIN)) return t;
    }
    if (careless) continue;
    const shots = state.enemyBullets;
    for (let index = 0; index < shots.length; index += 1) {
      const shot = shots[index];
      if (!shot.active) continue;
      const dx = shot.x + shot.vx * t - x;
      const dy = shot.y + shot.vy * t - y;
      if (dx * dx + dy * dy < (radius + 10) * (radius + 10)) return t;
    }
    const fleet = state.drones;
    for (let index = 0; index < fleet.length; index += 1) {
      const drone = fleet[index];
      if (!drone.active) continue;
      const dx = drone.x + drone.vx * t - x;
      const dy = drone.y + drone.vy * t - y;
      if (dx * dx + dy * dy < (DRONE_RADIUS + radius + MARGIN) * (DRONE_RADIUS + radius + MARGIN)) return t;
    }
    if (state.boss.active) {
      const dx = state.boss.x - x;
      const dy = state.boss.y - y;
      if (dx * dx + dy * dy < (BOSS_RADIUS + radius + MARGIN) * (BOSS_RADIUS + radius + MARGIN)) return t;
    }
  }
  return Infinity;
}

/** Where the play pilot wants its nose: a nearby crystal, or parked under the nearest rock so the autofire connects. */
function huntTarget(state) {
  const player = state.player;
  let nearestCrystal = null;
  let crystalDistance = Infinity;
  const pool = state.crystalPool;
  for (let index = 0; index < pool.length; index += 1) {
    const crystal = pool[index];
    if (!crystal.active) continue;
    const distance = Math.hypot(crystal.x - player.x, crystal.y - player.y);
    if (distance < crystalDistance) {
      crystalDistance = distance;
      nearestCrystal = crystal;
    }
  }
  if (crystalDistance < 240 && nearestCrystal !== null) return { x: nearestCrystal.x, y: nearestCrystal.y };
  let nearestRock = null;
  let rockDistance = Infinity;
  const rocks = state.asteroids;
  for (let index = 0; index < rocks.length; index += 1) {
    const rock = rocks[index];
    if (!rock.active) continue;
    const distance = Math.hypot(rock.x - player.x, rock.y - player.y);
    if (distance < rockDistance) {
      rockDistance = distance;
      nearestRock = rock;
    }
  }
  if (nearestRock !== null) return { x: nearestRock.x, y: Math.min(FIELD.height - 80, nearestRock.y + 190) };
  return { x: FIELD.width / 2, y: FIELD.height - 140 };
}

/** The end pilot chases crystals greedily and ignores everything but the rocks, so it is caught out. */
function greedyTarget(state) {
  const player = state.player;
  let targetX = FIELD.width / 2;
  let targetY = FIELD.height / 2;
  let bestDistance = Infinity;
  const pool = state.crystalPool;
  for (let index = 0; index < pool.length; index += 1) {
    const crystal = pool[index];
    if (!crystal.active) continue;
    const distance = Math.hypot(crystal.x - player.x, crystal.y - player.y);
    if (distance < bestDistance) {
      bestDistance = distance;
      targetX = crystal.x;
      targetY = crystal.y;
    }
  }
  return { x: targetX, y: targetY };
}

/** Of the ways to move that are safe as long as the safest, the one toward `target`; else the one that is hit last. */
function chooseMove(state, horizon, careless, target) {
  const player = state.player;
  let longest = 0;
  const times = [];
  for (let index = 0; index < MOVES.length; index += 1) {
    const time = dangerTime(state, MOVES[index], horizon, careless);
    times.push(time);
    if (time > longest) longest = time;
  }
  let best = 0;
  let bestScore = Infinity;
  let bestTime = -1;
  const targetX = target.x;
  const targetY = target.y;
  for (let index = 0; index < MOVES.length; index += 1) {
    if (times[index] < longest - 0.001) continue;
    const x = Math.min(FIELD.width - PLAYER.radius, Math.max(PLAYER.radius, player.x + MOVES[index][0] * PLAYER.speed * horizon));
    const y = Math.min(FIELD.height - PLAYER.radius, Math.max(PLAYER.radius, player.y + MOVES[index][1] * PLAYER.speed * horizon));
    const score = Math.hypot(targetX - x, targetY - y) + 0.2 * (Math.abs(MOVES[index][0]) + Math.abs(MOVES[index][1]));
    if (score < bestScore || (score === bestScore && times[index] > bestTime)) {
      bestScore = score;
      bestTime = times[index];
      best = index;
    }
  }
  return MOVES[best];
}

function shouldFireSpecial(state) {
  if (state.player.specialTimer > 0) return false;
  if (state.boss.active) return true;
  const fleet = state.drones;
  for (let index = 0; index < fleet.length; index += 1) {
    const drone = fleet[index];
    if (drone.active && Math.hypot(drone.x - state.player.x, drone.y - state.player.y) < 260) return true;
  }
  return false;
}

/**
 * Set `world` to the named scene (start, play or end; any other name is start) and return the
 * screen to draw over it and the best score to show.
 */
export function stageShot(name, world) {
  world.reset();
  if (name !== 'play' && name !== 'end') {
    for (let index = 0; index < START_SECONDS / STEP; index += 1) world.step(STEP, IDLE, true);
    return { screen: SCREEN_TITLE, best: 0 };
  }
  const play = name === 'play';
  const limit = play ? PLAY_SECONDS : END_LIMIT_SECONDS;
  const horizon = play ? HORIZON_PLAY : HORIZON_END;
  for (let index = 0; index < limit / STEP; index += 1) {
    if (world.state.phase === PHASE_CLEAR && world.state.wave < MAX_WAVES) {
      if (play) {
        for (let slot = 0; slot < 3; slot += 1) world.buyUpgrade(slot);
      }
      world.startNextWave();
    }
    const move = chooseMove(world.state, horizon, !play, play ? huntTarget(world.state) : greedyTarget(world.state));
    const input = play ? { dx: move[0], dy: move[1], special: shouldFireSpecial(world.state) } : { dx: move[0], dy: move[1], special: false };
    if (world.step(STEP, input, false) & (EVENT_OVER | EVENT_VICTORY)) break;
  }
  const over = world.state.lives === 0;
  return { screen: over ? SCREEN_OVER : SCREEN_PLAY, best: world.state.score };
}
