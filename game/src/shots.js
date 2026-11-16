// The screenshot scenes behind ?shot=start|play|end. Each scene is built deterministically from
// the seeded world, so the same seed always gives the same frame. The start scene lets the real
// ambient simulation drift for a few seconds; the play and end scenes compose a representative
// mid-run and a lost run from the same pools and spawn functions the game itself uses.
import { FIELD, MAX_WAVES, PALETTE, PLAYER, STEP } from './config.js';
import { PHASE_WAVE } from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE, SCREEN_VICTORY } from './render.js';

const IDLE = { dx: 0, dy: 0, special: false };
const START_SECONDS = 5;

function setUpgrades(state, levels) {
  for (let slot = 0; slot < state.upgrades.length; slot += 1) {
    const upgrade = state.upgrades[slot];
    upgrade.level = levels[slot];
    upgrade.cost = upgrade.baseCost + upgrade.costStep * upgrade.level;
  }
}

function clearSpawnQueues(state) {
  state.asteroidsLeft = 0;
  state.dronesLeft = 0;
  state.spawnTimer = 99;
  state.droneTimer = 99;
  state.phase = PHASE_WAVE;
}

function stageStart(world) {
  world.reset();
  for (let index = 0; index < START_SECONDS / STEP; index += 1) world.step(STEP, IDLE, true);
  return { screen: SCREEN_TITLE, best: 0 };
}

function stagePlay(world) {
  world.reset();
  const state = world.state;
  world.setWave(10);
  clearSpawnQueues(state);

  state.score = 98240;
  state.lives = 2;
  state.crystals = 48;
  state.multiplier = 5;
  state.chain = 5;
  state.chainTimer = 1.8;
  state.elapsed = 188;
  setUpgrades(state, [2, 2, 1]);

  state.player.shieldMax = PLAYER.shieldMaxDefault + 40 * 2;
  state.player.shield = state.player.shieldMax - 34;
  state.player.x = 862;
  state.player.y = 566;
  state.player.vx = -52;
  state.player.vy = 0;
  state.player.fireTimer = 0;
  state.player.specialTimer = 2.7;
  state.player.invulnerable = 0;

  world.spawnBoss(2);
  const boss = state.boss;
  boss.phase = 5.7;
  boss.x = FIELD.width / 2 + Math.sin(boss.phase * 0.55) * (FIELD.width / 2 - 190);
  boss.y = 152;
  boss.hp = boss.maxHp * 0.62;
  boss.fireTimer = 0.1;

  world.spawnAsteroid(2, 244, 188);
  world.spawnAsteroid(1, 1042, 142);
  world.spawnAsteroid(0, 974, 334);
  world.spawnAsteroid(1, 148, 392);
  world.spawnDrone(342, 292);
  world.spawnDrone(1082, 424);
  world.spawnCrystal(508, 466);
  world.spawnCrystal(736, 430);
  world.spawnCrystal(628, 538);

  world.spawnEnemyBullet(586, 306, 34, 168);
  world.spawnEnemyBullet(720, 288, -62, 158);
  world.spawnEnemyBullet(824, 348, -22, 176);
  world.spawnEnemyBullet(412, 252, 88, 148);

  world.burst(712, 352, 18, PALETTE.crystal, 125);
  world.burst(520, 300, 14, PALETTE.enemyGlow, 140);
  world.spawnPopup('+400', 846, 362, PALETTE.hudGold, 22);
  world.spawnPopup('+1', 646, 498, PALETTE.crystal, 16);
  state.effects.shake = 3.5;
  state.effects.flash = 0.06;
  state.effects.flashColor = PALETTE.playerGlow;

  // Let the real rules move everything for a few frames: the ship fires a spread volley and the
  // boss begins its pattern, making the frame look like a moment of play rather than a diorama.
  for (let index = 0; index < 9; index += 1) world.step(STEP, IDLE, false);
  return { screen: SCREEN_PLAY, best: state.score + 4200 };
}

function stageEnd(world) {
  world.reset();
  const state = world.state;
  world.setWave(12);
  clearSpawnQueues(state);

  state.lives = 0;
  state.score = 127450;
  state.crystals = 26;
  state.multiplier = 1;
  state.chain = 0;
  state.chainTimer = 0;
  state.elapsed = 236;
  state.player.x = 792;
  state.player.y = 574;
  state.player.shield = 0;
  state.player.invulnerable = 0;
  state.player.specialTimer = 1.1;

  world.spawnAsteroid(1, 318, 214);
  world.spawnAsteroid(0, 978, 356);
  world.spawnAsteroid(2, 1112, 168);
  world.spawnDrone(238, 412);
  world.spawnCrystal(698, 424);
  world.spawnEnemyBullet(724, 492, -58, 155);
  world.spawnEnemyBullet(842, 466, 26, 168);
  world.burst(state.player.x, state.player.y, 42, PALETTE.playerGlow, 235);
  world.burst(state.player.x, state.player.y, 22, PALETTE.hudText, 150);
  state.effects.shake = 3;
  state.effects.flash = 0.16;
  state.effects.flashColor = PALETTE.playerGlow;
  return { screen: SCREEN_OVER, best: 133400 };
}

function stageVictory(world) {
  world.reset();
  const state = world.state;
  world.setWave(MAX_WAVES);
  clearSpawnQueues(state);
  state.lives = 2;
  state.score = 184920;
  state.crystals = 61;
  state.multiplier = 7;
  state.chain = 7;
  state.chainTimer = 1.3;
  setUpgrades(state, [3, 3, 2]);
  state.player.shieldMax = PLAYER.shieldMaxDefault + 40 * 3;
  state.player.shield = 96;
  state.player.x = 640;
  state.player.y = 566;
  world.spawnCrystal(520, 420);
  world.spawnCrystal(760, 454);
  world.burst(640, 348, 36, PALETTE.hudGold, 210);
  state.effects.shake = 2;
  state.effects.flash = 0.1;
  state.effects.flashColor = PALETTE.hudGold;
  return { screen: SCREEN_VICTORY, best: 184920 };
}

/**
 * Set `world` to the named scene (start, play, end or victory; any other name is start) and
 * return the screen to draw over it and the best score to show.
 */
export function stageShot(name, world) {
  if (name === 'play') return stagePlay(world);
  if (name === 'end') return stageEnd(world);
  if (name === 'victory') return stageVictory(world);
  return stageStart(world);
}
