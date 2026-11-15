// The game's rules and state, with no drawing and no browser in it: the player's ship and its
// autofire, waves of splitting asteroids, homing drones and the boss every fifth wave, the
// energy crystals they drop, collisions, the score with its chain multiplier, lives, and the
// upgrades bought between waves. step() advances one fixed step and returns what happened as
// bit flags, so the caller can react without the world knowing about screens or sound.
// Nothing here allocates after createWorld returns.
import { FIELD, INITIAL_LIVES, MAX_WAVES, PALETTE, PLAYER } from './config.js';

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

const BULLET_SPEED = 820;
const BULLET_DAMAGE = 10;
const ENEMY_BULLET_SPEED = 250;

/** Index 0 is the smallest shard; a rock that dies splits into two rocks of the tier below. */
const ASTEROID_TIERS = [
  { radius: 15, hp: 10, speed: 95, score: 15, crystals: 1 },
  { radius: 27, hp: 20, speed: 72, score: 30, crystals: 2 },
  { radius: 44, hp: 30, speed: 55, score: 50, crystals: 3 },
];

const DRONE = { radius: 14, hp: 20, speed: 165, accel: 240, score: 60, crystals: 4 };
const BOSS = { radius: 62, hpBase: 220, hpStep: 180, fireInterval: 1.15, score: 900, y: 148 };
const CRYSTAL = { radius: 9, lifetime: 10 };
const CHAIN_WINDOW = 2.2;
const CHAIN_MAX = 8;
const SHIELD_ABSORB = 50;

const UPGRADE_DEFS = [
  { name: 'Shield', detail: '+60 shield, refilled now', baseCost: 40, costStep: 30, maxLevel: 3 },
  { name: 'Spread Shot', detail: '+1 stream per volley', baseCost: 55, costStep: 45, maxLevel: 3 },
  { name: 'Slow-Time', detail: 'Enemies 15% slower', baseCost: 50, costStep: 45, maxLevel: 3 },
];

const POOL = { bullets: 64, enemyBullets: 48, asteroids: 64, drones: 10, crystals: 56, particles: 320 };
const STAR_COUNT = 90;

/** What each wave throws at the ship; every fifth wave is a boss with a few rocks for cover. */
function wavePlan(wave) {
  const boss = wave % 5 === 0;
  const bossIndex = wave / 5;
  return {
    boss,
    bossIndex: boss ? bossIndex : 0,
    asteroids: boss ? 3 + bossIndex : 5 + wave,
    drones: boss ? 0 : Math.floor((wave - 1) / 2),
    spawnInterval: Math.max(0.4, 1.2 - wave * 0.05),
    droneInterval: 2.6,
    speedScale: 1 + (wave - 1) * 0.06,
  };
}

function freeIn(list) {
  for (let index = 0; index < list.length; index += 1) {
    if (!list[index].active) return list[index];
  }
  return null;
}

