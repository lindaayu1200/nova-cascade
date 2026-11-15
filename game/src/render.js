// Drawing only: the world's state and the current screen in, pixels out. The 1280x720 playfield
// is scaled to fit the window and centred, the margin filled with the backdrop colour. Flat
// shapes and canvas text; the palette is the deep-indigo/cyan/magenta/gold set in config. Text
// that holds a number is rebuilt only when the number changes, so a frame allocates nothing.
import { FIELD, FONT, INITIAL_LIVES, MAX_WAVES, PALETTE, PLAYER } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_UPGRADE = 'upgrade';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_VICTORY = 'victory';

const STAR_TINTS = [PALETTE.starWhite, PALETTE.starCyan, PALETTE.starMagenta];
const DRONE_RADIUS = 14;
const BOSS_RADIUS = 62;

const PANEL = { width: 720, top: 150, line: 36, bottom: 76 };
const UPGRADE_CARD = { width: 200, height: 210, gap: 24 };
const SLOT_KEYS = ['1', '2', '3'];

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

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };

  const scoreLabel = cachedLabel('Score ');
  const multiplierLabel = cachedLabel('x');
  const crystalsLabel = cachedLabel('');
  const finalScoreLabel = cachedLabel('Score ');
  const finalWaveLabel = cachedLabel('Waves cleared: ');
  const bestLabel = cachedLabel('Best ');
  const costLabels = [cachedLabel('Cost '), cachedLabel('Cost '), cachedLabel('Cost ')];
  const levelLabels = [cachedLabel('Level '), cachedLabel('Level '), cachedLabel('Level ')];
  const walletLabel = cachedLabel('Crystals: ');

  let waveShown = -1;
  let waveText = '';
  function waveTextFor(next) {
    if (next !== waveShown) {
      waveShown = next;
      waveText = `Wave ${next}/${MAX_WAVES}`;
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

  const fonts = new Map();
  function text(value, x, y, size, color, align) {
    if (!fonts.has(size)) fonts.set(size, `${size}px ${FONT}`);
    context.font = fonts.get(size);
    context.fillStyle = color;
    context.textAlign = align;
    context.fillText(value, x, y);
  }

  function drawBackdrop(state) {
    context.fillStyle = PALETTE.spaceBg;
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    context.fillStyle = PALETTE.nebulaIndigo;
    context.beginPath();
    context.ellipse(300, 540, 360, 230, -0.4, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = PALETTE.nebulaCyan;
    context.beginPath();
    context.ellipse(990, 180, 320, 200, 0.5, 0, Math.PI * 2);
    context.fill();
    for (let index = 0; index < state.stars.length; index += 1) {
      const star = state.stars[index];
      context.fillStyle = STAR_TINTS[star.tint];
      context.fillRect(star.x, star.y, star.size, star.size);
    }
  }

  function drawCrystals(state) {
    const pool = state.crystalPool;
    for (let index = 0; index < pool.length; index += 1) {
      const crystal = pool[index];
      if (!crystal.active) continue;
      context.save();
      context.translate(crystal.x, crystal.y);
      context.rotate(crystal.spin);
      context.globalAlpha = Math.min(1, crystal.life / 2);
      context.fillStyle = PALETTE.crystalGlow;
      context.beginPath();
      context.moveTo(0, -13);
      context.lineTo(9, 0);
      context.lineTo(0, 13);
      context.lineTo(-9, 0);
      context.closePath();
      context.fill();
      context.fillStyle = PALETTE.crystalGold;
      context.beginPath();
      context.moveTo(0, -9);
      context.lineTo(6, 0);
      context.lineTo(0, 9);
      context.lineTo(-6, 0);
      context.closePath();
      context.fill();
      context.restore();
    }
    context.globalAlpha = 1;
  }

  function drawAsteroids(state) {
    const rocks = state.asteroids;
    for (let index = 0; index < rocks.length; index += 1) {
      const rock = rocks[index];
      if (!rock.active) continue;
      context.fillStyle = PALETTE.asteroidBody;
      context.beginPath();
      for (let corner = 0; corner < 9; corner += 1) {
        const angle = (corner / 9) * Math.PI * 2;
        const radius = rock.radius * rock.wobble * (0.82 + 0.18 * Math.sin(corner * 2.3 + rock.phase));
        const x = rock.x + Math.cos(angle) * radius;
        const y = rock.y + Math.sin(angle) * radius;
        if (corner === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.closePath();
      context.fill();
      context.strokeStyle = PALETTE.asteroidCrater;
      context.globalAlpha = 0.5;
      context.lineWidth = 2;
      context.stroke();
      context.globalAlpha = 1;
      context.fillStyle = PALETTE.asteroidCrater;
      context.beginPath();
      context.arc(rock.x + Math.cos(rock.phase) * rock.radius * 0.4, rock.y + Math.sin(rock.phase * 1.3) * rock.radius * 0.4, rock.radius * 0.22, 0, Math.PI * 2);
      context.fill();
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
      context.fillStyle = PALETTE.enemyMagenta;
      context.beginPath();
      context.moveTo(DRONE_RADIUS + 4, 0);
      context.lineTo(-DRONE_RADIUS, -DRONE_RADIUS * 0.8);
      context.lineTo(-DRONE_RADIUS * 0.4, 0);
      context.lineTo(-DRONE_RADIUS, DRONE_RADIUS * 0.8);
      context.closePath();
      context.fill();
      context.strokeStyle = PALETTE.enemyGlow;
      context.globalAlpha = 0.3 + 0.2 * Math.sin(drone.phase);
      context.lineWidth = 2;
      context.beginPath();
      context.arc(0, 0, DRONE_RADIUS + 5, 0, Math.PI * 2);
      context.stroke();
      context.globalAlpha = 1;
      context.restore();
    }
  }

  function drawBoss(state) {
    const boss = state.boss;
    if (!boss.active) return;
    context.save();
    context.translate(boss.x, boss.y);
    context.rotate(boss.phase * 0.4);
    context.fillStyle = PALETTE.asteroidBody;
    context.beginPath();
    for (let corner = 0; corner < 6; corner += 1) {
      const angle = (corner / 6) * Math.PI * 2;
      const x = Math.cos(angle) * BOSS_RADIUS;
      const y = Math.sin(angle) * BOSS_RADIUS;
      if (corner === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.closePath();
    context.fill();
    context.strokeStyle = PALETTE.enemyMagenta;
    context.lineWidth = 4;
    context.stroke();
    context.restore();
    context.fillStyle = PALETTE.enemyGlow;
    context.globalAlpha = 0.4 + 0.2 * Math.sin(boss.phase * 3);
    context.beginPath();
    context.arc(boss.x, boss.y, 26, 0, Math.PI * 2);
    context.fill();
    context.globalAlpha = 1;
    const width = 320;
    const x = FIELD.width / 2 - width / 2;
    const y = 54;
    context.fillStyle = PALETTE.panelCardBg;
    context.fillRect(x, y, width, 10);
    context.fillStyle = PALETTE.hudMagenta;
    context.fillRect(x, y, width * Math.max(0, boss.hp / boss.maxHp), 10);
    context.strokeStyle = PALETTE.hudMuted;
    context.lineWidth = 1;
    context.strokeRect(x, y, width, 10);
  }

  function drawBullets(state) {
    context.fillStyle = PALETTE.playerLaser;
    const volley = state.bullets;
    for (let index = 0; index < volley.length; index += 1) {
      const bullet = volley[index];
      if (!bullet.active) continue;
      context.save();
      context.translate(bullet.x, bullet.y);
      context.rotate(Math.atan2(bullet.vy, bullet.vx) + Math.PI / 2);
      context.fillRect(-2, -9, 4, 18);
      context.restore();
    }
    context.fillStyle = PALETTE.enemyLaser;
    for (let index = 0; index < state.enemyBullets.length; index += 1) {
      const bullet = state.enemyBullets[index];
      if (!bullet.active) continue;
      context.beginPath();
      context.arc(bullet.x, bullet.y, 5, 0, Math.PI * 2);
      context.fill();
    }
  }

  function drawPlayer(state, screen) {
    if (screen === SCREEN_TITLE) return;
    const player = state.player;
    // Blink while invulnerable after a hit: hidden on every other tenth of a second.
    if (player.invulnerable > 0 && Math.floor(player.invulnerable * 10) % 2 === 1) return;
    const radius = PLAYER.radius;
    context.fillStyle = PALETTE.playerGlow;
    context.beginPath();
    context.moveTo(player.x, player.y - radius * 1.35);
    context.lineTo(player.x - radius * 1.1, player.y + radius * 1.2);
    context.lineTo(player.x + radius * 1.1, player.y + radius * 1.2);
    context.closePath();
    context.fill();
    context.fillStyle = PALETTE.playerEngine;
    const flame = 10 + 6 * Math.sin(state.elapsed * 30);
    context.beginPath();
    context.moveTo(player.x - radius * 0.4, player.y + radius * 0.9);
    context.lineTo(player.x, player.y + radius * 0.9 + flame);
    context.lineTo(player.x + radius * 0.4, player.y + radius * 0.9);
    context.closePath();
    context.fill();
    context.fillStyle = PALETTE.player;
    context.beginPath();
    context.moveTo(player.x, player.y - radius);
    context.lineTo(player.x - radius * 0.85, player.y + radius);
    context.lineTo(player.x + radius * 0.85, player.y + radius);
    context.closePath();
    context.fill();
    if (player.shield > 0) {
      context.strokeStyle = PALETTE.hudCyan;
      context.globalAlpha = 0.25;
      context.lineWidth = 3;
      context.beginPath();
      context.arc(player.x, player.y, radius + 9, 0, Math.PI * 2);
      context.stroke();
      context.globalAlpha = 0.9;
      const portion = player.shield / player.shieldMax;
      context.beginPath();
      context.arc(player.x, player.y, radius + 9, -Math.PI / 2 - portion * Math.PI, -Math.PI / 2 + portion * Math.PI);
      context.stroke();
      context.globalAlpha = 1;
    }
  }

  function drawParticles(state) {
    for (let index = 0; index < state.particles.length; index += 1) {
      const particle = state.particles[index];
      if (!particle.active) continue;
      context.globalAlpha = Math.max(0, particle.life / particle.maxLife);
      context.fillStyle = particle.color;
      context.beginPath();
      context.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
  }

  function drawShipIcon(x, y, size, filled) {
    context.beginPath();
    context.moveTo(x, y - size * 0.6);
    context.lineTo(x - size * 0.55, y + size * 0.6);
    context.lineTo(x + size * 0.55, y + size * 0.6);
    context.closePath();
    if (filled) {
      context.fillStyle = PALETTE.player;
      context.fill();
    } else {
      context.strokeStyle = PALETTE.hudMuted;
      context.lineWidth = 2;
      context.stroke();
    }
  }

  function drawBar(x, y, width, height, ratio, color) {
    context.fillStyle = PALETTE.panelCardBg;
    context.fillRect(x, y, width, height);
    context.fillStyle = color;
    context.fillRect(x, y, width * Math.max(0, Math.min(1, ratio)), height);
    context.strokeStyle = PALETTE.hudMuted;
    context.lineWidth = 1;
    context.strokeRect(x, y, width, height);
  }

  function drawHud(state) {
    context.textBaseline = 'top';
    text(scoreLabel(state.score), 24, 18, 26, PALETTE.hudText, 'left');
    text(multiplierLabel(state.multiplier), 24, 50, 20, state.multiplier > 1 ? PALETTE.hudGold : PALETTE.hudMuted, 'left');
    const crystalX = 30;
    const crystalY = 92;
    context.fillStyle = PALETTE.crystalGold;
    context.beginPath();
    context.moveTo(crystalX, crystalY - 9);
    context.lineTo(crystalX + 6, crystalY);
    context.lineTo(crystalX, crystalY + 9);
    context.lineTo(crystalX - 6, crystalY);
    context.closePath();
    context.fill();
    text(crystalsLabel(state.crystals), 46, 84, 20, PALETTE.hudGold, 'left');
    text(waveTextFor(state.wave), FIELD.width / 2, 18, 26, PALETTE.hudCyan, 'center');
    const iconSize = 22;
    const firstIcon = FIELD.width - 24 - INITIAL_LIVES * (iconSize + 8) + 8;
    text('Lives', firstIcon - 14, 18, 26, PALETTE.hudText, 'right');
    for (let life = 0; life < INITIAL_LIVES; life += 1) {
      drawShipIcon(firstIcon + life * (iconSize + 8) + iconSize / 2, 32, iconSize, life < state.lives);
    }
    const barWidth = 190;
    const barY = FIELD.height - 56;
    text('SHIELD', 24, barY - 18, 12, PALETTE.hudMuted, 'left');
    drawBar(24, barY, barWidth, 12, state.player.shield / state.player.shieldMax, PALETTE.hudCyan);
    const novaRatio = 1 - state.player.specialTimer / PLAYER.specialCooldown;
    text(novaRatio >= 1 ? 'NOVA READY (SPACE)' : 'NOVA', 24, barY + 18, 12, novaRatio >= 1 ? PALETTE.hudGold : PALETTE.hudMuted, 'left');
    drawBar(24, barY + 34, barWidth, 12, novaRatio, PALETTE.hudGold);
  }

  function drawPanel(title, lines, prompt, titleColor) {
    const height = PANEL.top + lines.length * PANEL.line + PANEL.bottom;
    const x = (FIELD.width - PANEL.width) / 2;
    const y = (FIELD.height - height) / 2;
    context.fillStyle = PALETTE.panelBg;
    context.fillRect(x, y, PANEL.width, height);
    context.strokeStyle = PALETTE.panelBorder;
    context.lineWidth = 2;
    context.strokeRect(x, y, PANEL.width, height);
    context.textBaseline = 'alphabetic';
    text(title, FIELD.width / 2, y + 92, 48, titleColor, 'center');
    for (let index = 0; index < lines.length; index += 1) {
      text(lines[index], FIELD.width / 2, y + PANEL.top + index * PANEL.line, 22, PALETTE.hudMuted, 'center');
    }
    text(prompt, FIELD.width / 2, y + height - 44, 24, PALETTE.hudGold, 'center');
  }

  function drawUpgrade(state) {
    context.fillStyle = 'rgba(4, 5, 14, 0.6)';
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    const panelWidth = UPGRADE_CARD.width * 3 + UPGRADE_CARD.gap * 2 + 80;
    const panelHeight = UPGRADE_CARD.height + 210;
    const px = (FIELD.width - panelWidth) / 2;
    const py = (FIELD.height - panelHeight) / 2;
    context.fillStyle = PALETTE.panelBg;
    context.fillRect(px, py, panelWidth, panelHeight);
    context.strokeStyle = PALETTE.panelBorder;
    context.lineWidth = 2;
    context.strokeRect(px, py, panelWidth, panelHeight);
    context.textBaseline = 'alphabetic';
    text('UPGRADE BAY', FIELD.width / 2, py + 62, 40, PALETTE.hudCyan, 'center');
    text(walletLabel(state.crystals), FIELD.width / 2, py + 102, 24, PALETTE.hudGold, 'center');
    for (let slot = 0; slot < 3; slot += 1) {
      const upgrade = state.upgrades[slot];
      const x = FIELD.width / 2 + (slot - 1) * (UPGRADE_CARD.width + UPGRADE_CARD.gap) - UPGRADE_CARD.width / 2;
      const y = py + 132;
      context.fillStyle = PALETTE.panelCardBg;
      context.fillRect(x, y, UPGRADE_CARD.width, UPGRADE_CARD.height);
      context.strokeStyle = PALETTE.panelBorder;
      context.lineWidth = 1;
      context.strokeRect(x, y, UPGRADE_CARD.width, UPGRADE_CARD.height);
      text(SLOT_KEYS[slot], x + UPGRADE_CARD.width / 2, y + 38, 26, PALETTE.hudMuted, 'center');
      text(upgrade.name, x + UPGRADE_CARD.width / 2, y + 74, 22, PALETTE.hudText, 'center');
      text(upgrade.detail, x + UPGRADE_CARD.width / 2, y + 102, 15, PALETTE.hudMuted, 'center');
      for (let level = 0; level < upgrade.maxLevel; level += 1) {
        context.fillStyle = level < upgrade.level ? PALETTE.hudGreen : PALETTE.panelBg;
        context.fillRect(x + UPGRADE_CARD.width / 2 - 30 + level * 22, y + 124, 16, 10);
        context.strokeStyle = PALETTE.hudMuted;
        context.strokeRect(x + UPGRADE_CARD.width / 2 - 30 + level * 22, y + 124, 16, 10);
      }
      text(levelLabels[slot](upgrade.level), x + UPGRADE_CARD.width / 2, y + 160, 18, PALETTE.hudCyan, 'center');
      text(
        upgrade.level >= upgrade.maxLevel ? 'MAXED' : costLabels[slot](upgrade.cost),
        x + UPGRADE_CARD.width / 2,
        y + 188,
        20,
        upgrade.level >= upgrade.maxLevel ? PALETTE.hudMuted : state.crystals >= upgrade.cost ? PALETTE.hudGold : PALETTE.hudMagenta,
        'center',
      );
    }
    text('1 / 2 / 3 buy - Enter launches the next wave', FIELD.width / 2, py + panelHeight - 34, 22, PALETTE.hudGold, 'center');
  }

  /** Paint one frame: the field, then the HUD or a panel for the screen the game is on. */
  function draw(state, screen, best) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.spaceBg;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    drawBackdrop(state);
    drawCrystals(state);
    drawAsteroids(state);
    drawBoss(state);
    drawDrones(state);
    drawBullets(state);
    drawPlayer(state, screen);
    drawParticles(state);
    if (screen === SCREEN_TITLE) {
      context.textBaseline = 'alphabetic';
      drawPanel(
        'NOVA CASCADE',
        ['Autofire blazes - Space unleashes the nova.', 'Split the asteroids, dodge the homing drones.', 'Boss every fifth wave. Clear all 15 to win.', '', bestLabel(best)],
        'Press Space or click to start',
        PALETTE.hudCyan,
      );
      return;
    }
    drawHud(state);
    if (screen === SCREEN_UPGRADE) {
      drawUpgrade(state);
    } else if (screen === SCREEN_PAUSED) {
      context.textBaseline = 'alphabetic';
      drawPanel('Paused', ['The cascade will wait for you.'], 'Press P to resume', PALETTE.hudCyan);
    } else if (screen === SCREEN_OVER) {
      context.textBaseline = 'alphabetic';
      drawPanel(
        'GAME OVER',
        [finalScoreLabel(state.score), finalWaveLabel(state.wave), bestLabel(best)],
        'Press Space or click to play again',
        PALETTE.hudMagenta,
      );
    } else if (screen === SCREEN_VICTORY) {
      context.textBaseline = 'alphabetic';
      drawPanel(
        'VICTORY',
        [`All ${MAX_WAVES} waves cleared.`, finalScoreLabel(state.score), bestLabel(best)],
        'Press Space or click to play again',
        PALETTE.hudGold,
      );
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw };
}
