// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s steps
// (several in a slow frame, none in a fast one), and the renderer paints what is there. The game
// moves between six screens: title, play, the upgrade bay between waves, paused, game over and
// the wave-15 victory. Sounds are pure WebAudio, played in reaction to the world's event flags.
//
// ?seed=N fixes the falling pattern. ?shot=start|play|end (with &seed=N) stages that scene
// instead of running the loop, paints it twice and sets window.__shotReady for a screenshot.
import { BEST_KEY, INITIAL_LIVES, MAX_WAVES, STEP } from './config.js';
import { createRandom } from './random.js';
import {
  createWorld,
  EVENT_BOSS, EVENT_CRYSTAL, EVENT_EXPLODE, EVENT_HIT, EVENT_NOVA,
  EVENT_OVER, EVENT_SHOT, EVENT_VICTORY, EVENT_WAVE_CLEAR,
} from './world.js';
import { createInput, ACTION_BUY_1, ACTION_BUY_2, ACTION_BUY_3, ACTION_CONFIRM, ACTION_PAUSE, ACTION_SPECIAL } from './input.js';
import { createAudioSystem } from './audio.js';
import {
  createRenderer,
  SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_UPGRADE, SCREEN_VICTORY,
} from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const IDLE = { dx: 0, dy: 0, special: false };
const CONTROLS = { dx: 0, dy: 0, special: false };

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
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
  let specialSpent = false;
  let armedForSpecial = false;

  // Screen readers (and anyone watching the page's text) hear the screen changes and each hit.
  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    world.reset();
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce(`Playing. ${INITIAL_LIVES} lives. Wave 1.`);
  }

  function keepBest() {
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
  }

  function endGame() {
    keepBest();
    accumulator = 0;
    screen = SCREEN_OVER;
    announce(`Game over. Score ${world.state.score}. Best ${best}.`);
  }

  function winGame() {
    keepBest();
    accumulator = 0;
    screen = SCREEN_VICTORY;
    announce(`Victory. All ${MAX_WAVES} waves cleared. Score ${world.state.score}. Best ${best}.`);
  }

  function openUpgradeBay() {
    accumulator = 0;
    screen = SCREEN_UPGRADE;
    announce(`Wave ${world.state.wave} cleared. ${world.state.crystals} crystals. Buy upgrades with 1, 2 or 3; Enter launches wave ${world.state.wave + 1}.`);
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
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce(`Wave ${world.state.wave}.${events & EVENT_BOSS ? ' Boss incoming.' : ''}`);
  }

  function handleActions() {
    if (screen === SCREEN_TITLE || screen === SCREEN_OVER || screen === SCREEN_VICTORY) {
      if (actions & ACTION_CONFIRM) startGame();
    } else if (screen === SCREEN_UPGRADE) {
      if (actions & ACTION_BUY_1) tryBuy(0);
      if (actions & ACTION_BUY_2) tryBuy(1);
      if (actions & ACTION_BUY_3) tryBuy(2);
      if (actions & (ACTION_CONFIRM | ACTION_SPECIAL)) launchWave();
    } else if (screen === SCREEN_PLAY) {
      if (actions & ACTION_PAUSE) {
        accumulator = 0;
        screen = SCREEN_PAUSED;
        announce('Paused.');
      }
    } else if (screen === SCREEN_PAUSED) {
      if (actions & (ACTION_PAUSE | ACTION_CONFIRM)) {
        accumulator = 0;
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
    }
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
    if (events & EVENT_BOSS) {
      audio.playBossWarning();
      announce('Boss incoming.');
    }
    if (events & EVENT_OVER) endGame();
    else if (events & EVENT_VICTORY) winGame();
    else if (events & EVENT_WAVE_CLEAR) openUpgradeBay();
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      world.step(STEP, IDLE, true);
      return;
    }
    CONTROLS.dx = 0;
    CONTROLS.dy = 0;
    CONTROLS.special = false;
    // Space on the title or upgrade screen also carries the special bit: only honour it when
    // the frame began on the play screen, so starting or launching never wastes a nova.
    if (armedForSpecial && !specialSpent && actions & ACTION_SPECIAL) {
      CONTROLS.special = true;
      specialSpent = true;
    }
    const movement = input.getMovement();
    CONTROLS.dx = movement.dx;
    CONTROLS.dy = movement.dy;
    reactTo(world.step(STEP, CONTROLS, false));
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    actions = input.takeActions();
    specialSpent = false;
    armedForSpecial = screen === SCREEN_PLAY;
    handleActions();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, best);
  }

  // Leaving the tab pauses a running game rather than letting waves play out unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Nova Cascade. Press Space or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
