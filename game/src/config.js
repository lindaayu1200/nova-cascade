// Every tuning number, colour and piece of geometry for Nova Cascade. The playfield is a fixed
// 1280x720 logical area; the renderer scales it to the window, so no rule below depends on the
// screen size. Enemy statistics live here too, keeping world.js about behaviour rather than balance.

export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

export const INITIAL_LIVES = 3;
export const MAX_WAVES = 15;

export const PLAYER = {
  radius: 18,
  speed: 475,
  accel: 2700,
  drag: 0.87,
  invulnerableTime: 2,
  shieldMaxDefault: 100,
  shieldAbsorb: 45,
  fireInterval: 0.14,
  specialCooldown: 8,
  specialRadius: 370,
  specialDamage: 50,
  minY: 96,
  maxY: 690,
};

export const BULLET = { speed: 900, damage: 10, radius: 3.2 };
export const ENEMY_BULLET = { speed: 255, radius: 5 };

/** Index 0 is the smallest shard; a destroyed rock splits into two rocks of the tier below. */
export const ASTEROID_TIERS = [
  { radius: 14, hp: 10, speed: 112, score: 20, crystals: 1 },
  { radius: 27, hp: 24, speed: 82, score: 45, crystals: 2 },
  { radius: 43, hp: 42, speed: 59, score: 80, crystals: 3 },
];

export const DRONE = { radius: 13, hp: 18, speed: 172, accel: 310, score: 70, crystals: 3 };
export const BOSS = {
  radius: 64,
  hpBase: 240,
  hpStep: 180,
  fireInterval: 1.2,
  score: 1200,
  restY: 152,
  contactScore: 0,
};
export const BOSS_NAMES = ['VESPER WARDEN', 'OBSIDIAN MAW', 'NOVA CASCADE'];

export const CRYSTAL = { radius: 8, lifetime: 12, magnetRange: 155, magnetAccel: 950, score: 5 };
export const CHAIN = { window: 2.4, max: 9 };

export const UPGRADE_DEFS = [
  {
    name: 'Aegis Shield',
    short: 'SHIELD',
    detail: '+40 max shield, refilled',
    baseCost: 30,
    costStep: 25,
    maxLevel: 4,
  },
  {
    name: 'Prism Spread',
    short: 'SPREAD',
    detail: '+1 shot per volley',
    baseCost: 40,
    costStep: 30,
    maxLevel: 4,
  },
  {
    name: 'Temporal Wake',
    short: 'SLOW',
    detail: 'enemies 12% slower',
    baseCost: 35,
    costStep: 30,
    maxLevel: 3,
  },
];

/** How many objects of each kind can exist at once; every pool is allocated once, at boot. */
export const POOL = {
  bullets: 100,
  enemyBullets: 90,
  asteroids: 120,
  drones: 18,
  crystals: 90,
  particles: 440,
  popups: 56,
  stars: 140,
};

/** The upgrade bay's card row, shared by the renderer and by mouse-click hit testing. */
export const UPGRADE_LAYOUT = {
  panelWidth: 820,
  panelHeight: 492,
  panelY: 114,
  cardWidth: 226,
  cardHeight: 238,
  cardGap: 24,
  cardY: 256,
};

export function upgradeCardRect(slot) {
  const total = UPGRADE_LAYOUT.cardWidth * 3 + UPGRADE_LAYOUT.cardGap * 2;
  return {
    x: (FIELD.width - total) / 2 + slot * (UPGRADE_LAYOUT.cardWidth + UPGRADE_LAYOUT.cardGap),
    y: UPGRADE_LAYOUT.cardY,
    width: UPGRADE_LAYOUT.cardWidth,
    height: UPGRADE_LAYOUT.cardHeight,
  };
}

export const PALETTE = {
  spaceBg: '#070819',
  spaceBgEdge: '#03040d',
  nebulaIndigo: 'rgba(45, 24, 92, 0.42)',
  nebulaCyan: 'rgba(10, 52, 92, 0.38)',
  nebulaMagenta: 'rgba(86, 16, 72, 0.24)',

  starWhite: '#dfe7ff',
  starCyan: '#8ff9ff',
  starMagenta: '#ff9adf',

  player: '#39f4ff',
  playerDark: '#0b869b',
  playerGlow: 'rgba(57, 244, 255, 0.42)',
  playerEngine: '#b6fdff',
  playerLaser: '#8dfbff',

  enemy: '#ff3d9a',
  enemyGlow: 'rgba(255, 61, 154, 0.5)',
  enemyDark: '#78124c',
  enemyLaser: '#ff5fb2',

  asteroidBody: '#1b1738',
  asteroidEdge: '#c72f80',
  asteroidCrater: '#493170',

  crystal: '#ffd447',
  crystalGlow: 'rgba(255, 212, 71, 0.55)',
  crystalSpark: '#fff6c4',

  hudText: '#f3f6ff',
  hudMuted: '#8b95bf',
  hudCyan: '#4bf5ff',
  hudGold: '#ffd447',
  hudMagenta: '#ff5fae',
  hudGreen: '#6dffb0',

  panelBg: 'rgba(9, 11, 34, 0.94)',
  panelCard: 'rgba(24, 28, 64, 0.92)',
  panelBorder: '#3fdcf2',
  panelBorderGold: '#d9a92f',
  panelBorderMagenta: '#e0378d',
  overlay: 'rgba(3, 4, 14, 0.62)',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'nova-cascade.best';
