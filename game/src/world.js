// The game's rules and state, with no drawing and no browser in it: the player's ship and its
// autofire, waves of splitting asteroids, homing drones and a boss every fifth wave, the energy
// crystals they drop, collisions, the score chain, lives, and the upgrades bought between waves.
// step() advances one fixed step and returns what happened as bit flags, so the caller can react
// without the world knowing about screens or sound. Pools are allocated once, at boot.
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

/** What each wave throws at the ship; every fifth wave is a boss with a few rocks for cover. */
function wavePlan(wave) {
  const boss = wave % 5 === 0;
  const bossIndex = boss ? wave / 5 : 0;
  return {
    boss,
    bossIndex,
    asteroids: boss ? 4 + bossIndex : 5 + Math.floor(wave * 1.2),
    drones: boss ? 0 : Math.max(0, Math.floor((wave - 1) / 2)),
    spawnInterval: Math.max(0.38, 1.05 - wave * 0.045),
    droneInterval: Math.max(1.4, 2.8 - wave * 0.12),
    speedScale: 1 + (wave - 1) * 0.055,
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
    asteroids.push({
      active: false, tier: 0, radius: 0, hp: 0, maxHp: 0, x: 0, y: 0, vx: 0, vy: 0,
      phase: 0, spin: 0, flash: 0, shape: new Array(9).fill(1), craterAngle: 0,
      craterDist: 0, craterRadius: 0,
    });
  }
  const drones = [];
  for (let index = 0; index < POOL.drones; index += 1) {
    drones.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, hp: 0, phase: 0, flash: 0 });
  }
  const crystalPool = [];
  for (let index = 0; index < POOL.crystals; index += 1) {
    crystalPool.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, spin: 0 });
  }
  const particles = [];
  for (let index = 0; index < POOL.particles; index += 1) {
    particles.push({
      active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1,
      size: 2, color: PALETTE.starWhite, drag: 2,
    });
  }
  const popups = [];
  for (let index = 0; index < POOL.popups; index += 1) {
    popups.push({
      active: false, x: 0, y: 0, vy: 0, life: 0, maxLife: 1,
      text: '', color: PALETTE.hudText, size: 20,
    });
  }
  const stars = [];
  for (let index = 0; index < POOL.stars; index += 1) {
    stars.push({
      x: random() * FIELD.width,
      y: random() * FIELD.height,
      speed: 16 + random() * 62,
      size: random() < 0.78 ? 1.5 : 2.6,
      tint: (random() * 3) | 0,
      twinkle: random() * TAU,
    });
  }
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
    return 1 - 0.12 * state.upgrades[2].level;
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
    for (const group of [bullets, enemyBullets, asteroids, drones, crystalPool, particles, popups]) {
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
    boss.flash = 0;
    boss.volley = 0;
    boss.entering = false;
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
      particle.x = x;
      particle.y = y;
      particle.vx = Math.cos(angle) * velocity;
      particle.vy = Math.sin(angle) * velocity;
      particle.maxLife = 0.32 + random() * 0.5;
      particle.life = particle.maxLife;
      particle.size = 1.6 + random() * 3.4;
      particle.color = color;
      particle.drag = 1.4 + random() * 1.4;
    }
  }

  function shapeAsteroid(rock, tier) {
    const spec = ASTEROID_TIERS[tier];
    rock.tier = tier;
    rock.radius = spec.radius;
    rock.maxHp = spec.hp;
    rock.hp = spec.hp;
    for (let corner = 0; corner < rock.shape.length; corner += 1) {
      rock.shape[corner] = 0.78 + random() * 0.3;
    }
    rock.craterAngle = random() * TAU;
    rock.craterDist = 0.14 + random() * 0.34;
    rock.craterRadius = 0.12 + random() * 0.13;
    rock.flash = 0;
  }

  function spawnAsteroid(tier = 1, x, y, speedScale) {
    const rock = freeIn(asteroids);
    if (rock === null) return null;
    rock.active = true;
    shapeAsteroid(rock, tier);
    const spec = ASTEROID_TIERS[tier];
    rock.x = x === undefined ? spec.radius + random() * (FIELD.width - spec.radius * 2) : x;
    rock.y = y === undefined ? -spec.radius - 6 : y;
    const angle = Math.PI / 2 + (random() - 0.5) * 0.8;
    const speed = spec.speed * (speedScale === undefined ? state.speedScale : speedScale);
    rock.vx = Math.cos(angle) * speed;
    rock.vy = Math.max(32, Math.sin(angle) * speed);
    rock.phase = random() * TAU;
    rock.spin = (random() - 0.5) * 2.4;
    return rock;
  }

  function spawnDrone(x, y) {
    const drone = freeIn(drones);
    if (drone === null) return null;
    drone.active = true;
    drone.x = x === undefined ? 34 + random() * (FIELD.width - 68) : x;
    drone.y = y === undefined ? -22 : y;
    drone.vx = (random() - 0.5) * 60;
    drone.vy = 48;
    drone.hp = DRONE.hp + Math.floor((state.wave - 1) / 5) * 4;
    drone.phase = random() * TAU;
    drone.flash = 0;
    return drone;
  }

  function spawnCrystal(x, y) {
    const crystal = freeIn(crystalPool);
    if (crystal === null) return null;
    crystal.active = true;
    crystal.x = x;
    crystal.y = y;
    crystal.vx = (random() - 0.5) * 68;
    crystal.vy = 18 + random() * 40;
    crystal.life = CRYSTAL.lifetime;
    crystal.spin = random() * TAU;
    return crystal;
  }

  function dropCrystals(x, y, count) {
    for (let index = 0; index < count; index += 1) {
      spawnCrystal(x + (random() - 0.5) * 24, y + (random() - 0.5) * 24);
    }
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

  function registerKill(points, x, y, color) {
    state.chain = Math.min(CHAIN.max, state.chain + 1);
    state.multiplier = state.chain;
    state.chainTimer = CHAIN.window;
    const gained = points * state.multiplier;
    state.score += gained;
    spawnPopup(`+${gained}`, x, y, color, state.multiplier > 1 ? 23 : 19);
  }

  function spawnBoss(index) {
    boss.active = true;
    boss.index = index;
    boss.maxHp = BOSS.hpBase + BOSS.hpStep * index;
    boss.hp = boss.maxHp;
    boss.x = FIELD.width / 2;
    boss.y = -BOSS.radius - 20;
    boss.phase = 0;
    boss.fireTimer = 1.4;
    boss.flash = 0;
    boss.volley = 0;
    boss.entering = true;
  }

  function startNextWave() {
    if (state.wave >= MAX_WAVES) return 0;
    state.wave += 1;
    applyPlan(state.wave);
    state.phase = PHASE_WAVE;
    player.shield = Math.min(player.shieldMax, player.shield + 25);
    player.fireTimer = 0;
    for (const bullet of enemyBullets) bullet.active = false;
    if (state.bossWave) {
      spawnBoss(state.bossIndex);
      return EVENT_BOSS;
    }
    return 0;
  }

  function buyUpgrade(slot) {
    const upgrade = upgrades[slot];
    if (!upgrade || upgrade.level >= upgrade.maxLevel || state.crystals < upgrade.cost) return false;
    state.crystals -= upgrade.cost;
    upgrade.level += 1;
    upgrade.cost = upgrade.baseCost + upgrade.costStep * upgrade.level;
    if (slot === 0) {
      player.shieldMax = PLAYER.shieldMaxDefault + 40 * upgrade.level;
      player.shield = player.shieldMax;
    }
    return true;
  }

  function splitAsteroid(rock) {
    if (rock.tier === 0) return;
    const tier = rock.tier - 1;
    const spec = ASTEROID_TIERS[tier];
    for (let side = -1; side <= 1; side += 2) {
      const child = freeIn(asteroids);
      if (child === null) continue;
      child.active = true;
      shapeAsteroid(child, tier);
      child.x = rock.x + side * spec.radius * 0.55;
      child.y = rock.y;
      const speed = (spec.speed + 38) * Math.max(0.75, state.speedScale);
      child.vx = side * (42 + random() * 58);
      child.vy = Math.max(40, speed * (0.55 + random() * 0.45));
      child.phase = rock.phase + side * 0.7;
      child.spin = (random() - 0.5) * 3;
    }
  }

  function damageAsteroid(rock, damage) {
    if (!rock.active) return 0;
    rock.hp -= damage;
    rock.flash = 0.08;
    if (rock.hp > 0) return 0;
    const spec = ASTEROID_TIERS[rock.tier];
    rock.active = false;
    burst(rock.x, rock.y, 8 + rock.tier * 4, PALETTE.enemyGlow, 90 + rock.tier * 40);
    splitAsteroid(rock);
    registerKill(spec.score, rock.x, rock.y, PALETTE.hudText);
    dropCrystals(rock.x, rock.y, spec.crystals);
    addShake(4 + rock.tier * 2.5);
    return EVENT_EXPLODE;
  }

  function shatterAsteroid(rock) {
    rock.active = false;
    burst(rock.x, rock.y, 10, PALETTE.asteroidCrater, 130);
    splitAsteroid(rock);
    addShake(7);
    return EVENT_EXPLODE;
  }

  function destroyDrone(drone, loot) {
    if (!drone.active) return 0;
    drone.active = false;
    burst(drone.x, drone.y, 12, PALETTE.enemy, 120);
    if (loot) {
      registerKill(DRONE.score, drone.x, drone.y, PALETTE.hudText);
      dropCrystals(drone.x, drone.y, DRONE.crystals);
    }
    addShake(6);
    return EVENT_EXPLODE;
  }

  function damageBoss(damage) {
    if (!boss.active) return 0;
    boss.hp -= damage;
    boss.flash = 0.07;
    if (boss.hp > 0) return 0;
    boss.active = false;
    burst(boss.x, boss.y, 42, PALETTE.enemyGlow, 230);
    burst(boss.x, boss.y, 24, PALETTE.crystal, 150);
    registerKill(BOSS.score, boss.x, boss.y, PALETTE.hudGold);
    dropCrystals(boss.x, boss.y, 12 + boss.index * 5);
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
    burst(player.x, player.y, 14, PALETTE.playerGlow, 165);
    addShake(17, 0.34, PALETTE.enemyGlow);
    if (player.shield > 0) {
      player.shield = Math.max(0, player.shield - PLAYER.shieldAbsorb);
      player.invulnerable = 0.85;
      spawnPopup('SHIELD', player.x, player.y - 30, PALETTE.hudCyan, 17);
      return EVENT_HIT;
    }
    player.shield = 0;
    state.lives -= 1;
    player.invulnerable = PLAYER.invulnerableTime;
    spawnPopup('-1 LIFE', player.x, player.y - 34, PALETTE.hudMagenta, 19);
    if (state.lives <= 0) {
      addShake(28, 0.55, PALETTE.enemyGlow);
      return EVENT_HIT | EVENT_OVER;
    }
    return EVENT_HIT;
  }

  function findAimTarget() {
    let target = null;
    let bestDistance = Infinity;
    if (boss.active) {
      target = boss;
      bestDistance = Math.hypot(boss.x - player.x, boss.y - player.y) - 40;
    }
    for (let index = 0; index < asteroids.length; index += 1) {
      const rock = asteroids[index];
      if (!rock.active) continue;
      const distance = Math.hypot(rock.x - player.x, rock.y - player.y);
      if (distance < bestDistance) {
        bestDistance = distance;
        target = rock;
      }
    }
    for (let index = 0; index < drones.length; index += 1) {
      const drone = drones[index];
      if (!drone.active) continue;
      const distance = Math.hypot(drone.x - player.x, drone.y - player.y);
      if (distance < bestDistance) {
        bestDistance = distance;
        target = drone;
      }
    }
    return target;
  }

  function fireVolley() {
    const count = 1 + state.upgrades[1].level;
    const target = findAimTarget();
    let base = 0;
    if (target !== null && target.y < player.y + 40) {
      const dx = target.x - player.x;
      const dy = target.y - (player.y - PLAYER.radius);
      base = Math.max(-0.8, Math.min(0.8, Math.atan2(dx, -dy)));
    }
    state.aim = base;
    for (let index = 0; index < count; index += 1) {
      const bullet = freeIn(bullets);
      if (bullet === null) break;
      const angle = base + (index - (count - 1) / 2) * 0.13;
      bullet.active = true;
      bullet.x = player.x + Math.sin(angle) * PLAYER.radius * 0.45;
      bullet.y = player.y - PLAYER.radius * 0.9;
      bullet.vx = Math.sin(angle) * BULLET.speed;
      bullet.vy = -Math.cos(angle) * BULLET.speed;
    }
    player.fireTimer = PLAYER.fireInterval;
    return EVENT_SHOT;
  }

  function fireNova() {
    player.specialTimer = PLAYER.specialCooldown;
    const radius = PLAYER.specialRadius;
    let events = EVENT_NOVA;
    const rockCount = asteroids.length;
    for (let index = 0; index < rockCount; index += 1) {
      const rock = asteroids[index];
      if (!rock.active) continue;
      if (Math.hypot(rock.x - player.x, rock.y - player.y) < radius + rock.radius) {
        events |= damageAsteroid(rock, PLAYER.specialDamage);
      }
    }
    for (let index = 0; index < drones.length; index += 1) {
      const drone = drones[index];
      if (drone.active && Math.hypot(drone.x - player.x, drone.y - player.y) < radius + DRONE.radius) {
        events |= destroyDrone(drone, true);
      }
    }
    if (boss.active && Math.hypot(boss.x - player.x, boss.y - player.y) < radius + BOSS.radius) {
      events |= damageBoss(PLAYER.specialDamage);
    }
    for (let index = 0; index < enemyBullets.length; index += 1) {
      const bullet = enemyBullets[index];
      if (!bullet.active) continue;
      if (Math.hypot(bullet.x - player.x, bullet.y - player.y) < radius + ENEMY_BULLET.radius) {
        bullet.active = false;
      }
    }
    const fx = state.novaFx;
    fx.active = true;
    fx.x = player.x;
    fx.y = player.y;
    fx.radius = 0;
    fx.maxRadius = radius;
    fx.maxLife = 0.55;
    fx.life = fx.maxLife;
    burst(player.x, player.y, 38, PALETTE.playerGlow, radius * 1.7);
    addShake(20, 0.25, PALETTE.playerGlow);
    return events;
  }

  function updateStars(dt) {
    for (let index = 0; index < stars.length; index += 1) {
      const star = stars[index];
      star.y += star.speed * dt;
      if (star.y > FIELD.height + 2) {
        star.y = -2;
        star.x = random() * FIELD.width;
      }
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
      const damping = Math.max(0, 1 - particle.drag * dt);
      particle.vx *= damping;
      particle.vy *= damping;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
    }
  }

  function updatePopups(dt) {
    for (let index = 0; index < popups.length; index += 1) {
      const popup = popups[index];
      if (!popup.active) continue;
      popup.life -= dt;
      if (popup.life <= 0) {
        popup.active = false;
        continue;
      }
      popup.y += popup.vy * dt;
      popup.vy *= Math.max(0, 1 - 1.6 * dt);
    }
  }

  function updateEffects(dt) {
    const effects = state.effects;
    if (effects.shake > 0.15) {
      effects.shake *= Math.pow(0.87, dt * 60);
      effects.shakeX = (random() * 2 - 1) * effects.shake;
      effects.shakeY = (random() * 2 - 1) * effects.shake;
    } else {
      effects.shake = 0;
      effects.shakeX = 0;
      effects.shakeY = 0;
    }
    if (effects.flash > 0) effects.flash = Math.max(0, effects.flash - dt * 2.6);
    const fx = state.novaFx;
    if (fx.active) {
      fx.life -= dt;
      if (fx.life <= 0) fx.active = false;
      else fx.radius = fx.maxRadius * (1 - fx.life / fx.maxLife);
    }
  }

  function updatePlayer(dt, input) {
    let events = 0;
    let dx = input && Number.isFinite(input.dx) ? input.dx : 0;
    let dy = input && Number.isFinite(input.dy) ? input.dy : 0;
    const length = Math.hypot(dx, dy);
    if (length > 1) {
      dx /= length;
      dy /= length;
    }
    player.vx += dx * PLAYER.accel * dt;
    player.vy += dy * PLAYER.accel * dt;
    const drag = Math.pow(PLAYER.drag, dt * 60);
    player.vx *= drag;
    player.vy *= drag;
    const speed = Math.hypot(player.vx, player.vy);
    if (speed > PLAYER.speed) {
      player.vx = (player.vx / speed) * PLAYER.speed;
      player.vy = (player.vy / speed) * PLAYER.speed;
    }
    player.x = Math.min(FIELD.width - PLAYER.radius, Math.max(PLAYER.radius, player.x + player.vx * dt));
    player.y = Math.min(PLAYER.maxY, Math.max(PLAYER.minY, player.y + player.vy * dt));
    if (player.invulnerable > 0) player.invulnerable = Math.max(0, player.invulnerable - dt);
    if (player.specialTimer > 0) player.specialTimer = Math.max(0, player.specialTimer - dt);
    player.fireTimer -= dt;
    if (player.fireTimer <= 0) events |= fireVolley();
    if (input && input.special && player.specialTimer === 0) events |= fireNova();
    if (random() < 0.24) {
      const particle = freeIn(particles);
      if (particle !== null) {
        particle.active = true;
        particle.x = player.x + (random() - 0.5) * 9;
        particle.y = player.y + PLAYER.radius * 0.8;
        particle.vx = -player.vx * 0.12 + (random() - 0.5) * 24;
        particle.vy = 85 + random() * 60;
        particle.maxLife = 0.2 + random() * 0.18;
        particle.life = particle.maxLife;
        particle.size = 1.2 + random() * 1.8;
        particle.color = PALETTE.playerEngine;
        particle.drag = 2;
      }
    }
    return events;
  }

  function updateAsteroids(edt) {
    for (let index = 0; index < asteroids.length; index += 1) {
      const rock = asteroids[index];
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
    for (let index = 0; index < drones.length; index += 1) {
      const drone = drones[index];
      if (!drone.active) continue;
      const dx = player.x - drone.x;
      const dy = player.y - drone.y;
      const distance = Math.hypot(dx, dy) || 1;
      drone.vx += (dx / distance) * DRONE.accel * edt;
      drone.vy += (dy / distance) * DRONE.accel * edt;
      const speed = Math.hypot(drone.vx, drone.vy);
      if (speed > DRONE.speed) {
        drone.vx = (drone.vx / speed) * DRONE.speed;
        drone.vy = (drone.vy / speed) * DRONE.speed;
      }
      drone.x = Math.min(FIELD.width - DRONE.radius, Math.max(DRONE.radius, drone.x + drone.vx * edt));
      drone.y = Math.min(FIELD.height - DRONE.radius, Math.max(DRONE.radius, drone.y + drone.vy * edt));
      drone.phase += edt * 6;
      if (drone.flash > 0) drone.flash = Math.max(0, drone.flash - edt);
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
      const count = 8 + boss.index * 2;
      for (let index = 0; index < count; index += 1) {
        const angle = (index / count) * TAU + boss.phase * 0.25;
        spawnEnemyBullet(
          boss.x,
          boss.y,
          Math.cos(angle) * ENEMY_BULLET.speed,
          Math.sin(angle) * ENEMY_BULLET.speed,
        );
      }
    } else {
      const shots = 1 + boss.index;
      const aim = Math.atan2(player.y - boss.y, player.x - boss.x);
      for (let index = 0; index < shots; index += 1) {
        const angle = aim + (index - (shots - 1) / 2) * 0.16;
        spawnEnemyBullet(
          boss.x + Math.cos(angle) * BOSS.radius * 0.55,
          boss.y + Math.sin(angle) * BOSS.radius * 0.55,
          Math.cos(angle) * ENEMY_BULLET.speed,
          Math.sin(angle) * ENEMY_BULLET.speed,
        );
      }
    }
  }

  function updateBullets(dt) {
    for (let index = 0; index < bullets.length; index += 1) {
      const bullet = bullets[index];
      if (!bullet.active) continue;
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
      if (bullet.y < -16 || bullet.x < -16 || bullet.x > FIELD.width + 16) bullet.active = false;
    }
  }

  function updateEnemyBullets(edt) {
    for (let index = 0; index < enemyBullets.length; index += 1) {
      const bullet = enemyBullets[index];
      if (!bullet.active) continue;
      bullet.x += bullet.vx * edt;
      bullet.y += bullet.vy * edt;
      if (bullet.y < -16 || bullet.y > FIELD.height + 16 || bullet.x < -16 || bullet.x > FIELD.width + 16) {
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
        const rock = asteroids[slot];
        if (!rock.active) continue;
        const dx = rock.x - bullet.x;
        const dy = rock.y - bullet.y;
        const radius = rock.radius + BULLET.radius;
        if (dx * dx + dy * dy < radius * radius) {
          bullet.active = false;
          spent = true;
          events |= damageAsteroid(rock, BULLET.damage);
        }
      }
      for (let slot = 0; slot < drones.length && !spent; slot += 1) {
        const drone = drones[slot];
        if (!drone.active) continue;
        const dx = drone.x - bullet.x;
        const dy = drone.y - bullet.y;
        const radius = DRONE.radius + BULLET.radius;
        if (dx * dx + dy * dy < radius * radius) {
          bullet.active = false;
          spent = true;
          drone.hp -= BULLET.damage;
          drone.flash = 0.08;
          if (drone.hp <= 0) events |= destroyDrone(drone, true);
        }
      }
      if (!spent && boss.active) {
        const dx = boss.x - bullet.x;
        const dy = boss.y - bullet.y;
        const radius = BOSS.radius + BULLET.radius;
        if (dx * dx + dy * dy < radius * radius) {
          bullet.active = false;
          events |= damageBoss(BULLET.damage);
        }
      }
    }
    return events;
  }

  function collidePlayer() {
    let events = 0;
    for (let index = 0; index < enemyBullets.length; index += 1) {
      const bullet = enemyBullets[index];
      if (!bullet.active) continue;
      const dx = bullet.x - player.x;
      const dy = bullet.y - player.y;
      const radius = PLAYER.radius + ENEMY_BULLET.radius;
      if (dx * dx + dy * dy < radius * radius) {
        bullet.active = false;
        events |= hitPlayer();
      }
    }
    if (player.invulnerable > 0) return events;
    for (let index = 0; index < asteroids.length; index += 1) {
      const rock = asteroids[index];
      if (!rock.active) continue;
      const dx = rock.x - player.x;
      const dy = rock.y - player.y;
      const radius = rock.radius + PLAYER.radius * 0.85;
      if (dx * dx + dy * dy < radius * radius) {
        events |= shatterAsteroid(rock);
        events |= hitPlayer();
        return events;
      }
    }
    for (let index = 0; index < drones.length; index += 1) {
      const drone = drones[index];
      if (!drone.active) continue;
      const dx = drone.x - player.x;
      const dy = drone.y - player.y;
      const radius = DRONE.radius + PLAYER.radius * 0.85;
      if (dx * dx + dy * dy < radius * radius) {
        events |= destroyDrone(drone, false);
        events |= hitPlayer();
        return events;
      }
    }
    if (boss.active) {
      const dx = boss.x - player.x;
      const dy = boss.y - player.y;
      const radius = BOSS.radius + PLAYER.radius * 0.8;
      if (dx * dx + dy * dy < radius * radius) events |= hitPlayer();
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
      const distance = Math.hypot(dx, dy) || 1;
      if (distance < CRYSTAL.magnetRange) {
        crystal.vx += (dx / distance) * CRYSTAL.magnetAccel * dt;
        crystal.vy += (dy / distance) * CRYSTAL.magnetAccel * dt;
      }
      crystal.vx *= Math.max(0, 1 - 1.4 * dt);
      crystal.vy *= Math.max(0, 1 - 1.4 * dt);
      crystal.vy += 22 * dt;
      crystal.x += crystal.vx * dt;
      crystal.y += crystal.vy * dt;
      crystal.spin += dt * 2.6;
      if (distance < PLAYER.radius + CRYSTAL.radius + 7) {
        crystal.active = false;
        state.crystals += 1;
        state.score += CRYSTAL.score * state.multiplier;
        spawnPopup('+1', crystal.x, crystal.y, PALETTE.crystal, 16);
        events |= EVENT_CRYSTAL;
      }
    }
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

  function updateSpawns(dt) {
    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0 && state.asteroidsLeft > 0) {
      const bigChance = Math.min(0.5, 0.08 + state.wave * 0.035);
      const roll = random();
      const tier = roll < bigChance ? 2 : roll < bigChance + 0.42 ? 1 : 0;
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

  function checkWaveClear() {
    if (state.phase !== PHASE_WAVE) return 0;
    if (state.asteroidsLeft > 0 || state.dronesLeft > 0 || boss.active) return 0;
    for (let index = 0; index < asteroids.length; index += 1) {
      if (asteroids[index].active) return 0;
    }
    for (let index = 0; index < drones.length; index += 1) {
      if (drones[index].active) return 0;
    }
    state.phase = PHASE_CLEAR;
    // Vacuum up whatever the last kill scattered, so the upgrade bay never swallows a drop.
    let events = EVENT_WAVE_CLEAR;
    let vacuumed = 0;
    for (let index = 0; index < crystalPool.length; index += 1) {
      const crystal = crystalPool[index];
      if (!crystal.active) continue;
      crystal.active = false;
      vacuumed += 1;
    }
    if (vacuumed > 0) {
      state.crystals += vacuumed;
      state.score += CRYSTAL.score * state.multiplier * vacuumed;
      spawnPopup(`+${vacuumed}`, player.x, player.y - 48, PALETTE.crystal, 18);
      events |= EVENT_CRYSTAL;
    }
    state.chain = 0;
    state.multiplier = 1;
    state.chainTimer = 0;
    for (const bullet of enemyBullets) bullet.active = false;
    return events;
  }

  /**
   * One fixed step. `input` is {dx, dy, special}: the ship's thrust and whether the nova should
   * fire. With `harmless` set (the title screen's backdrop) rocks drift past but nothing touches
   * the ship and nothing scores.
   */
  function step(dt, input, harmless) {
    let events = 0;
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
      updateCrystals(dt);
      return 0;
    }
    state.elapsed += dt;
    events |= updatePlayer(dt, input);
    const edt = dt * slowFactor();
    updateAsteroids(edt);
    updateDrones(edt);
    updateBoss(edt);
    updateBullets(dt);
    updateEnemyBullets(edt);
    updateSpawns(dt);
    events |= bulletHits();
    events |= collidePlayer();
    events |= updateCrystals(dt);
    updateChain(dt);
    events |= checkWaveClear();
    return events;
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
