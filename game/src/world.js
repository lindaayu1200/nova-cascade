// Rules-only simulation: no canvas and no window. This module keeps the ship and its constant
// fire, successive waves of fragmenting rocks, pursuing drones and a boss every fifth round, the
// crystals they release, impact checks, combo points, lives and the between-wave shop. step()
// advances one fixed tick and hands back a bit mask describing what happened, so presentation
// stays outside. All pools are created once when the world is instantiated.
import {
  ASTEROID_TIERS, BOSS, BULLET, CHAIN, CRYSTAL, DRONE, ENEMY_BULLET, FIELD,
  INITIAL_LIVES, MAX_WAVES, PALETTE, PLAYER, POOL, UPGRADE_DEFS,
} from './config.js';

export const PHASE_WAVE = 'wave';
export const PHASE_CLEAR = 'clear';

export const EVENT_HIT = 1;
export const EVENT_CRYSTAL = 2;
export const EVENT_WAVE_CLEAR = 4;
export const EVENT_OVER = 8;
export const EVENT_VICTORY = 16;
export const EVENT_BOSS = 32;
export const EVENT_NOVA = 64;
export const EVENT_EXPLODE = 128;
export const EVENT_SHOT = 256;

const TAU = Math.PI * 2;

/** Produces the spawn recipe for a wave; on multiples of five, a boss escorts a few rocks. */
function makeWavePlan(wave) {
  const isBossWave = wave % 5 === 0;
  const bossNumber = isBossWave ? wave / 5 : 0;
  const rockQuota = isBossWave ? 4 + bossNumber : 5 + Math.floor(wave * 1.2);
  const droneQuota = isBossWave ? 0 : Math.max(0, Math.floor((wave - 1) / 2));
  return {
    boss: isBossWave,
    bossIndex: bossNumber,
    asteroids: rockQuota,
    drones: droneQuota,
    spawnInterval: Math.max(0.38, 1.05 - wave * 0.045),
    droneInterval: Math.max(1.4, 2.8 - wave * 0.12),
    speedScale: 1 + (wave - 1) * 0.055,
  };
}

function freeIn(list) {
  for (let slot = 0; slot < list.length; slot += 1) {
    if (!list[slot].active) return list[slot];
  }
  return null;
}