export function createWorld(random) {
  const player = {
    x: FIELD.width / 2, y: FIELD.height - 90, vx: 0, vy: 0,
    shield: PLAYER.shieldMaxDefault, shieldMax: PLAYER.shieldMaxDefault,
    invulnerable: 0, fireTimer: 0, specialTimer: 0,
  };

  const bullets = [];
  for (let index = 0; index < POOL.bullets; index += 1) {
    bullets.push({ active: false, x: 0, y: 0, vx: 0, vy: 0 });
  }
  const enemyBullets = [];
  for (let index = 0; index < POOL.enemyBullets; index += 1) {
    enemyBullets.push({ active: false, x: 0, y: 0, vx: 0, vy: 0 });
  }
  const asteroids = [];
  for (let index = 0; index < POOL.asteroids; index += 1) {
    asteroids.push({ active: false, tier: 0, radius: 0, hp: 0, x: 0, y: 0, vx: 0, vy: 0, phase: 0, spin: 0, wobble: 1 });
  }
  const drones = [];
  for (let index = 0; index < POOL.drones; index += 1) {
    drones.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, hp: 0, phase: 0 });
  }
  const crystalPool = [];
  for (let index = 0; index < POOL.crystals; index += 1) {
    crystalPool.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, spin: 0 });
  }
  const particles = [];
  for (let index = 0; index < POOL.particles; index += 1) {
    particles.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, size: 2, color: PALETTE.starWhite });
  }
  const boss = { active: false, x: FIELD.width / 2, y: -BOSS.radius, hp: 1, maxHp: 1, index: 1, phase: 0, fireTimer: 0 };

  const stars = [];
  for (let index = 0; index < STAR_COUNT; index += 1) {
    stars.push({
      x: random() * FIELD.width, y: random() * FIELD.height,
      speed: 18 + random() * 55, size: random() < 0.8 ? 1.5 : 2.5, tint: (random() * 3) | 0,
    });
  }

  const upgrades = UPGRADE_DEFS.map((def) => ({
    name: def.name, detail: def.detail,
    level: 0, maxLevel: def.maxLevel, cost: def.baseCost, costStep: def.costStep,
  }));

  const state = {
    player, bullets, enemyBullets, asteroids, drones, crystalPool, particles, stars, boss, upgrades,
    score: 0, lives: INITIAL_LIVES, wave: 1, crystals: 0,
    multiplier: 1, chain: 0, chainTimer: 0,
    phase: PHASE_WAVE, elapsed: 0,
    asteroidsLeft: 0, dronesLeft: 0, spawnTimer: 0, droneTimer: 0,
    spawnInterval: 1, droneInterval: 2.6, speedScale: 1,
    bossWave: false, bossIndex: 0, ambientTimer: 0,
  };

  function slowFactor() {
    return 1 - 0.15 * state.upgrades[2].level;
  }

  function applyPlan(wave) {
    const plan = wavePlan(wave);
    state.bossWave = plan.boss;
    state.bossIndex = plan.bossIndex;
    state.speedScale = plan.speedScale;
    state.asteroidsLeft = plan.asteroids;
    state.dronesLeft = plan.drones;
    state.spawnInterval = plan.spawnInterval;
    state.droneInterval = plan.droneInterval;
    state.spawnTimer = 0.6;
    state.droneTimer = 2.2;
  }

  function reset() {
    player.x = FIELD.width / 2;
    player.y = FIELD.height - 90;
    player.vx = 0;
    player.vy = 0;
    player.shieldMax = PLAYER.shieldMaxDefault;
    player.shield = player.shieldMax;
    player.invulnerable = 0;
    player.fireTimer = 0;
    player.specialTimer = 0;
    for (const group of [bullets, enemyBullets, asteroids, drones, crystalPool, particles]) {
      for (const item of group) item.active = false;
    }
    boss.active = false;
    boss.hp = 1;
    boss.maxHp = 1;
    boss.x = FIELD.width / 2;
    boss.y = -BOSS.radius;
    boss.index = 1;
    boss.phase = 0;
    boss.fireTimer = 0;
    for (let index = 0; index < upgrades.length; index += 1) {
      upgrades[index].level = 0;
      upgrades[index].cost = UPGRADE_DEFS[index].baseCost;
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
    state.ambientTimer = 0.4;
    applyPlan(1);
  }

  function buyUpgrade(slot) {
    const upgrade = upgrades[slot];
    if (!upgrade || upgrade.level >= upgrade.maxLevel || state.crystals < upgrade.cost) return false;
    state.crystals -= upgrade.cost;
    upgrade.level += 1;
    upgrade.cost += upgrade.costStep;
    if (slot === 0) {
      player.shieldMax = PLAYER.shieldMaxDefault + 60 * upgrade.level;
      player.shield = player.shieldMax;
    }
    return true;
  }

  function startNextWave() {
    if (state.wave >= MAX_WAVES) return 0;
    state.wave += 1;
    applyPlan(state.wave);
    state.phase = PHASE_WAVE;
    player.shield = player.shieldMax;
    player.fireTimer = 0;
    if (state.bossWave) {
      spawnBoss(state.bossIndex);
      return EVENT_BOSS;
    }
    return 0;
  }

  function spawnBoss(index) {
    boss.active = true;
    boss.index = index;
    boss.maxHp = BOSS.hpBase + BOSS.hpStep * index;
    boss.hp = boss.maxHp;
    boss.x = FIELD.width / 2;
    boss.y = -BOSS.radius - 10;
    boss.phase = 0;
    boss.fireTimer = 1.6;
  }

  function spawnAsteroid(tier, speedScale) {
    const asteroid = freeIn(asteroids);
    if (asteroid === null) return null;
    const spec = ASTEROID_TIERS[tier];
    asteroid.active = true;
    asteroid.tier = tier;
    asteroid.radius = spec.radius;
    asteroid.hp = spec.hp;
    asteroid.x = spec.radius + random() * (FIELD.width - spec.radius * 2);
    asteroid.y = -spec.radius - 4;
    const angle = Math.PI / 2 + (random() - 0.5) * 0.7;
    const speed = spec.speed * speedScale;
    asteroid.vx = Math.cos(angle) * speed;
    asteroid.vy = Math.sin(angle) * speed;
    asteroid.phase = random() * Math.PI * 2;
    asteroid.spin = (random() - 0.5) * 2.2;
    asteroid.wobble = 0.75 + random() * 0.3;
    return asteroid;
  }

  function spawnDrone() {
    const drone = freeIn(drones);
    if (drone === null) return null;
    drone.active = true;
    drone.x = 40 + random() * (FIELD.width - 80);
    drone.y = -20;
    drone.vx = 0;
    drone.vy = 40;
    drone.hp = DRONE.hp;
    drone.phase = random() * Math.PI * 2;
    return drone;
  }

  function dropCrystals(x, y, count) {
    for (let index = 0; index < count; index += 1) {
      const crystal = freeIn(crystalPool);
      if (crystal === null) return;
      crystal.active = true;
      crystal.x = x + (random() - 0.5) * 18;
      crystal.y = y + (random() - 0.5) * 18;
      const angle = random() * Math.PI * 2;
      const speed = 30 + random() * 46;
      crystal.vx = Math.cos(angle) * speed;
      crystal.vy = Math.sin(angle) * speed * 0.6 + 20;
      crystal.life = CRYSTAL.lifetime;
      crystal.spin = random() * Math.PI * 2;
    }
  }

  function explode(x, y, count, color, speed) {
    for (let index = 0; index < count; index += 1) {
      const particle = freeIn(particles);
      if (particle === null) return;
      const angle = random() * Math.PI * 2;
      const velocity = speed * (0.3 + random() * 0.7);
      particle.active = true;
      particle.x = x;
      particle.y = y;
      particle.vx = Math.cos(angle) * velocity;
      particle.vy = Math.sin(angle) * velocity;
      particle.maxLife = 0.35 + random() * 0.45;
      particle.life = particle.maxLife;
      particle.size = 2 + random() * 3;
      particle.color = color;
    }
  }

  function addKill(points) {
    state.chain = Math.min(CHAIN_MAX, state.chain + 1);
    state.multiplier = state.chain;
    state.chainTimer = CHAIN_WINDOW;
    state.score += points * state.multiplier;
  }

  function splitAsteroid(asteroid) {
    if (asteroid.tier === 0) return;
    const tier = asteroid.tier - 1;
    const spec = ASTEROID_TIERS[tier];
    for (let side = -1; side <= 1; side += 2) {
      const child = freeIn(asteroids);
      if (child === null) continue;
      child.active = true;
      child.tier = tier;
      child.radius = spec.radius;
      child.hp = spec.hp;
      child.x = asteroid.x + side * spec.radius;
      child.y = asteroid.y;
      const angle = random() * Math.PI * 2;
      const speed = spec.speed * state.speedScale + 55;
      child.vx = Math.cos(angle) * speed + side * 30;
      child.vy = Math.abs(Math.sin(angle)) * speed + 20;
      child.phase = asteroid.phase + side;
      child.spin = (random() - 0.5) * 2.2;
      child.wobble = asteroid.wobble;
    }
  }

  function damageAsteroid(asteroid, damage) {
    asteroid.hp -= damage;
    if (asteroid.hp > 0) return 0;
    asteroid.active = false;
    explode(asteroid.x, asteroid.y, 8 + asteroid.tier * 4, PALETTE.enemyGlow, 90 + asteroid.tier * 40);
    splitAsteroid(asteroid);
    addKill(ASTEROID_TIERS[asteroid.tier].score);
    dropCrystals(asteroid.x, asteroid.y, ASTEROID_TIERS[asteroid.tier].crystals);
    return EVENT_EXPLODE;
  }

  function shatterAsteroid(asteroid) {
    asteroid.active = false;
    explode(asteroid.x, asteroid.y, 10, PALETTE.asteroidCrater, 120);
    splitAsteroid(asteroid);
    return 0;
  }

  function destroyDrone(drone, loot) {
    drone.active = false;
    explode(drone.x, drone.y, 12, PALETTE.enemyMagenta, 110);
    if (loot) {
      addKill(DRONE.score);
      dropCrystals(drone.x, drone.y, DRONE.crystals);
    }
    return EVENT_EXPLODE;
  }

  function damageBoss(damage) {
    if (!boss.active) return 0;
    boss.hp -= damage;
    if (boss.hp > 0) return 0;
    boss.active = false;
    explode(boss.x, boss.y, 40, PALETTE.enemyGlow, 220);
    explode(boss.x, boss.y, 24, PALETTE.crystalGold, 140);
    addKill(BOSS.score);
    dropCrystals(boss.x, boss.y, 12 + boss.index * 6);
    if (state.wave >= MAX_WAVES) {
      for (const group of [asteroids, drones, enemyBullets]) {
        for (const item of group) item.active = false;
      }
      state.chain = 0;
      state.multiplier = 1;
      state.chainTimer = 0;
      state.phase = PHASE_CLEAR;
      return EVENT_EXPLODE | EVENT_VICTORY;
    }
    return EVENT_EXPLODE;
  }

  function hitPlayer() {
    if (player.invulnerable > 0) return 0;
    if (player.shield >= SHIELD_ABSORB) {
      player.shield -= SHIELD_ABSORB;
      player.invulnerable = 0.8;
      explode(player.x, player.y, 10, PALETTE.playerGlow, 120);
      return EVENT_HIT;
    }
    player.shield = 0;
    state.lives -= 1;
    player.invulnerable = PLAYER.invulnerableTime;
    explode(player.x, player.y, 16, PALETTE.playerGlow, 160);
    if (state.lives <= 0) return EVENT_HIT | EVENT_OVER;
    return EVENT_HIT;
  }

  function fireVolley() {
    const count = 1 + state.upgrades[1].level;
    for (let index = 0; index < count; index += 1) {
      const bullet = freeIn(bullets);
      if (bullet === null) break;
      const angle = (index - (count - 1) / 2) * 0.14;
      bullet.active = true;
      bullet.x = player.x;
      bullet.y = player.y - PLAYER.radius;
      bullet.vx = Math.sin(angle) * BULLET_SPEED;
      bullet.vy = -Math.cos(angle) * BULLET_SPEED;
    }
    player.fireTimer += PLAYER.fireInterval;
    return EVENT_SHOT;
  }

  function fireNova() {
    player.specialTimer = PLAYER.specialCooldown;
    const radius = PLAYER.specialRadius;
    for (let index = 0; index < asteroids.length; index += 1) {
      const asteroid = asteroids[index];
      if (!asteroid.active) continue;
      if (Math.hypot(asteroid.x - player.x, asteroid.y - player.y) < radius + asteroid.radius) {
        damageAsteroid(asteroid, PLAYER.specialDamage);
      }
    }
    for (let index = 0; index < drones.length; index += 1) {
      const drone = drones[index];
      if (drone.active && Math.hypot(drone.x - player.x, drone.y - player.y) < radius + DRONE.radius) {
        destroyDrone(drone, true);
      }
    }
    if (boss.active && Math.hypot(boss.x - player.x, boss.y - player.y) < radius + BOSS.radius) {
      damageBoss(PLAYER.specialDamage);
    }
    for (let index = 0; index < enemyBullets.length; index += 1) {
      const bullet = enemyBullets[index];
      if (bullet.active && Math.hypot(bullet.x - player.x, bullet.y - player.y) < radius + 10) {
        bullet.active = false;
      }
    }
    explode(player.x, player.y, 36, PALETTE.playerGlow, radius * 1.6);
    return EVENT_NOVA;
  }

  function spawnEnemyBullet(x, y, vx, vy) {
    const bullet = freeIn(enemyBullets);
    if (bullet === null) return;
    bullet.active = true;
    bullet.x = x;
    bullet.y = y;
    bullet.vx = vx;
    bullet.vy = vy;
  }
  function updateStars(dt) {
    for (let index = 0; index < stars.length; index += 1) {
      const star = stars[index];
      star.y += star.speed * dt;
      if (star.y > FIELD.height) star.y = -2;
    }
  }

  function updateParticles(dt) {
    for (let index = 0; index < particles.length; index += 1) {
      const particle = particles[index];
      if (!particle.active) continue;
      particle.life -= dt;
      if (particle.life <= 0) {
        particle.active = false;
        continue;
      }
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vx -= particle.vx * 2.5 * dt;
      particle.vy -= particle.vy * 2.5 * dt;
    }
  }

  function updateAsteroids(edt) {
    for (let index = 0; index < asteroids.length; index += 1) {
      const asteroid = asteroids[index];
      if (!asteroid.active) continue;
      asteroid.phase += asteroid.spin * edt;
      asteroid.x += asteroid.vx * edt;
      asteroid.y += asteroid.vy * edt;
      if (asteroid.x < asteroid.radius) {
        asteroid.x = asteroid.radius;
        asteroid.vx = -asteroid.vx;
      } else if (asteroid.x > FIELD.width - asteroid.radius) {
        asteroid.x = FIELD.width - asteroid.radius;
        asteroid.vx = -asteroid.vx;
      }
      if (asteroid.y > FIELD.height + asteroid.radius) asteroid.active = false;
    }
  }

  function updateDrones(edt) {
    for (let index = 0; index < drones.length; index += 1) {
      const drone = drones[index];
      if (!drone.active) continue;
      const dx = player.x - drone.x;
      const dy = player.y - drone.y;
      const dist = Math.hypot(dx, dy) || 1;
      drone.vx += (dx / dist) * DRONE.accel * edt;
      drone.vy += (dy / dist) * DRONE.accel * edt;
      const speed = Math.hypot(drone.vx, drone.vy);
      if (speed > DRONE.speed) {
        drone.vx = (drone.vx / speed) * DRONE.speed;
        drone.vy = (drone.vy / speed) * DRONE.speed;
      }
      drone.x += drone.vx * edt;
      drone.y += drone.vy * edt;
      drone.x = Math.min(FIELD.width - DRONE.radius, Math.max(DRONE.radius, drone.x));
      drone.y = Math.min(FIELD.height - DRONE.radius, Math.max(DRONE.radius, drone.y));
      drone.phase += edt * 6;
    }
  }

  function updateBoss(edt) {
    if (!boss.active) return 0;
    if (boss.y < BOSS.y) {
      boss.y += 90 * edt;
    } else {
      boss.phase += edt;
      boss.x = FIELD.width / 2 + Math.sin(boss.phase * 0.55) * (FIELD.width / 2 - 170);
      boss.y = BOSS.y + Math.sin(boss.phase * 1.9) * 20;
    }
    boss.fireTimer -= edt;
    if (boss.fireTimer <= 0 && boss.y >= BOSS.y) {
      boss.fireTimer = BOSS.fireInterval * Math.max(0.65, 1 - boss.index * 0.12);
      const shots = Math.min(3, boss.index);
      const aim = Math.atan2(player.y - boss.y, player.x - boss.x);
      for (let index = 0; index < shots; index += 1) {
        const angle = aim + (index - (shots - 1) / 2) * 0.16;
        spawnEnemyBullet(boss.x, boss.y + BOSS.radius * 0.6, Math.cos(angle) * ENEMY_BULLET_SPEED, Math.sin(angle) * ENEMY_BULLET_SPEED);
      }
    }
    return 0;
  }

  function updateBullets(dt) {
    for (let index = 0; index < bullets.length; index += 1) {
      const bullet = bullets[index];
      if (!bullet.active) continue;
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
      if (bullet.y < -12 || bullet.x < -12 || bullet.x > FIELD.width + 12) bullet.active = false;
    }
  }

  function updateEnemyBullets(edt) {
    for (let index = 0; index < enemyBullets.length; index += 1) {
      const bullet = enemyBullets[index];
      if (!bullet.active) continue;
      bullet.x += bullet.vx * edt;
      bullet.y += bullet.vy * edt;
      if (bullet.y < -12 || bullet.y > FIELD.height + 12 || bullet.x < -12 || bullet.x > FIELD.width + 12) {
        bullet.active = false;
      }
    }
  }

  function bulletHits() {
    let events = 0;
    for (let index = 0; index < bullets.length; index += 1) {
      const bullet = bullets[index];
      if (!bullet.active) continue;
      let spent = false;
      for (let slot = 0; slot < asteroids.length && !spent; slot += 1) {
        const asteroid = asteroids[slot];
        if (!asteroid.active) continue;
        if (Math.hypot(asteroid.x - bullet.x, asteroid.y - bullet.y) < asteroid.radius + 4) {
          bullet.active = false;
          spent = true;
          events |= damageAsteroid(asteroid, BULLET_DAMAGE);
        }
      }
      for (let slot = 0; slot < drones.length && !spent; slot += 1) {
        const drone = drones[slot];
        if (!drone.active) continue;
        if (Math.hypot(drone.x - bullet.x, drone.y - bullet.y) < DRONE.radius + 4) {
          bullet.active = false;
          spent = true;
          events |= destroyDrone(drone, true);
        }
      }
      if (!spent && boss.active && Math.hypot(boss.x - bullet.x, boss.y - bullet.y) < BOSS.radius + 4) {
        bullet.active = false;
        events |= damageBoss(BULLET_DAMAGE);
      }
    }
    return events;
  }

  function collidePlayer() {
    let events = 0;
    for (let index = 0; index < enemyBullets.length; index += 1) {
      const bullet = enemyBullets[index];
      if (!bullet.active) continue;
      if (Math.hypot(bullet.x - player.x, bullet.y - player.y) < PLAYER.radius + 5) {
        bullet.active = false;
        events |= hitPlayer();
      }
    }
    if (player.invulnerable === 0) {
      for (let index = 0; index < asteroids.length; index += 1) {
        const asteroid = asteroids[index];
        if (!asteroid.active) continue;
        if (Math.hypot(asteroid.x - player.x, asteroid.y - player.y) < asteroid.radius + PLAYER.radius * 0.8) {
          events |= shatterAsteroid(asteroid);
          events |= hitPlayer();
          break;
        }
      }
      for (let index = 0; index < drones.length; index += 1) {
        const drone = drones[index];
        if (!drone.active) continue;
        if (Math.hypot(drone.x - player.x, drone.y - player.y) < DRONE.radius + PLAYER.radius * 0.8) {
          events |= destroyDrone(drone, false);
          events |= hitPlayer();
          break;
        }
      }
      if (boss.active && Math.hypot(boss.x - player.x, boss.y - player.y) < BOSS.radius + PLAYER.radius * 0.8) {
        events |= hitPlayer();
      }
    }
    return events;
  }

  function updateCrystals(dt) {
    let events = 0;
    for (let index = 0; index < crystalPool.length; index += 1) {
      const crystal = crystalPool[index];
      if (!crystal.active) continue;
      crystal.life -= dt;
      if (crystal.life <= 0 || crystal.y > FIELD.height + CRYSTAL.radius) {
        crystal.active = false;
        continue;
      }
      const dx = player.x - crystal.x;
      const dy = player.y - crystal.y;
      const dist = Math.hypot(dx, dy) || 1;
      if (dist < 130) {
        crystal.vx += (dx / dist) * 700 * dt;
        crystal.vy += (dy / dist) * 700 * dt;
      }
      crystal.vx -= crystal.vx * 1.4 * dt;
      crystal.vy -= crystal.vy * 1.4 * dt;
      crystal.vy += 24 * dt;
      crystal.x += crystal.vx * dt;
      crystal.y += crystal.vy * dt;
      crystal.spin += dt * 2.4;
      if (dist < PLAYER.radius + CRYSTAL.radius + 6) {
        crystal.active = false;
        state.crystals += 1;
        state.score += 5;
        events |= EVENT_CRYSTAL;
      }
    }
    return events;
  }

  function updateWaveSpawns(dt) {
    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0 && state.asteroidsLeft > 0) {
      const bigChance = Math.min(0.45, 0.12 + state.wave * 0.03);
      const roll = random();
      const tier = roll < bigChance ? 2 : roll < bigChance + 0.45 ? 1 : 0;
      if (spawnAsteroid(tier, state.speedScale) !== null) state.asteroidsLeft -= 1;
      state.spawnTimer += state.spawnInterval;
    }
    if (state.dronesLeft > 0) {
      state.droneTimer -= dt;
      if (state.droneTimer <= 0) {
        if (spawnDrone() !== null) state.dronesLeft -= 1;
        state.droneTimer += state.droneInterval;
      }
    }
  }

  function updatePlayer(dt, input) {
    let events = 0;
    player.vx += input.dx * PLAYER.accel * dt;
    player.vy += input.dy * PLAYER.accel * dt;
    const drag = Math.pow(PLAYER.drag, dt * 60);
    player.vx *= drag;
    player.vy *= drag;
    const speed = Math.hypot(player.vx, player.vy);
    if (speed > PLAYER.speed) {
      player.vx = (player.vx / speed) * PLAYER.speed;
      player.vy = (player.vy / speed) * PLAYER.speed;
    }
    player.x = Math.min(FIELD.width - PLAYER.radius, Math.max(PLAYER.radius, player.x + player.vx * dt));
    player.y = Math.min(FIELD.height - PLAYER.radius, Math.max(PLAYER.radius, player.y + player.vy * dt));
    if (player.invulnerable > 0) player.invulnerable = Math.max(0, player.invulnerable - dt);
    if (player.specialTimer > 0) player.specialTimer = Math.max(0, player.specialTimer - dt);
    player.fireTimer -= dt;
    if (player.fireTimer <= 0) events |= fireVolley();
    if (input.special && player.specialTimer === 0) events |= fireNova();
    return events;
  }

  function updateChain(dt) {
    if (state.chainTimer <= 0) return;
    state.chainTimer -= dt;
    if (state.chainTimer <= 0) {
      state.chain = 0;
      state.multiplier = 1;
    }
  }

  function checkWaveClear() {
    if (state.asteroidsLeft > 0 || state.dronesLeft > 0 || boss.active) return 0;
    for (let index = 0; index < asteroids.length; index += 1) {
      if (asteroids[index].active) return 0;
    }
    for (let index = 0; index < drones.length; index += 1) {
      if (drones[index].active) return 0;
    }
    state.phase = PHASE_CLEAR;
    state.chain = 0;
    state.multiplier = 1;
    state.chainTimer = 0;
    return EVENT_WAVE_CLEAR;
  }

  /**
   * One fixed step. `input` is {dx, dy, special}: the ship's thrust direction and whether the
   * nova should fire. With `harmless` set (the title screen's backdrop) rocks drift past but
   * nothing touches the ship and nothing scores.
   */
  function step(dt, input, harmless) {
    let events = 0;
    updateStars(dt);
    updateParticles(dt);
    if (harmless) {
      state.ambientTimer -= dt;
      if (state.ambientTimer <= 0) {
        spawnAsteroid((random() * ASTEROID_TIERS.length) | 0, 0.75);
        state.ambientTimer += 0.85;
      }
      updateAsteroids(dt);
      return 0;
    }
    if (state.phase === PHASE_CLEAR) {
      updateCrystals(dt);
      return 0;
    }
    state.elapsed += dt;
    events |= updatePlayer(dt, input);
    const edt = dt * slowFactor();
    updateAsteroids(edt);
    updateDrones(edt);
    events |= updateBoss(edt);
    updateBullets(dt);
    updateEnemyBullets(edt);
    updateWaveSpawns(dt);
    events |= bulletHits();
    events |= collidePlayer();
    events |= updateCrystals(dt);
    updateChain(dt);
    events |= checkWaveClear();
    return events;
  }

  reset();
  return { state, reset, step, buyUpgrade, startNextWave };
}


