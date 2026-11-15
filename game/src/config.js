// Nova Cascade configuration, dimensions, palette and tuning parameters.

export const FIELD = {
  width: 1280,
  height: 720,
};

export const STEP = 1 / 60;

export const INITIAL_LIVES = 3;
export const MAX_WAVES = 15;

export const PLAYER = {
  radius: 20,
  speed: 480,
  accel: 2200,
  drag: 0.88,
  invulnerableTime: 2.0,
  shieldMaxDefault: 100,
  fireInterval: 0.14,
  specialCooldown: 7.0,
  specialRadius: 380,
  specialDamage: 40,
};

export const PALETTE = {
  spaceBg: '#08091a',
  nebulaIndigo: 'rgba(28, 14, 58, 0.45)',
  nebulaCyan: 'rgba(10, 38, 70, 0.45)',
  starWhite: '#ffffff',
  starCyan: '#80f8ff',
  starMagenta: '#ff80d5',
  
  player: '#00f0ff',
  playerGlow: 'rgba(0, 240, 255, 0.5)',
  playerEngine: '#80f8ff',
  playerLaser: '#00e5ff',
  
  enemyMagenta: '#ff007f',
  enemyGlow: '#ff2a85',
  enemyLaser: '#ff40a0',
  asteroidBody: '#1e1b38',
  asteroidCrater: '#ff007f',
  
  crystalGold: '#ffd700',
  crystalGlow: '#fff066',
  crystalSpark: '#ffffff',
  
  hudText: '#ffffff',
  hudMuted: '#8a94b8',
  hudCyan: '#00f0ff',
  hudGold: '#ffd700',
  hudMagenta: '#ff007f',
  hudGreen: '#00ff88',
  
  panelBg: 'rgba(14, 17, 38, 0.92)',
  panelBorder: '#00f0ff',
  panelCardBg: 'rgba(24, 28, 58, 0.85)',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

export const BEST_KEY = 'nova-cascade.best';
