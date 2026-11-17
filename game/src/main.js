// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s steps
// (several in a slow frame, none in a fast one), and the renderer paints what is there. The game
// moves between six screens: title, play, the upgrade bay between waves, paused, game over and the
// wave-15 victory. Sounds are pure WebAudio, played in reaction to the world's event flags.
//
// ?seed=N fixes the falling pattern. ?shot=start|play|end (with &seed=N) stages that scene
// instead of running the loop, paints it twice and sets window.__shotReady for a screenshot.
import {
  BEST_KEY, INITIAL_LIVES, MAX_WAVES, STEP, upgradeCardRect,
} from './config.js';
import { createRandom } from './random.js';
import {
  createWorld,
  EVENT_BOSS, EVENT_CRYSTAL, EVENT_EXPLODE, EVENT_HIT, EVENT_NOVA,
  EVENT_OVER, EVENT_SHOT, EVENT_VICTORY, EVENT_WAVE_CLEAR,
} from './world.js';
import {
  ACTION_BUY_1, ACTION_BUY_2, ACTION_BUY_3, ACTION_CLICK, ACTION_CONFIRM,
  ACTION_PAUSE, ACTION_SPECIAL, createInput,
} from './input.js';
import { createAudioSystem } from './audio.js';
import {
  createRenderer,
  SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_UPGRADE, SCREEN_VICTORY,
} from './render.js';
import { stageShot } from './shots.js';
import { announceInit } from './announce.js';
import { createRunStats } from './stats.js';
import { createAchievements } from './achievements.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;
const IDLE = { dx: 0, dy: 0, special: false };

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const announcer = announceInit(world.state);
const runStats = createRunStats();
const achievements = createAchievements();
const renderer = createRenderer(canvas);

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  const audio = createAudioSystem();
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();
  let actions = 0;
  let specialRequested = false;
  let summaryRows = [];
  let earnedBadges = [];

  // Screen readers (and anyone watching the page's text) hear the screen changes and each hit.
  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    world.reset();
    announcer.reset(world.state);
    achievements.reset();
    summaryRows = [];
    earnedBadges = [];
    input.releasePointer();
    audio.resume();
    accumulator = 0;
    specialRequested = false;
    screen = SCREEN_PLAY;
    announce(`Playing. ${INITIAL_LIVES} lives. Wave 1.`);
  }

  function keepBest() {
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
  }

  // Menus do not advance the world, so a live shake offset or full-screen flash would stay put.
  function settleMenuEffects() {
    const effects = world.state.effects;
    effects.shake = 0;
    effects.shakeX = 0;
    effects.shakeY = 0;
    effects.flash = 0;
    world.state.novaFx.active = false;
  }

  function endGame() {
    keepBest();
    settleMenuEffects();
    accumulator = 0;
    screen = SCREEN_OVER;
    audio.playGameOver();
    summaryRows = runStats.summary(world.state);
    earnedBadges = achievements.earned();
    announce(`Game over. Score ${world.state.score}. Best ${best}.`);
  }

  function winGame() {
    keepBest();
    settleMenuEffects();
    accumulator = 0;
    screen = SCREEN_VICTORY;
    audio.playVictory();
    summaryRows = runStats.summary(world.state);
    earnedBadges = achievements.earned();
    announce(`Victory. All ${MAX_WAVES} waves cleared. Score ${world.state.score}. Best ${best}.`);
  }

  function openUpgradeBay() {
    settleMenuEffects();
    accumulator = 0;
    input.releasePointer();
    screen = SCREEN_UPGRADE;
    announce(`Wave ${world.state.wave} cleared. ${world.state.crystals} crystals. Buy upgrades with 1, 2 or 3; press Enter to launch wave ${world.state.wave + 1}.`);
  }

  function tryBuy(slot) {
    const upgrade = world.state.upgrades[slot];
    if (world.buyUpgrade(slot)) {
      audio.playUpgrade();
      announce(`${upgrade.name} to level ${upgrade.level}. ${world.state.crystals} crystals left.`);
    } else {
      announce('Not enough crystals, or already maxed.');
    }
  }

  function launchWave() {
    const events = world.startNextWave();
    input.releasePointer();
    audio.resume();
    accumulator = 0;
    specialRequested = false;
    screen = SCREEN_PLAY;
    if (events & EVENT_BOSS) {
      audio.playBossWarning();
      announce(`Wave ${world.state.wave}. Boss incoming.`);
    } else {
      announce(`Wave ${world.state.wave}.`);
    }
  }

  function clickedCard() {
    const mouse = input.getMouse();
    if (!mouse.active) return -1;
    for (let slot = 0; slot < 3; slot += 1) {
      const rect = upgradeCardRect(slot);
      if (
        mouse.x >= rect.x && mouse.x <= rect.x + rect.width
        && mouse.y >= rect.y && mouse.y <= rect.y + rect.height
      ) return slot;
    }
    return -1;
  }

  function handleActions() {
    if (actions !== 0) audio.resume();
    if (screen === SCREEN_TITLE || screen === SCREEN_OVER || screen === SCREEN_VICTORY) {
      if (actions & (ACTION_CONFIRM | ACTION_CLICK)) startGame();
    } else if (screen === SCREEN_UPGRADE) {
      if (actions & ACTION_BUY_1) tryBuy(0);
      if (actions & ACTION_BUY_2) tryBuy(1);
      if (actions & ACTION_BUY_3) tryBuy(2);
      if (actions & ACTION_CLICK) {
        const slot = clickedCard();
        if (slot >= 0) tryBuy(slot);
        else launchWave();
      } else if (actions & (ACTION_CONFIRM | ACTION_SPECIAL)) {
        launchWave();
      }
    } else if (screen === SCREEN_PLAY) {
      if (actions & ACTION_PAUSE) {
        settleMenuEffects();
        accumulator = 0;
        specialRequested = false;
        screen = SCREEN_PAUSED;
        announce('Paused.');
      }
    } else if (screen === SCREEN_PAUSED) {
      if (actions & (ACTION_PAUSE | ACTION_CONFIRM | ACTION_CLICK)) {
        accumulator = 0;
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
    }
  }

  function controlsForStep() {
    const movement = input.getMovement();
    let dx = movement.dx;
    let dy = movement.dy;
    if (dx === 0 && dy === 0) {
      const mouse = input.getMouse();
      if (mouse.active) {
        const toX = mouse.x - world.state.player.x;
        const toY = mouse.y - world.state.player.y;
        const distance = Math.hypot(toX, toY);
        if (distance > 6) {
          const strength = Math.min(1, distance / 90);
          dx = (toX / distance) * strength;
          dy = (toY / distance) * strength;
        }
      }
    }
    let special = false;
    if (specialRequested) {
      if (world.state.player.specialTimer === 0) special = true;
      specialRequested = false;
    }
    return { dx, dy, special };
  }

  function reactTo(events) {
    if (events & EVENT_SHOT) audio.playLaser();
    if (events & EVENT_EXPLODE) audio.playExplosion(1);
    if (events & EVENT_CRYSTAL) audio.playCrystal();
    if (events & EVENT_NOVA) audio.playNova();
    if (events & EVENT_HIT) {
      audio.playHit();
      announce(world.state.lives === 1 ? 'Hit. 1 life left.' : `Hit. ${world.state.lives} lives left.`);
    }
    if (events & EVENT_BOSS) audio.playBossWarning();
    if (events & EVENT_OVER) endGame();
    else if (events & EVENT_VICTORY) winGame();
    else if (events & EVENT_WAVE_CLEAR) {
      audio.playWaveClear();
      openUpgradeBay();
    }
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      world.step(STEP, IDLE, true);
      return;
    }
    const events = world.step(STEP, controlsForStep(), false);
    runStats.onEvent(events, world.state);
    achievements.onEvent(events, world.state);
    announcer.update(events, world.state);
    reactTo(events);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    actions = input.takeActions();
    if (screen === SCREEN_PLAY && (actions & (ACTION_SPECIAL | ACTION_CLICK))) specialRequested = true;
    handleActions();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, best, {
      announcement: announcer.current(),
      summary: summaryRows,
      achievements: earnedBadges,
    });
  }

  // Leaving the tab pauses a running game rather than letting waves play out unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      settleMenuEffects();
      specialRequested = false;
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });
  window.addEventListener('blur', () => {
    if (screen === SCREEN_PLAY) {
      settleMenuEffects();
      accumulator = 0;
      specialRequested = false;
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Nova Cascade. Press Enter or click Start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