export function createWorld(random) {
  const player = {
    x: FIELD.width / 2,
    y: FIELD.height - 110,
    vx: 0,
    vy: 0,
    shield: PLAYER.shieldMaxDefault,
    shieldMax: PLAYER.shieldMaxDefault,
    invulnerable: 0,
    fireTimer: 0,
    specialTimer: 0,
  };

  const bullets = Array.from({ length: POOL.bullets }, () => ({
    active: false, x: 0, y: 0, vx: 0, vy: 0,
  }));
  const enemyBullets = Array.from({ length: POOL.enemyBullets }, () => ({
    active: false, x: 0, y: 0, vx: 0, vy: 0,
  }));
  const asteroids = Array.from({ length: POOL.asteroids }, () => ({
    active: false, tier: 0, radius: 0, hp: 0, maxHp: 0, x: 0, y: 0, vx: 0, vy: 0,
    phase: 0, spin: 0, flash: 0, shape: new Array(9).fill(1), craterAngle: 0,
    craterDist: 0, craterRadius: 0,
  }));
  const drones = Array.from({ length: POOL.drones }, () => ({
    active: false, x: 0, y: 0, vx: 0, vy: 0, hp: 0, phase: 0, flash: 0,
  }));
  const crystalPool = Array.from({ length: POOL.crystals }, () => ({
    active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, spin: 0,
  }));
  const particles = Array.from({ length: POOL.particles }, () => ({
    active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1,
    size: 2, color: PALETTE.starWhite, drag: 2,
  }));
  const popups = Array.from({ length: POOL.popups }, () => ({
    active: false, x: 0, y: 0, vy: 0, life: 0, maxLife: 1,
    text: '', color: PALETTE.hudText, size: 20,
  }));
  const stars = Array.from({ length: POOL.stars }, () => ({
    x: random() * FIELD.width,
    y: random() * FIELD.height,
    speed: 16 + random() * 62,
    size: random() < 0.78 ? 1.5 : 2.6,
    tint: (random() * 3) | 0,
    twinkle: random() * TAU,
  }));
  const boss = {
    active: false, x: FIELD.width / 2, y: -BOSS.radius, hp: 1, maxHp: 1,
    index: 1, phase: 0, fireTimer: 0, flash: 0, volley: 0, entering: false,
  };

  const upgrades = UPGRADE_DEFS.map((def) => ({
    name: def.name,
    short: def.short,
    detail: def.detail,
    level: 0,
    maxLevel: def.maxLevel,
    baseCost: def.baseCost,
    costStep: def.costStep,
    cost: def.baseCost,
  }));

  const state = {
    player,
    bullets,
    enemyBullets,
    asteroids,
    drones,
    crystalPool,
    particles,
    popups,
    stars,
    boss,
    upgrades,
    score: 0,
    lives: INITIAL_LIVES,
    wave: 1,
    crystals: 0,
    multiplier: 1,
    chain: 0,
    chainTimer: 0,
    phase: PHASE_WAVE,
    elapsed: 0,
    time: 0,
    asteroidsLeft: 0,
    dronesLeft: 0,
    spawnTimer: 0,
    droneTimer: 0,
    spawnInterval: 1,
    droneInterval: 2.6,
    speedScale: 1,
    bossWave: false,
    bossIndex: 0,
    ambientTimer: 0,
    aim: 0,
    effects: {
      shake: 0, shakeX: 0, shakeY: 0, flash: 0, flashColor: PALETTE.enemyGlow,
    },
    novaFx: { active: false, x: 0, y: 0, radius: 0, maxRadius: PLAYER.specialRadius, life: 0, maxLife: 0.5 },
  };

  function slowFactor() {
    return 1 - state.upgrades[2].level * 0.12;
  }

  function applyPlan(wave) {
    const plan = makeWavePlan(wave);
    state.bossWave = plan.boss;
    state.bossIndex = plan.bossIndex;
    state.speedScale = plan.speedScale;
    state.asteroidsLeft = plan.asteroids;
    state.dronesLeft = plan.drones;
    state.spawnInterval = plan.spawnInterval;
    state.droneInterval = plan.droneInterval;
    state.spawnTimer = 0.55;
    state.droneTimer = 2.1;
  }

  function setWave(wave) {
    state.wave = wave;
    applyPlan(wave);
  }

  function reset() {
    player.x = FIELD.width / 2;
    player.y = FIELD.height - 110;
    player.vx = 0;
    player.vy = 0;
    player.shieldMax = PLAYER.shieldMaxDefault;
    player.shield = player.shieldMax;
    player.invulnerable = 0;
    player.fireTimer = 0;
    player.specialTimer = 0;
    const pools = [bullets, enemyBullets, asteroids, drones, crystalPool, particles, popups];
    for (const pool of pools) {
      for (const entity of pool) entity.active = false;
    }
    boss.active = false;
    boss.hp = 1;
    boss.maxHp = 1;
    boss.x = FIELD.width / 2;
    boss.y = -BOSS.radius;
    boss.index = 1;
    boss.phase = 0;
    boss.fireTimer = 0;
    boss.flash = 0;
    boss.volley = 0;
    boss.entering = false;
    for (let slot = 0; slot < upgrades.length; slot += 1) {
      upgrades[slot].level = 0;
      upgrades[slot].cost = UPGRADE_DEFS[slot].baseCost;
    }
    state.score = 0;
    state.lives = INITIAL_LIVES;
    state.wave = 1;
    state.crystals = 0;
    state.multiplier = 1;
    state.chain = 0;
    state.chainTimer = 0;
    state.phase = PHASE_WAVE;
    state.elapsed = 0;
    state.ambientTimer = 0.3;
    state.aim = 0;
    state.effects.shake = 0;
    state.effects.shakeX = 0;
    state.effects.shakeY = 0;
    state.effects.flash = 0;
    state.effects.flashColor = PALETTE.enemyGlow;
    state.novaFx.active = false;
    applyPlan(1);
  }

  function addShake(amount, flash = 0, color = PALETTE.enemyGlow) {
    state.effects.shake = Math.max(state.effects.shake, amount);
    if (flash > 0) {
      state.effects.flash = Math.max(state.effects.flash, flash);
      state.effects.flashColor = color;
    }
  }

  function spawnPopup(text, x, y, color, size) {
    const popup = freeIn(popups);
    if (popup === null) return;
    popup.active = true;
    popup.x = x;
    popup.y = y;
    popup.vy = -46;
    popup.maxLife = 0.95;
    popup.life = popup.maxLife;
    popup.text = text;
    popup.color = color;
    popup.size = size;
  }

  function burst(x, y, count, color, speed) {
    for (let index = 0; index < count; index += 1) {
      const particle = freeIn(particles);
      if (particle === null) return;
      const angle = random() * TAU;
      const velocity = speed * (0.3 + random() * 0.7);
      particle.active = true;
      particle.color = color;
      particle.x = x;
      particle.y = y;
      const motionX = Math.cos(angle) * velocity;
      const motionY = Math.sin(angle) * velocity;
      particle.vx = motionX;
      particle.vy = motionY;
      const lifespan = 0.32 + random() * 0.5;
      particle.maxLife = lifespan;
      particle.life = lifespan;
      particle.size = 1.6 + random() * 3.4;
      particle.drag = 1.4 + random() * 1.4;
    }
  }

  function shapeAsteroid(rock, tier) {
    const tierSpec = ASTEROID_TIERS[tier];
    rock.tier = tier;
    rock.radius = tierSpec.radius;
    rock.maxHp = tierSpec.hp;
    rock.hp = tierSpec.hp;
    rock.flash = 0;
    for (let vertex = 0; vertex < rock.shape.length; vertex += 1) {
      rock.shape[vertex] = 0.78 + random() * 0.3;
    }
    rock.craterAngle = random() * TAU;
    rock.craterDist = 0.14 + random() * 0.34;
    rock.craterRadius = 0.12 + random() * 0.13;
  }

  function spawnAsteroid(tier = 1, x, y, speedScale) {
    const stone = freeIn(asteroids);
    if (stone === null) return null;
    stone.active = true;
    shapeAsteroid(stone, tier);
    const tierSpec = ASTEROID_TIERS[tier];
    const startX = x === undefined ? tierSpec.radius + random() * (FIELD.width - tierSpec.radius * 2) : x;
    const startY = y === undefined ? -tierSpec.radius - 6 : y;
    stone.x = startX;
    stone.y = startY;
    const heading = Math.PI / 2 + (random() - 0.5) * 0.8;
    const speed = tierSpec.speed * (speedScale === undefined ? state.speedScale : speedScale);
    stone.vx = Math.cos(heading) * speed;
    stone.vy = Math.max(32, Math.sin(heading) * speed);
    stone.phase = random() * TAU;
    stone.spin = (random() - 0.5) * 2.4;
    return stone;
  }

  function spawnDrone(x, y) {
    const unit = freeIn(drones);
    if (unit === null) return null;
    unit.active = true;
    const startX = x === undefined ? 34 + random() * (FIELD.width - 68) : x;
    const startY = y === undefined ? -22 : y;
    unit.x = startX;
    unit.y = startY;
    unit.vx = (random() - 0.5) * 60;
    unit.vy = 48;
    unit.hp = DRONE.hp + Math.floor((state.wave - 1) / 5) * 4;
    unit.phase = random() * TAU;
    unit.flash = 0;
    return unit;
  }

  function spawnCrystal(x, y) {
    const shard = freeIn(crystalPool);
    if (shard === null) return null;
    shard.active = true;
    shard.x = x;
    shard.y = y;
    shard.vx = (random() - 0.5) * 68;
    shard.vy = 18 + random() * 40;
    shard.life = CRYSTAL.lifetime;
    shard.spin = random() * TAU;
    return shard;
  }

  function dropCrystals(x, y, count) {
    for (let i = 0; i < count; i += 1) {
      spawnCrystal(x + (random() - 0.5) * 24, y + (random() - 0.5) * 24);
    }
  }

  function spawnEnemyBullet(x, y, vx, vy) {
    const shot = freeIn(enemyBullets);
    if (shot === null) return;
    shot.active = true;
    shot.x = x;
    shot.y = y;
    shot.vx = vx;
    shot.vy = vy;
  }

  function registerKill(points, x, y, color) {
    state.chain = Math.min(CHAIN.max, state.chain + 1);
    state.multiplier = state.chain;
    state.chainTimer = CHAIN.window;
    const earned = points * state.multiplier;
    state.score += earned;
    const labelSize = state.multiplier > 1 ? 23 : 19;
    spawnPopup(`+${earned}`, x, y, color, labelSize);
  }

  function spawnBoss(index) {
    boss.active = true;
    boss.index = index;
    boss.x = FIELD.width / 2;
    boss.y = -BOSS.radius - 20;
    boss.maxHp = BOSS.hpBase + BOSS.hpStep * index;
    boss.hp = boss.maxHp;
    boss.phase = 0;
    boss.volley = 0;
    boss.fireTimer = 1.4;
    boss.flash = 0;
    boss.entering = true;
  }

  function startNextWave() {
    if (state.wave >= MAX_WAVES) return 0;
    state.wave += 1;
    applyPlan(state.wave);
    state.phase = PHASE_WAVE;
    player.fireTimer = 0;
    player.shield = Math.min(player.shieldMax, player.shield + 25);
    for (const shot of enemyBullets) shot.active = false;
    if (state.bossWave) {
      spawnBoss(state.bossIndex);
      return EVENT_BOSS;
    }
    return 0;
  }

  function buyUpgrade(slot) {
    const item = upgrades[slot];
    if (!item || item.level >= item.maxLevel || state.crystals < item.cost) return false;
    state.crystals -= item.cost;
    item.level += 1;
    item.cost = item.baseCost + item.costStep * item.level;
    if (slot === 0) {
      player.shieldMax = PLAYER.shieldMaxDefault + 40 * item.level;
      player.shield = player.shieldMax;
    }
    return true;
  }

  function splitAsteroid(rock) {
    if (rock.tier === 0) return;
    const childTier = rock.tier - 1;
    const tierSpec = ASTEROID_TIERS[childTier];
    for (let side = -1; side <= 1; side += 2) {
      const fragment = freeIn(asteroids);
      if (fragment === null) continue;
      fragment.active = true;
      shapeAsteroid(fragment, childTier);
      fragment.x = rock.x + side * tierSpec.radius * 0.55;
      fragment.y = rock.y;
      const speed = (tierSpec.speed + 38) * Math.max(0.75, state.speedScale);
      fragment.vx = side * (42 + random() * 58);
      fragment.vy = Math.max(40, speed * (0.55 + random() * 0.45));
      fragment.phase = rock.phase + side * 0.7;
      fragment.spin = (random() - 0.5) * 3;
    }
  }

  function damageAsteroid(rock, damage) {
    if (!rock.active) return 0;
    rock.flash = 0.08;
    rock.hp -= damage;
    if (rock.hp > 0) return 0;
    const tierSpec = ASTEROID_TIERS[rock.tier];
    rock.active = false;
    burst(rock.x, rock.y, 8 + rock.tier * 4, PALETTE.enemyGlow, 90 + rock.tier * 40);
    splitAsteroid(rock);
    registerKill(tierSpec.score, rock.x, rock.y, PALETTE.hudText);
    dropCrystals(rock.x, rock.y, tierSpec.crystals);
    addShake(4 + rock.tier * 2.5);
    return EVENT_EXPLODE;
  }

  function shatterAsteroid(rock) {
    rock.active = false;
    burst(rock.x, rock.y, 10, PALETTE.asteroidCrater, 130);
    addShake(7);
    splitAsteroid(rock);
    return EVENT_EXPLODE;
  }

  function destroyDrone(drone, loot) {
    if (!drone.active) return 0;
    drone.active = false;
    burst(drone.x, drone.y, 12, PALETTE.enemy, 120);
    addShake(6);
    if (loot) {
      registerKill(DRONE.score, drone.x, drone.y, PALETTE.hudText);
      dropCrystals(drone.x, drone.y, DRONE.crystals);
    }
    return EVENT_EXPLODE;
  }

  function damageBoss(damage) {
    if (!boss.active) return 0;
    boss.flash = 0.07;
    boss.hp -= damage;
    if (boss.hp > 0) return 0;
    boss.active = false;
    burst(boss.x, boss.y, 42, PALETTE.enemyGlow, 230);
    burst(boss.x, boss.y, 24, PALETTE.crystal, 150);
    registerKill(BOSS.score, boss.x, boss.y, PALETTE.hudGold);
    const lootAmount = 12 + boss.index * 5;
    dropCrystals(boss.x, boss.y, lootAmount);
    addShake(30, 0.45, PALETTE.enemyGlow);
    if (state.wave >= MAX_WAVES) {
      for (const group of [asteroids, drones, enemyBullets]) {
        for (const item of group) item.active = false;
      }
      state.phase = PHASE_CLEAR;
      state.chain = 0;
      state.multiplier = 1;
      state.chainTimer = 0;
      return EVENT_EXPLODE | EVENT_VICTORY;
    }
    return EVENT_EXPLODE;
  }

  function hitPlayer() {
    if (player.invulnerable > 0) return 0;
    const px = player.x;
    const py = player.y;
    burst(px, py, 14, PALETTE.playerGlow, 165);
    addShake(17, 0.34, PALETTE.enemyGlow);
    if (player.shield > 0) {
      player.shield = Math.max(0, player.shield - PLAYER.shieldAbsorb);
      player.invulnerable = 0.85;
      spawnPopup('SHIELD', px, py - 30, PALETTE.hudCyan, 17);
      return EVENT_HIT;
    }
    player.shield = 0;
    state.lives -= 1;
    player.invulnerable = PLAYER.invulnerableTime;
    spawnPopup('-1 LIFE', px, py - 34, PALETTE.hudMagenta, 19);
    if (state.lives <= 0) {
      addShake(28, 0.55, PALETTE.enemyGlow);
      return EVENT_HIT | EVENT_OVER;
    }
    return EVENT_HIT;
  }

  function findAimTarget() {
    let pick = null;
    let nearest = Infinity;
    const weigh = (candidate, buffer = 0) => {
      if (!candidate.active) return;
      const distance = Math.hypot(candidate.x - player.x, candidate.y - player.y) - buffer;
      if (distance < nearest) {
        nearest = distance;
        pick = candidate;
      }
    };
    weigh(boss, 40);
    for (const rock of asteroids) weigh(rock);
    for (const drone of drones) weigh(drone);
    return pick;
  }

  function fireVolley() {
    const volleySize = 1 + state.upgrades[1].level;
    const locked = findAimTarget();
    let baseline = 0;
    if (locked !== null && locked.y < player.y + 40) {
      const horiz = locked.x - player.x;
      const vert = locked.y - (player.y - PLAYER.radius);
      baseline = Math.max(-0.8, Math.min(0.8, Math.atan2(horiz, -vert)));
    }
    state.aim = baseline;
    for (let shot = 0; shot < volleySize; shot += 1) {
      const projectile = freeIn(bullets);
      if (projectile === null) break;
      const heading = baseline + (shot - (volleySize - 1) / 2) * 0.13;
      projectile.active = true;
      projectile.x = player.x + Math.sin(heading) * PLAYER.radius * 0.45;
      projectile.y = player.y - PLAYER.radius * 0.9;
      projectile.vx = Math.sin(heading) * BULLET.speed;
      projectile.vy = -Math.cos(heading) * BULLET.speed;
    }
    player.fireTimer = PLAYER.fireInterval;
    return EVENT_SHOT;
  }

  function fireNova() {
    player.specialTimer = PLAYER.specialCooldown;
    const blastRadius = PLAYER.specialRadius;
    let outcome = EVENT_NOVA;
    for (let i = 0; i < asteroids.length; i += 1) {
      const rock = asteroids[i];
      if (!rock.active) continue;
      if (Math.hypot(rock.x - player.x, rock.y - player.y) < blastRadius + rock.radius) {
        outcome |= damageAsteroid(rock, PLAYER.specialDamage);
      }
    }
    for (let i = 0; i < drones.length; i += 1) {
      const foe = drones[i];
      if (foe.active && Math.hypot(foe.x - player.x, foe.y - player.y) < blastRadius + DRONE.radius) {
        outcome |= destroyDrone(foe, true);
      }
    }
    if (boss.active && Math.hypot(boss.x - player.x, boss.y - player.y) < blastRadius + BOSS.radius) {
      outcome |= damageBoss(PLAYER.specialDamage);
    }
    for (let i = 0; i < enemyBullets.length; i += 1) {
      const shot = enemyBullets[i];
      if (!shot.active) continue;
      if (Math.hypot(shot.x - player.x, shot.y - player.y) < blastRadius + ENEMY_BULLET.radius) {
        shot.active = false;
      }
    }
    const wave = state.novaFx;
    wave.active = true;
    wave.x = player.x;
    wave.y = player.y;
    wave.radius = 0;
    wave.maxRadius = blastRadius;
    wave.maxLife = 0.55;
    wave.life = wave.maxLife;
    burst(player.x, player.y, 38, PALETTE.playerGlow, blastRadius * 1.7);
    addShake(20, 0.25, PALETTE.playerGlow);
    return outcome;
  }

  function updateStars(dt) {
    for (let i = 0; i < stars.length; i += 1) {
      const speck = stars[i];
      speck.y += speck.speed * dt;
      if (speck.y > FIELD.height + 2) {
        speck.y = -2;
        speck.x = random() * FIELD.width;
      }
    }
  }

  function updateParticles(dt) {
    for (let i = 0; i < particles.length; i += 1) {
      const fleck = particles[i];
      if (!fleck.active) continue;
      fleck.life -= dt;
      if (fleck.life <= 0) {
        fleck.active = false;
        continue;
      }
      const slow = Math.max(0, 1 - fleck.drag * dt);
      fleck.vx *= slow;
      fleck.vy *= slow;
      fleck.x += fleck.vx * dt;
      fleck.y += fleck.vy * dt;
    }
  }

  function updatePopups(dt) {
    for (let i = 0; i < popups.length; i += 1) {
      const label = popups[i];
      if (!label.active) continue;
      label.life -= dt;
      if (label.life <= 0) {
        label.active = false;
        continue;
      }
      label.y += label.vy * dt;
      label.vy *= Math.max(0, 1 - 1.6 * dt);
    }
  }

  function updateEffects(dt) {
    const screen = state.effects;
    if (screen.shake > 0.15) {
      screen.shake *= Math.pow(0.87, dt * 60);
      screen.shakeX = (random() * 2 - 1) * screen.shake;
      screen.shakeY = (random() * 2 - 1) * screen.shake;
    } else {
      screen.shake = 0;
      screen.shakeX = 0;
      screen.shakeY = 0;
    }
    if (screen.flash > 0) screen.flash = Math.max(0, screen.flash - dt * 2.6);
    const wave = state.novaFx;
    if (wave.active) {
      wave.life -= dt;
      if (wave.life <= 0) wave.active = false;
      else wave.radius = wave.maxRadius * (1 - wave.life / wave.maxLife);
    }
  }

  function updatePlayer(dt, input) {
    let outcome = 0;
    let moveX = input && Number.isFinite(input.dx) ? input.dx : 0;
    let moveY = input && Number.isFinite(input.dy) ? input.dy : 0;
    const magnitude = Math.hypot(moveX, moveY);
    if (magnitude > 1) {
      moveX /= magnitude;
      moveY /= magnitude;
    }
    player.vx += moveX * PLAYER.accel * dt;
    player.vy += moveY * PLAYER.accel * dt;
    const friction = Math.pow(PLAYER.drag, dt * 60);
    player.vx *= friction;
    player.vy *= friction;
    const velocity = Math.hypot(player.vx, player.vy);
    if (velocity > PLAYER.speed) {
      player.vx = (player.vx / velocity) * PLAYER.speed;
      player.vy = (player.vy / velocity) * PLAYER.speed;
    }
    player.x = Math.min(FIELD.width - PLAYER.radius, Math.max(PLAYER.radius, player.x + player.vx * dt));
    player.y = Math.min(PLAYER.maxY, Math.max(PLAYER.minY, player.y + player.vy * dt));
    if (player.invulnerable > 0) player.invulnerable = Math.max(0, player.invulnerable - dt);
    if (player.specialTimer > 0) player.specialTimer = Math.max(0, player.specialTimer - dt);
    player.fireTimer -= dt;
    if (player.fireTimer <= 0) outcome |= fireVolley();
    if (input && input.special && player.specialTimer === 0) outcome |= fireNova();
    if (random() < 0.24) {
      const exhaust = freeIn(particles);
      if (exhaust !== null) {
        exhaust.active = true;
        exhaust.x = player.x + (random() - 0.5) * 9;
        exhaust.y = player.y + PLAYER.radius * 0.8;
        exhaust.vx = -player.vx * 0.12 + (random() - 0.5) * 24;
        exhaust.vy = 85 + random() * 60;
        exhaust.maxLife = 0.2 + random() * 0.18;
        exhaust.life = exhaust.maxLife;
        exhaust.size = 1.2 + random() * 1.8;
        exhaust.color = PALETTE.playerEngine;
        exhaust.drag = 2;
      }
    }
    return outcome;
  }

  function updateAsteroids(edt) {
    for (let i = 0; i < asteroids.length; i += 1) {
      const rock = asteroids[i];
      if (!rock.active) continue;
      rock.phase += rock.spin * edt;
      rock.x += rock.vx * edt;
      rock.y += rock.vy * edt;
      if (rock.x < rock.radius) {
        rock.x = rock.radius;
        rock.vx = Math.abs(rock.vx);
      } else if (rock.x > FIELD.width - rock.radius) {
        rock.x = FIELD.width - rock.radius;
        rock.vx = -Math.abs(rock.vx);
      }
      if (rock.flash > 0) rock.flash = Math.max(0, rock.flash - edt);
      if (rock.y > FIELD.height + rock.radius) rock.active = false;
    }
  }

  function updateDrones(edt) {
    for (let i = 0; i < drones.length; i += 1) {
      const foe = drones[i];
      if (!foe.active) continue;
      const towardX = player.x - foe.x;
      const towardY = player.y - foe.y;
      const gap = Math.hypot(towardX, towardY) || 1;
      foe.vx += (towardX / gap) * DRONE.accel * edt;
      foe.vy += (towardY / gap) * DRONE.accel * edt;
      const velocity = Math.hypot(foe.vx, foe.vy);
      if (velocity > DRONE.speed) {
        foe.vx = (foe.vx / velocity) * DRONE.speed;
        foe.vy = (foe.vy / velocity) * DRONE.speed;
      }
      foe.x = Math.min(FIELD.width - DRONE.radius, Math.max(DRONE.radius, foe.x + foe.vx * edt));
      foe.y = Math.min(FIELD.height - DRONE.radius, Math.max(DRONE.radius, foe.y + foe.vy * edt));
      foe.phase += edt * 6;
      if (foe.flash > 0) foe.flash = Math.max(0, foe.flash - edt);
    }
  }

  function updateBoss(edt) {
    if (!boss.active) return;
    if (boss.flash > 0) boss.flash = Math.max(0, boss.flash - edt);
    if (boss.entering) {
      boss.y = Math.min(BOSS.restY, boss.y + 105 * edt);
      if (boss.y >= BOSS.restY) boss.entering = false;
      return;
    }
    boss.phase += edt;
    boss.x = FIELD.width / 2 + Math.sin(boss.phase * 0.55) * (FIELD.width / 2 - 190);
    boss.y = BOSS.restY + Math.sin(boss.phase * 1.7) * 18;
    boss.fireTimer -= edt;
    if (boss.fireTimer > 0) return;
    boss.fireTimer = BOSS.fireInterval * Math.max(0.62, 1 - boss.index * 0.11);
    boss.volley = (boss.volley + 1) % 4;
    if (boss.volley === 0) {
      const ringCount = 8 + boss.index * 2;
      for (let i = 0; i < ringCount; i += 1) {
        const heading = (i / ringCount) * TAU + boss.phase * 0.25;
        spawnEnemyBullet(
          boss.x,
          boss.y,
          Math.cos(heading) * ENEMY_BULLET.speed,
          Math.sin(heading) * ENEMY_BULLET.speed,
        );
      }
    } else {
      const burstCount = 1 + boss.index;
      const heading = Math.atan2(player.y - boss.y, player.x - boss.x);
      for (let i = 0; i < burstCount; i += 1) {
        const shotAngle = heading + (i - (burstCount - 1) / 2) * 0.16;
        spawnEnemyBullet(
          boss.x + Math.cos(shotAngle) * BOSS.radius * 0.55,
          boss.y + Math.sin(shotAngle) * BOSS.radius * 0.55,
          Math.cos(shotAngle) * ENEMY_BULLET.speed,
          Math.sin(shotAngle) * ENEMY_BULLET.speed,
        );
      }
    }
  }

  function updateBullets(dt) {
    for (let i = 0; i < bullets.length; i += 1) {
      const shot = bullets[i];
      if (!shot.active) continue;
      shot.x += shot.vx * dt;
      shot.y += shot.vy * dt;
      if (shot.y < -16 || shot.x < -16 || shot.x > FIELD.width + 16) shot.active = false;
    }
  }
  function advanceFoeShots(stepTime) {
    for (let i = 0; i < enemyBullets.length; i += 1) {
      const shot = enemyBullets[i];
      if (!shot.active) continue;
      shot.x += shot.vx * stepTime;
      shot.y += shot.vy * stepTime;
      if (shot.y < -16 || shot.y > FIELD.height + 16 || shot.x < -16 || shot.x > FIELD.width + 16) {
        shot.active = false;
      }
    }
  }

  function resolveShotImpacts() {
    let flags = 0;
    for (let i = 0; i < bullets.length; i += 1) {
      const shot = bullets[i];
      if (!shot.active) continue;
      let consumed = false;
      for (let k = 0; k < asteroids.length && !consumed; k += 1) {
        const rock = asteroids[k];
        if (!rock.active) continue;
        const sx = rock.x - shot.x;
        const sy = rock.y - shot.y;
        const reach = rock.radius + BULLET.radius;
        if (sx * sx + sy * sy < reach * reach) {
          shot.active = false;
          consumed = true;
          flags |= damageAsteroid(rock, BULLET.damage);
        }
      }
      for (let k = 0; k < drones.length && !consumed; k += 1) {
        const foe = drones[k];
        if (!foe.active) continue;
        const sx = foe.x - shot.x;
        const sy = foe.y - shot.y;
        const reach = DRONE.radius + BULLET.radius;
        if (sx * sx + sy * sy < reach * reach) {
          shot.active = false;
          consumed = true;
          foe.hp -= BULLET.damage;
          foe.flash = 0.08;
          if (foe.hp <= 0) flags |= destroyDrone(foe, true);
        }
      }
      if (!consumed && boss.active) {
        const sx = boss.x - shot.x;
        const sy = boss.y - shot.y;
        const reach = BOSS.radius + BULLET.radius;
        if (sx * sx + sy * sy < reach * reach) {
          shot.active = false;
          flags |= damageBoss(BULLET.damage);
        }
      }
    }
    return flags;
  }

  function checkShipCollisions() {
    let flags = 0;
    for (let i = 0; i < enemyBullets.length; i += 1) {
      const shot = enemyBullets[i];
      if (!shot.active) continue;
      const sx = shot.x - player.x;
      const sy = shot.y - player.y;
      const reach = PLAYER.radius + ENEMY_BULLET.radius;
      if (sx * sx + sy * sy < reach * reach) {
        shot.active = false;
        flags |= hitPlayer();
      }
    }
    if (player.invulnerable > 0) return flags;
    for (let i = 0; i < asteroids.length; i += 1) {
      const rock = asteroids[i];
      if (!rock.active) continue;
      const sx = rock.x - player.x;
      const sy = rock.y - player.y;
      const reach = rock.radius + PLAYER.radius * 0.85;
      if (sx * sx + sy * sy < reach * reach) {
        flags |= shatterAsteroid(rock);
        flags |= hitPlayer();
        return flags;
      }
    }
    for (let i = 0; i < drones.length; i += 1) {
      const foe = drones[i];
      if (!foe.active) continue;
      const sx = foe.x - player.x;
      const sy = foe.y - player.y;
      const reach = DRONE.radius + PLAYER.radius * 0.85;
      if (sx * sx + sy * sy < reach * reach) {
        flags |= destroyDrone(foe, false);
        flags |= hitPlayer();
        return flags;
      }
    }
    if (boss.active) {
      const sx = boss.x - player.x;
      const sy = boss.y - player.y;
      const reach = BOSS.radius + PLAYER.radius * 0.8;
      if (sx * sx + sy * sy < reach * reach) flags |= hitPlayer();
    }
    return flags;
  }

  function advanceGems(dt) {
    let flags = 0;
    for (let i = 0; i < crystalPool.length; i += 1) {
      const gem = crystalPool[i];
      if (!gem.active) continue;
      gem.life -= dt;
      if (gem.life <= 0 || gem.y > FIELD.height + CRYSTAL.radius) {
        gem.active = false;
        continue;
      }
      const sx = player.x - gem.x;
      const sy = player.y - gem.y;
      const dist = Math.hypot(sx, sy) || 1;
      if (dist < CRYSTAL.magnetRange) {
        gem.vx += (sx / dist) * CRYSTAL.magnetAccel * dt;
        gem.vy += (sy / dist) * CRYSTAL.magnetAccel * dt;
      }
      gem.vx *= Math.max(0, 1 - 1.4 * dt);
      gem.vy *= Math.max(0, 1 - 1.4 * dt);
      gem.vy += 22 * dt;
      gem.x += gem.vx * dt;
      gem.y += gem.vy * dt;
      gem.spin += dt * 2.6;
      if (dist < PLAYER.radius + CRYSTAL.radius + 7) {
        gem.active = false;
        state.crystals += 1;
        state.score += CRYSTAL.score * state.multiplier;
        spawnPopup('+1', gem.x, gem.y, PALETTE.crystal, 16);
        flags |= EVENT_CRYSTAL;
      }
    }
    return flags;
  }

  function tickCombo(dt) {
    if (state.chainTimer <= 0) return;
    state.chainTimer -= dt;
    if (state.chainTimer <= 0) {
      state.chain = 0;
      state.multiplier = 1;
    }
  }

  function scheduleSpawns(dt) {
    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0 && state.asteroidsLeft > 0) {
      const bigOdds = Math.min(0.5, 0.08 + state.wave * 0.035);
      const roll = random();
      const tier = roll < bigOdds ? 2 : roll < bigOdds + 0.42 ? 1 : 0;
      if (spawnAsteroid(tier) !== null) {
        state.asteroidsLeft -= 1;
        state.spawnTimer += state.spawnInterval;
      } else {
        state.spawnTimer = 0.2;
      }
    }
    if (state.dronesLeft > 0) {
      state.droneTimer -= dt;
      if (state.droneTimer <= 0) {
        if (spawnDrone() !== null) state.dronesLeft -= 1;
        state.droneTimer += state.droneInterval;
      }
    }
  }

  function detectWaveComplete() {
    if (state.phase !== PHASE_WAVE) return 0;
    if (state.asteroidsLeft > 0 || state.dronesLeft > 0 || boss.active) return 0;
    for (let i = 0; i < asteroids.length; i += 1) {
      if (asteroids[i].active) return 0;
    }
    for (let i = 0; i < drones.length; i += 1) {
      if (drones[i].active) return 0;
    }
    state.phase = PHASE_CLEAR;
    // Sweep up the drops from the final kill so the upgrade screen doesn't lose them.
    let flags = EVENT_WAVE_CLEAR;
    let gathered = 0;
    for (let i = 0; i < crystalPool.length; i += 1) {
      const gem = crystalPool[i];
      if (!gem.active) continue;
      gem.active = false;
      gathered += 1;
    }
    if (gathered > 0) {
      state.crystals += gathered;
      state.score += CRYSTAL.score * state.multiplier * gathered;
      spawnPopup(`+${gathered}`, player.x, player.y - 48, PALETTE.crystal, 18);
      flags |= EVENT_CRYSTAL;
    }
    state.chain = 0;
    state.multiplier = 1;
    state.chainTimer = 0;
    for (const shot of enemyBullets) shot.active = false;
    return flags;
  }

  /**
   * Advance the world by a single fixed tick. `input` carries {dx, dy, special} - the
   * thrust vector and nova trigger. When `harmless` is true, used behind the title
   * menu, rocks float by without ever striking the ship or awarding points.
   */
  function step(dt, input, harmless) {
    let flags = 0;
    state.time += dt;
    updateEffects(dt);
    updateStars(dt);
    updateParticles(dt);
    updatePopups(dt);
    if (harmless) {
      state.ambientTimer -= dt;
      if (state.ambientTimer <= 0) {
        spawnAsteroid((random() * ASTEROID_TIERS.length) | 0, undefined, undefined, 0.7);
        state.ambientTimer += 0.85 + random() * 0.5;
      }
      updateAsteroids(dt);
      return 0;
    }
    if (state.phase === PHASE_CLEAR) {
      advanceGems(dt);
      return 0;
    }
    state.elapsed += dt;
    flags |= updatePlayer(dt, input);
    const slowed = dt * slowFactor();
    updateAsteroids(slowed);
    updateDrones(slowed);
    updateBoss(slowed);
    updateBullets(dt);
    advanceFoeShots(slowed);
    scheduleSpawns(dt);
    flags |= resolveShotImpacts();
    flags |= checkShipCollisions();
    flags |= advanceGems(dt);
    tickCombo(dt);
    flags |= detectWaveComplete();
    return flags;
  }

  reset();
  return {
    state,
    reset,
    step,
    buyUpgrade,
    startNextWave,
    setWave,
    spawnAsteroid,
    spawnDrone,
    spawnCrystal,
    spawnBoss,
    spawnEnemyBullet,
    spawnPopup,
    burst,
    random,
  };
}
