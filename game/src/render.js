// Drawing only: the world's state and the current screen in, pixels out. The 1280x720 playfield
// is scaled to fit the window and centred, the margin filled with the backdrop colour. Canvas
// shapes and text; the palette is the deep-indigo/cyan/magenta/gold set in config. Text that holds
// a number is rebuilt only when the number changes, so a quiet frame allocates almost nothing.
import {
  BOSS, BOSS_NAMES, CHAIN, DRONE, FIELD, FONT, INITIAL_LIVES, MAX_WAVES, PALETTE, PLAYER,
  UPGRADE_LAYOUT, upgradeCardRect,
} from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_UPGRADE = 'upgrade';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_VICTORY = 'victory';

const TA = Math.PI * 2;
const STAR_TINTS = [PALETTE.starWhite, PALETTE.starCyan, PALETTE.starMagenta];
const LIFE_SIZE = 18;
const LIFE_GAP = 7;
const CARD_KEYS = ['1', '2', '3'];

function cachedLabel(prefix) {
  let value = null;
  let text = '';
  return function label(next) {
    if (next !== value) {
      value = next;
      text = prefix + next;
    }
    return text;
  };
}

function roundRect(context, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.lineTo(x + width - r, y);
  context.quadraticCurveTo(x + width, y, x + width, y + r);
  context.lineTo(x + width, y + height - r);
  context.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  context.lineTo(x + r, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - r);
  context.lineTo(x, y + r);
  context.quadraticCurveTo(x, y, x + r, y);
  context.closePath();
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const fonts = new Map();

  const scoreLabel = cachedLabel('');
  const multiplierLabel = cachedLabel('x');
  const crystalsLabel = cachedLabel('');
  const bestLabel = cachedLabel('Best  ');
  const finalScoreLabel = cachedLabel('Final score  ');
  const waveReachedLabel = cachedLabel('Wave reached  ');
  const costLabels = [cachedLabel(''), cachedLabel(''), cachedLabel('')];
  const levelLabels = [cachedLabel('LV '), cachedLabel('LV '), cachedLabel('LV ')];

  let waveShown = -1;
  let waveText = '';
  function waveTextFor(next) {
    if (next !== waveShown) {
      waveShown = next;
      waveText = `WAVE ${next} / ${MAX_WAVES}`;
    }
    return waveText;
  }

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / FIELD.width, height / FIELD.height);
    view.x = (width - FIELD.width * view.scale) / 2;
    view.y = (height - FIELD.height * view.scale) / 2;
  }

  function text(value, x, y, size, color, align = 'left', weight = '600') {
    const key = `${weight} ${size}`;
    if (!fonts.has(key)) fonts.set(key, `${weight} ${size}px ${FONT}`);
    context.font = fonts.get(key);
    context.fillStyle = color;
    context.textAlign = align;
    context.fillText(value, x, y);
  }

  function drawBackdrop(state) {
    const time = state.time;
    context.fillStyle = PALETTE.spaceBg;
    context.fillRect(0, 0, FIELD.width, FIELD.height);

    context.save();
    context.globalAlpha = 0.9;
    context.fillStyle = PALETTE.nebulaIndigo;
    context.beginPath();
    context.ellipse(280 + Math.sin(time * 0.035) * 45, 500, 430, 270, -0.42, 0, TA);
    context.fill();
    context.fillStyle = PALETTE.nebulaCyan;
    context.beginPath();
    context.ellipse(990 + Math.cos(time * 0.03) * 40, 180, 370, 230, 0.52, 0, TA);
    context.fill();
    context.fillStyle = PALETTE.nebulaMagenta;
    context.beginPath();
    context.ellipse(920, 510 + Math.sin(time * 0.045) * 30, 300, 190, 0.18, 0, TA);
    context.fill();
    context.restore();

    for (let index = 0; index < state.stars.length; index += 1) {
      const star = state.stars[index];
      const twinkle = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(time * 1.7 + star.twinkle));
      context.globalAlpha = twinkle;
      context.fillStyle = STAR_TINTS[star.tint];
      if (star.size > 2) {
        context.beginPath();
        context.arc(star.x, star.y, star.size * 0.65, 0, TA);
        context.fill();
      } else {
        context.fillRect(star.x, star.y, star.size, star.size);
      }
    }
    context.globalAlpha = 1;
  }

  function drawCrystalShape(x, y, size, spin, glow) {
    context.save();
    context.translate(x, y);
    context.rotate(spin);
    if (glow > 0) {
      context.shadowColor = PALETTE.crystal;
      context.shadowBlur = glow;
    }
    context.fillStyle = PALETTE.crystal;
    context.beginPath();
    context.moveTo(0, -size * 1.5);
    context.lineTo(size, 0);
    context.lineTo(0, size * 1.5);
    context.lineTo(-size, 0);
    context.closePath();
    context.fill();
    context.shadowBlur = 0;
    context.fillStyle = PALETTE.crystalSpark;
    context.beginPath();
    context.moveTo(0, -size * 0.8);
    context.lineTo(size * 0.42, 0);
    context.lineTo(0, size * 0.8);
    context.lineTo(-size * 0.42, 0);
    context.closePath();
    context.fill();
    context.restore();
  }

  function drawCrystals(state) {
    const pool = state.crystalPool;
    for (let index = 0; index < pool.length; index += 1) {
      const crystal = pool[index];
      if (!crystal.active) continue;
      context.globalAlpha = Math.min(1, crystal.life / 2);
      drawCrystalShape(crystal.x, crystal.y, 8, crystal.spin, 8);
    }
    context.globalAlpha = 1;
  }

  function asteroidPath(rock) {
    context.beginPath();
    for (let corner = 0; corner < rock.shape.length; corner += 1) {
      const angle = (corner / rock.shape.length) * TA;
      const radius = rock.radius * rock.shape[corner];
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      if (corner === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.closePath();
  }

  function drawAsteroids(state) {
    const rocks = state.asteroids;
    for (let index = 0; index < rocks.length; index += 1) {
      const rock = rocks[index];
      if (!rock.active) continue;
      context.save();
      context.translate(rock.x, rock.y);
      context.rotate(rock.phase);
      asteroidPath(rock);
      context.fillStyle = PALETTE.asteroidBody;
      context.fill();
      if (rock.flash > 0) {
        context.fillStyle = `rgba(255,255,255,${Math.min(0.85, rock.flash * 9)})`;
        context.fill();
      }
      context.strokeStyle = PALETTE.asteroidEdge;
      context.globalAlpha = 0.78;
      context.lineWidth = 2;
      context.stroke();
      context.globalAlpha = 1;
      const craterX = Math.cos(rock.craterAngle) * rock.radius * rock.craterDist;
      const craterY = Math.sin(rock.craterAngle) * rock.radius * rock.craterDist;
      context.fillStyle = PALETTE.asteroidCrater;
      context.beginPath();
      context.arc(craterX, craterY, rock.radius * rock.craterRadius, 0, TA);
      context.fill();
      context.restore();
    }
  }

  function drawDrones(state) {
    const fleet = state.drones;
    for (let index = 0; index < fleet.length; index += 1) {
      const drone = fleet[index];
      if (!drone.active) continue;
      const angle = Math.atan2(drone.vy, drone.vx);
      context.save();
      context.translate(drone.x, drone.y);
      context.rotate(angle);
      context.shadowColor = PALETTE.enemy;
      context.shadowBlur = 10;
      context.fillStyle = PALETTE.enemy;
      context.beginPath();
      context.moveTo(DRONE.radius + 4, 0);
      context.lineTo(-DRONE.radius, -DRONE.radius * 0.8);
      context.lineTo(-DRONE.radius * 0.45, 0);
      context.lineTo(-DRONE.radius, DRONE.radius * 0.8);
      context.closePath();
      context.fill();
      context.shadowBlur = 0;
      if (drone.flash > 0) {
        context.fillStyle = `rgba(255,255,255,${Math.min(0.9, drone.flash * 10)})`;
        context.fill();
      }
      context.strokeStyle = PALETTE.enemyGlow;
      context.globalAlpha = 0.45 + 0.25 * Math.sin(drone.phase);
      context.lineWidth = 2;
      context.beginPath();
      context.arc(0, 0, DRONE.radius + 5, 0, TA);
      context.stroke();
      context.globalAlpha = 1;
      context.restore();
    }
  }

  function drawBossBody(state) {
    const boss = state.boss;
    if (!boss.active) return;
    context.save();
    context.translate(boss.x, boss.y);
    context.rotate(boss.phase * 0.34);
    context.beginPath();
    for (let point = 0; point < 12; point += 1) {
      const angle = (point / 12) * TA;
      const radius = point % 2 === 0 ? BOSS.radius : BOSS.radius * 0.7;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      if (point === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.closePath();
    context.fillStyle = PALETTE.asteroidBody;
    context.fill();
    if (boss.flash > 0) {
      context.fillStyle = `rgba(255,255,255,${Math.min(0.85, boss.flash * 9)})`;
      context.fill();
    }
    context.strokeStyle = PALETTE.enemy;
    context.lineWidth = 3;
    context.stroke();

    context.rotate(-boss.phase * 0.9);
    for (let point = 0; point < 6; point += 1) {
      const angle = (point / 6) * TA;
      context.fillStyle = PALETTE.enemy;
      context.beginPath();
      context.arc(Math.cos(angle) * BOSS.radius * 0.52, Math.sin(angle) * BOSS.radius * 0.52, 5, 0, TA);
      context.fill();
    }
    context.fillStyle = PALETTE.enemyGlow;
    context.shadowColor = PALETTE.enemy;
    context.shadowBlur = 24;
    context.beginPath();
    context.arc(0, 0, 22 + 4 * Math.sin(boss.phase * 3), 0, TA);
    context.fill();
    context.shadowBlur = 0;
    context.fillStyle = PALETTE.crystalSpark;
    context.beginPath();
    context.arc(0, 0, 7, 0, TA);
    context.fill();
    context.restore();
  }

  function drawBullets(state) {
    const volley = state.bullets;
    for (let index = 0; index < volley.length; index += 1) {
      const bullet = volley[index];
      if (!bullet.active) continue;
      context.save();
      context.translate(bullet.x, bullet.y);
      context.rotate(Math.atan2(bullet.vy, bullet.vx) + Math.PI / 2);
      context.shadowColor = PALETTE.player;
      context.shadowBlur = 8;
      context.fillStyle = PALETTE.playerLaser;
      context.fillRect(-1.8, -8, 3.6, 16);
      context.shadowBlur = 0;
      context.fillStyle = PALETTE.hudText;
      context.fillRect(-0.7, -5, 1.4, 9);
      context.restore();
    }
    context.fillStyle = PALETTE.enemyLaser;
    for (let index = 0; index < state.enemyBullets.length; index += 1) {
      const bullet = state.enemyBullets[index];
      if (!bullet.active) continue;
      context.shadowColor = PALETTE.enemy;
      context.shadowBlur = 10;
      context.beginPath();
      context.arc(bullet.x, bullet.y, 5, 0, TA);
      context.fill();
      context.shadowBlur = 0;
      context.fillStyle = PALETTE.crystalSpark;
      context.beginPath();
      context.arc(bullet.x, bullet.y, 1.8, 0, TA);
      context.fill();
      context.fillStyle = PALETTE.enemyLaser;
    }
  }

  function drawShip(x, y, scale, time, bank, alpha, shieldRatio) {
    const radius = PLAYER.radius;
    context.save();
    context.translate(x, y);
    context.rotate(bank);
    context.scale(scale, scale);
    context.globalAlpha = alpha;

    context.fillStyle = PALETTE.playerGlow;
    context.shadowColor = PALETTE.player;
    context.shadowBlur = 16;
    context.beginPath();
    context.moveTo(0, -radius * 1.35);
    context.lineTo(-radius * 1.05, radius * 1.05);
    context.lineTo(radius * 1.05, radius * 1.05);
    context.closePath();
    context.fill();
    context.shadowBlur = 0;

    const flame = 10 + 7 * Math.sin(time * 34) + 3 * Math.sin(time * 61);
    context.fillStyle = PALETTE.playerEngine;
    context.beginPath();
    context.moveTo(-radius * 0.36, radius * 0.76);
    context.lineTo(0, radius * 0.76 + flame);
    context.lineTo(radius * 0.36, radius * 0.76);
    context.closePath();
    context.fill();

    context.fillStyle = PALETTE.player;
    context.beginPath();
    context.moveTo(0, -radius * 1.08);
    context.lineTo(-radius * 0.72, radius * 0.2);
    context.lineTo(-radius * 1.02, radius * 1.02);
    context.lineTo(-radius * 0.28, radius * 0.62);
    context.lineTo(0, radius * 0.98);
    context.lineTo(radius * 0.28, radius * 0.62);
    context.lineTo(radius * 1.02, radius * 1.02);
    context.lineTo(radius * 0.72, radius * 0.2);
    context.closePath();
    context.fill();

    context.fillStyle = PALETTE.hudText;
    context.beginPath();
    context.moveTo(0, -radius * 0.62);
    context.lineTo(-radius * 0.18, radius * 0.18);
    context.lineTo(radius * 0.18, radius * 0.18);
    context.closePath();
    context.fill();

    if (shieldRatio > 0) {
      const ringRadius = radius + 10;
      context.strokeStyle = PALETTE.playerGlow;
      context.globalAlpha = alpha * 0.35;
      context.lineWidth = 3;
      context.beginPath();
      context.arc(0, 0, ringRadius, 0, TA);
      context.stroke();
      context.strokeStyle = PALETTE.hudCyan;
      context.globalAlpha = alpha * 0.9;
      context.beginPath();
      context.arc(0, 0, ringRadius, -Math.PI / 2, -Math.PI / 2 + TA * shieldRatio);
      context.stroke();
    }
    context.restore();
    context.globalAlpha = 1;
  }

  function drawPlayer(state, screen) {
    if (screen === SCREEN_TITLE) return;
    if (state.lives <= 0 && (screen === SCREEN_OVER || screen === SCREEN_VICTORY)) return;
    const player = state.player;
    if (player.invulnerable > 0 && Math.floor(player.invulnerable * 12) % 2 === 1) return;
    const bank = Math.max(-1, Math.min(1, player.vx / PLAYER.speed)) * 0.12 + state.aim * 0.3;
    const shieldRatio = player.shieldMax > 0 ? player.shield / player.shieldMax : 0;
    drawShip(player.x, player.y, 1, state.time, bank, 1, shieldRatio);
  }

  function drawParticles(state) {
    for (let index = 0; index < state.particles.length; index += 1) {
      const particle = state.particles[index];
      if (!particle.active) continue;
      context.globalAlpha = Math.max(0, particle.life / particle.maxLife);
      context.fillStyle = particle.color;
      context.beginPath();
      context.arc(particle.x, particle.y, particle.size, 0, TA);
      context.fill();
    }
    context.globalAlpha = 1;
  }

  function drawPopups(state) {
    context.textBaseline = 'middle';
    for (let index = 0; index < state.popups.length; index += 1) {
      const popup = state.popups[index];
      if (!popup.active) continue;
      const ratio = popup.life / popup.maxLife;
      context.globalAlpha = Math.min(1, ratio * 1.8);
      text(popup.text, popup.x, popup.y, popup.size, popup.color, 'center', '700');
    }
    context.globalAlpha = 1;
    context.textBaseline = 'alphabetic';
  }

  function drawNova(state) {
    const fx = state.novaFx;
    if (!fx.active) return;
    const ratio = fx.life / fx.maxLife;
    context.globalAlpha = Math.max(0, ratio) * 0.85;
    context.strokeStyle = PALETTE.player;
    context.lineWidth = 5;
    context.beginPath();
    context.arc(fx.x, fx.y, Math.max(1, fx.radius), 0, TA);
    context.stroke();
    context.strokeStyle = PALETTE.hudText;
    context.lineWidth = 1.5;
    context.beginPath();
    context.arc(fx.x, fx.y, Math.max(1, fx.radius * 0.72), 0, TA);
    context.stroke();
    context.globalAlpha = 1;
  }

  function drawBar(x, y, width, height, ratio, color) {
    context.fillStyle = PALETTE.panelCard;
    context.fillRect(x, y, width, height);
    context.fillStyle = color;
    context.fillRect(x, y, width * Math.max(0, Math.min(1, ratio)), height);
    context.strokeStyle = PALETTE.hudMuted;
    context.lineWidth = 1;
    context.strokeRect(x, y, width, height);
  }

  function drawShipIcon(x, y, size, filled) {
    context.beginPath();
    context.moveTo(x, y - size * 0.62);
    context.lineTo(x - size * 0.58, y + size * 0.58);
    context.lineTo(x + size * 0.58, y + size * 0.58);
    context.closePath();
    if (filled) {
      context.fillStyle = PALETTE.player;
      context.fill();
    } else {
      context.strokeStyle = PALETTE.hudMuted;
      context.lineWidth = 1.5;
      context.stroke();
    }
  }

  function drawUpgradeChips(state) {
    const x0 = 24;
    const y = FIELD.height - 96;
    const width = 128;
    const height = 28;
    const gap = 8;
    for (let slot = 0; slot < state.upgrades.length; slot += 1) {
      const upgrade = state.upgrades[slot];
      const x = x0 + slot * (width + gap);
      context.fillStyle = PALETTE.panelCard;
      roundRect(context, x, y, width, height, 6);
      context.fill();
      context.strokeStyle = upgrade.level > 0 ? PALETTE.panelBorder : PALETTE.hudMuted;
      context.lineWidth = 1;
      context.stroke();
      text(upgrade.short, x + 9, y + 18, 10, PALETTE.hudMuted, 'left', '700');
      const pipsX = x + width - 9 - upgrade.maxLevel * 11;
      for (let level = 0; level < upgrade.maxLevel; level += 1) {
        context.fillStyle = level < upgrade.level ? PALETTE.panelBorder : PALETTE.panelBg;
        context.fillRect(pipsX + level * 11, y + 10, 7, 8);
      }
    }
  }

  function drawHud(state) {
    const boss = state.boss;
    context.textBaseline = 'alphabetic';
    text('SCORE', 28, 28, 12, PALETTE.hudMuted, 'left', '700');
    text(scoreLabel(state.score), 28, 58, 33, PALETTE.hudText, 'left', '700');
    text('MULT', 30, 82, 10, PALETTE.hudMuted, 'left', '700');
    text(multiplierLabel(state.multiplier), 76, 84, 21, state.multiplier > 1 ? PALETTE.hudGold : PALETTE.hudMuted, 'left', '700');
    const chainRatio = state.chainTimer > 0 ? Math.min(1, state.chainTimer / CHAIN.window) : 0;
    drawBar(112, 75, 92, 6, chainRatio, PALETTE.hudGold);

    text(waveTextFor(state.wave), FIELD.width / 2, 28, 25, PALETTE.hudCyan, 'center', '700');
    if (boss.active) {
      const nameIndex = Math.min(BOSS_NAMES.length - 1, Math.max(0, boss.index - 1));
      text(BOSS_NAMES[nameIndex], FIELD.width / 2, 54, 12, PALETTE.hudMagenta, 'center', '700');
      const barWidth = 460;
      const barX = FIELD.width / 2 - barWidth / 2;
      drawBar(barX, 62, barWidth, 11, boss.hp / boss.maxHp, PALETTE.hudMagenta);
    } else {
      text('SURVIVE THE CASCADE', FIELD.width / 2, 54, 10, PALETTE.hudMuted, 'center', '700');
    }

    text('LIVES', FIELD.width - 28, 28, 12, PALETTE.hudMuted, 'right', '700');
    const rowWidth = INITIAL_LIVES * LIFE_SIZE + (INITIAL_LIVES - 1) * LIFE_GAP;
    const firstLife = FIELD.width - 28 - rowWidth;
    for (let life = 0; life < INITIAL_LIVES; life += 1) {
      drawShipIcon(
        firstLife + life * (LIFE_SIZE + LIFE_GAP) + LIFE_SIZE / 2,
        42,
        LIFE_SIZE,
        life < state.lives,
      );
    }
    drawCrystalShape(FIELD.width - 34, 80, 7, 0, 0);
    text(crystalsLabel(state.crystals), FIELD.width - 50, 87, 20, PALETTE.hudGold, 'right', '700');

    drawUpgradeChips(state);

    const shieldRatio = state.player.shieldMax > 0 ? state.player.shield / state.player.shieldMax : 0;
    text('SHIELD', 24, FIELD.height - 52, 10, PALETTE.hudMuted, 'left', '700');
    drawBar(24, FIELD.height - 40, 190, 11, shieldRatio, PALETTE.hudCyan);

    const novaRatio = 1 - state.player.specialTimer / PLAYER.specialCooldown;
    const novaX = FIELD.width - 24 - 200;
    text(
      novaRatio >= 1 ? 'NOVA READY [SPACE]' : 'NOVA CHARGING',
      FIELD.width - 24,
      FIELD.height - 52,
      10,
      novaRatio >= 1 ? PALETTE.hudGold : PALETTE.hudMuted,
      'right',
      '700',
    );
    drawBar(novaX, FIELD.height - 40, 200, 11, novaRatio, PALETTE.hudGold);
  }

  function drawPanel(title, lines, prompt, titleColor) {
    const width = 700;
    const height = 300;
    const x = (FIELD.width - width) / 2;
    const y = (FIELD.height - height) / 2;
    context.fillStyle = PALETTE.panelBg;
    roundRect(context, x, y, width, height, 16);
    context.fill();
    context.strokeStyle = titleColor;
    context.lineWidth = 2;
    context.stroke();
    context.fillStyle = titleColor;
    context.fillRect(x + 30, y + 26, width - 60, 2);

    context.textBaseline = 'alphabetic';
    context.save();
    context.shadowColor = titleColor;
    context.shadowBlur = 18;
    text(title, FIELD.width / 2, y + 92, 46, titleColor, 'center', '800');
    context.restore();
    for (let index = 0; index < lines.length; index += 1) {
      text(lines[index], FIELD.width / 2, y + 148 + index * 34, 21, PALETTE.hudMuted, 'center', '600');
    }
    text(prompt, FIELD.width / 2, y + height - 34, 21, PALETTE.hudGold, 'center', '700');
  }

  function drawUpgradeIcon(slot, x, y) {
    context.save();
    context.strokeStyle = PALETTE.hudCyan;
    context.fillStyle = PALETTE.hudCyan;
    context.lineWidth = 2;
    if (slot === 0) {
      context.beginPath();
      context.arc(x, y, 13, 0, TA);
      context.stroke();
      context.beginPath();
      context.arc(x, y, 7, 0, TA);
      context.stroke();
    } else if (slot === 1) {
      for (let line = -1; line <= 1; line += 1) {
        context.beginPath();
        context.moveTo(x + line * 7 - 4, y + 12);
        context.lineTo(x + line * 7 + 4, y - 12);
        context.stroke();
      }
    } else {
      context.beginPath();
      context.arc(x, y, 13, 0, TA);
      context.stroke();
      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(x, y - 8);
      context.moveTo(x, y);
      context.lineTo(x + 7, y + 3);
      context.stroke();
    }
    context.restore();
  }

  function drawUpgrade(state) {
    context.fillStyle = PALETTE.overlay;
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    const layout = UPGRADE_LAYOUT;
    const panelX = (FIELD.width - layout.panelWidth) / 2;
    const panelY = layout.panelY;
    context.fillStyle = PALETTE.panelBg;
    roundRect(context, panelX, panelY, layout.panelWidth, layout.panelHeight, 16);
    context.fill();
    context.strokeStyle = PALETTE.panelBorderGold;
    context.lineWidth = 2;
    context.stroke();

    context.textBaseline = 'alphabetic';
    text('UPGRADE BAY', FIELD.width / 2, panelY + 62, 40, PALETTE.hudCyan, 'center', '800');
    text(
      `WAVE ${state.wave} CLEARED  ·  ${state.crystals} CRYSTALS`,
      FIELD.width / 2,
      panelY + 96,
      17,
      PALETTE.hudGold,
      'center',
      '700',
    );
    const nextWave = state.wave + 1;
    const bossNext = nextWave % 5 === 0;
    text(
      bossNext ? `NEXT: WAVE ${nextWave} - BOSS INCOMING` : `NEXT: WAVE ${nextWave}`,
      FIELD.width / 2,
      panelY + 122,
      13,
      bossNext ? PALETTE.hudMagenta : PALETTE.hudMuted,
      'center',
      '700',
    );

    for (let slot = 0; slot < 3; slot += 1) {
      const upgrade = state.upgrades[slot];
      const rect = upgradeCardRect(slot);
      const maxed = upgrade.level >= upgrade.maxLevel;
      const affordable = !maxed && state.crystals >= upgrade.cost;
      context.fillStyle = PALETTE.panelCard;
      roundRect(context, rect.x, rect.y, rect.width, rect.height, 10);
      context.fill();
      context.strokeStyle = maxed ? PALETTE.hudMuted : affordable ? PALETTE.hudGreen : PALETTE.panelBorderMagenta;
      context.lineWidth = affordable ? 2 : 1;
      context.stroke();

      context.fillStyle = PALETTE.panelBg;
      roundRect(context, rect.x + rect.width / 2 - 18, rect.y + 14, 36, 26, 6);
      context.fill();
      text(CARD_KEYS[slot], rect.x + rect.width / 2, rect.y + 33, 16, PALETTE.hudMuted, 'center', '700');
      drawUpgradeIcon(slot, rect.x + rect.width / 2, rect.y + 62);
      text(upgrade.name, rect.x + rect.width / 2, rect.y + 102, 20, PALETTE.hudText, 'center', '700');
      text(upgrade.detail, rect.x + rect.width / 2, rect.y + 126, 13, PALETTE.hudMuted, 'center', '600');
      for (let level = 0; level < upgrade.maxLevel; level += 1) {
        const pipX = rect.x + rect.width / 2 - (upgrade.maxLevel * 18 - 6) / 2 + level * 18;
        context.fillStyle = level < upgrade.level ? PALETTE.hudCyan : PALETTE.panelBg;
        context.fillRect(pipX, rect.y + 146, 12, 9);
        context.strokeStyle = PALETTE.hudMuted;
        context.lineWidth = 1;
        context.strokeRect(pipX, rect.y + 146, 12, 9);
      }
      text(levelLabels[slot](upgrade.level), rect.x + rect.width / 2, rect.y + 178, 15, PALETTE.hudCyan, 'center', '700');
      text(
        maxed ? 'MAXED' : costLabels[slot](upgrade.cost),
        rect.x + rect.width / 2,
        rect.y + 211,
        20,
        maxed ? PALETTE.hudMuted : affordable ? PALETTE.hudGold : PALETTE.hudMagenta,
        'center',
        '700',
      );
    }

    text(
      '1 / 2 / 3 or click a card to buy  ·  Enter to launch',
      FIELD.width / 2,
      panelY + layout.panelHeight - 28,
      17,
      PALETTE.hudGold,
      'center',
      '700',
    );
  }

  function drawTitle(state, best) {
    const center = FIELD.width / 2;
    const pulse = 0.5 + 0.5 * Math.sin(state.time * 2.3);
    context.textBaseline = 'alphabetic';

    context.save();
    context.shadowColor = PALETTE.player;
    context.shadowBlur = 24 + 16 * pulse;
    text('NOVA', center, 170, 94, PALETTE.hudText, 'center', '800');
    text('CASCADE', center, 254, 94, PALETTE.hudCyan, 'center', '800');
    context.restore();
    text('THE LAST LIGHT IN A FALLING SKY', center, 294, 15, PALETTE.hudMuted, 'center', '700');

    text('ARROWS / WASD / MOUSE   steer the ship', center, 354, 19, PALETTE.hudText, 'center', '600');
    text('AUTO-FIRE is always on   ·   SPACE   nova burst', center, 386, 19, PALETTE.hudText, 'center', '600');
    text('Crystals buy upgrades between waves   ·   Boss every 5 waves', center, 418, 17, PALETTE.hudMuted, 'center', '600');
    text(bestLabel(best), center, 458, 18, PALETTE.hudGold, 'center', '700');

    const buttonWidth = 300;
    const buttonHeight = 56;
    const buttonX = center - buttonWidth / 2;
    const buttonY = 484;
    context.save();
    context.shadowColor = PALETTE.player;
    context.shadowBlur = 16 + 14 * pulse;
    context.fillStyle = `rgba(57, 244, 255, ${0.12 + 0.1 * pulse})`;
    roundRect(context, buttonX, buttonY, buttonWidth, buttonHeight, 28);
    context.fill();
    context.shadowBlur = 0;
    context.strokeStyle = PALETTE.hudCyan;
    context.lineWidth = 2;
    context.stroke();
    text('START', center, buttonY + 37, 24, PALETTE.hudCyan, 'center', '800');
    context.restore();

    text('Press Enter or click Start', center, 576, 17, PALETTE.hudMuted, 'center', '600');
    drawShip(
      center + Math.sin(state.time * 0.8) * 150,
      652,
      1.25,
      state.time,
      Math.sin(state.time * 0.8) * 0.14,
      0.95,
      0,
    );
  }

  /** The announcer's current call-out, faded by the alpha it reports, near the top centre. */
  function drawAnnouncement(line) {
    if (!line || !line.text) return;
    const alpha = Number.isFinite(line.alpha) ? Math.max(0, Math.min(1, line.alpha)) : 1;
    if (alpha <= 0) return;
    const label = String(line.text);
    const size = 22;
    context.save();
    context.font = `800 ${size}px ${FONT}`;
    const width = Math.min(FIELD.width - 48, context.measureText(label).width + 48);
    const pillX = (FIELD.width - width) / 2;
    const pillY = 86;
    context.globalAlpha = alpha * 0.6;
    context.fillStyle = PALETTE.panelBg;
    roundRect(context, pillX, pillY, width, 38, 19);
    context.fill();
    context.globalAlpha = alpha;
    context.shadowColor = PALETTE.player;
    context.shadowBlur = 12;
    text(label, FIELD.width / 2, pillY + 26, size, PALETTE.hudCyan, 'center', '800');
    context.restore();
  }

  /** The active mission and its progress, printed just below the announcer pill. */
  function drawMission(mission) {
    if (!mission || !mission.objectiveText) return;
    const center = FIELD.width / 2;
    const data = mission.progress || {};
    const label = data.label || `${data.current ?? 0} / ${data.target ?? 1}`;
    context.save();
    text(mission.objectiveText, center, 148, 16, PALETTE.hudText, 'center', '600');
    text(label, center, 167, 13, PALETTE.hudMuted, 'center', '700');
    context.restore();
  }

  /** Run stats and earned badges, printed in a block under the results panel's score. */
  function drawResults(extras) {
    const rows = Array.isArray(extras.summary) ? extras.summary : [];
    const badges = Array.isArray(extras.achievements) ? extras.achievements : [];
    if (rows.length === 0 && badges.length === 0) return;

    const panelX = 80;
    const panelY = 520;
    const panelWidth = FIELD.width - 160;
    const panelHeight = 190;
    context.save();
    context.fillStyle = PALETTE.panelBg;
    roundRect(context, panelX, panelY, panelWidth, panelHeight, 14);
    context.fill();
    context.strokeStyle = PALETTE.panelBorder;
    context.lineWidth = 1;
    context.stroke();
    context.textBaseline = 'alphabetic';

    const startY = panelY + 28;
    const rowStep = 18;
    const columns = [panelX + 28, panelX + 350, panelX + 700];
    const columnWidth = 300;
    const perColumn = 8;

    text('RUN STATS', columns[0], startY, 14, PALETTE.hudCyan, 'left', '700');
    text('BADGES EARNED', columns[2], startY, 14, PALETTE.hudGold, 'left', '700');

    for (let index = 0; index < rows.length && index < perColumn * 2; index += 1) {
      const row = Array.isArray(rows[index]) ? rows[index] : [];
      const column = index < perColumn ? 0 : 1;
      const x = columns[column];
      const y = startY + 26 + (index % perColumn) * rowStep;
      text(String(row[0] ?? ''), x, y, 14, PALETTE.hudMuted, 'left', '600');
      text(String(row[1] ?? ''), x + columnWidth, y, 14, PALETTE.hudText, 'right', '700');
    }

    if (badges.length === 0) {
      text('None yet', columns[2], startY + 26, 14, PALETTE.hudMuted, 'left', '600');
    } else {
      for (let index = 0; index < badges.length && index < perColumn; index += 1) {
        const badge = badges[index] || {};
        text(String(badge.name ?? ''), columns[2], startY + 26 + index * rowStep, 14, PALETTE.hudGold, 'left', '600');
      }
    }
    context.restore();
  }

  /** Paint one frame: the field, then the HUD or a panel for the screen the game is on. */
  function draw(state, screen, best, extras = {}) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.spaceBgEdge;
    context.fillRect(0, 0, canvas.width, canvas.height);

    const effects = state.effects;
    context.setTransform(
      view.scale,
      0,
      0,
      view.scale,
      view.x + effects.shakeX * view.scale,
      view.y + effects.shakeY * view.scale,
    );
    drawBackdrop(state);
    drawCrystals(state);
    drawAsteroids(state);
    drawBossBody(state);
    drawDrones(state);
    drawBullets(state);
    drawPlayer(state, screen);
    drawParticles(state);
    drawNova(state);
    drawPopups(state);

    if (effects.flash > 0) {
      context.globalAlpha = Math.min(0.55, effects.flash);
      context.fillStyle = effects.flashColor;
      context.fillRect(0, 0, FIELD.width, FIELD.height);
      context.globalAlpha = 1;
    }

    if (screen === SCREEN_TITLE) {
      drawTitle(state, best);
      return;
    }
    drawHud(state);
    if (screen === SCREEN_PLAY) {
      drawAnnouncement(extras.announcement);
      drawMission(extras.mission);
    }
    if (screen === SCREEN_UPGRADE) {
      drawUpgrade(state);
    } else if (screen === SCREEN_PAUSED) {
      drawPanel('PAUSED', ['The cascade holds its breath.'], 'Press P or Enter to resume', PALETTE.hudCyan);
    } else if (screen === SCREEN_OVER) {
      drawPanel(
        'GAME OVER',
        [finalScoreLabel(state.score), waveReachedLabel(state.wave), bestLabel(best)],
        'Press Enter to restart',
        PALETTE.hudMagenta,
      );
      drawResults(extras);
    } else if (screen === SCREEN_VICTORY) {
      drawPanel(
        'CASCADE COMPLETE',
        [`All ${MAX_WAVES} waves cleared.`, finalScoreLabel(state.score), bestLabel(best)],
        'Press Enter to restart',
        PALETTE.hudGold,
      );
      drawResults(extras);
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw };
}
