// Keyboard, mouse and touch input. Held keys give a movement direction; the pointer gives a
// target the ship steers toward. One-shot presses (confirm, special, pause, shop keys and mouse
// clicks) are queued as bit flags and taken once by the loop, so a press between two frames is
// never lost and never counted twice.
import { FIELD } from './config.js';

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_SPECIAL = 4;
export const ACTION_BUY_1 = 8;
export const ACTION_BUY_2 = 16;
export const ACTION_BUY_3 = 32;
export const ACTION_CLICK = 64;

const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const PAUSE = new Set(['KeyP', 'Escape']);
const BUY_1 = new Set(['Digit1', 'Numpad1']);
const BUY_2 = new Set(['Digit2', 'Numpad2']);
const BUY_3 = new Set(['Digit3', 'Numpad3']);

export function createInput(canvas) {
  const held = new Set();
  const mouse = { x: FIELD.width / 2, y: FIELD.height / 2, active: false, down: false };
  let actions = 0;

  /** Canvas pixels to 1280x720 playfield coordinates, allowing for letterboxing and DPR. */
  function updatePointer(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const scale = Math.min(rect.width / FIELD.width, rect.height / FIELD.height);
    const offsetX = (rect.width - FIELD.width * scale) / 2;
    const offsetY = (rect.height - FIELD.height * scale) / 2;
    mouse.x = Math.max(0, Math.min(FIELD.width, (clientX - rect.left - offsetX) / scale));
    mouse.y = Math.max(0, Math.min(FIELD.height, (clientY - rect.top - offsetY) / scale));
    mouse.active = true;
  }

  window.addEventListener('keydown', (event) => {
    if (event.code === 'Space') {
      if (!event.repeat) actions |= ACTION_SPECIAL | ACTION_CONFIRM;
    } else if (event.code === 'Enter') {
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (BUY_1.has(event.code)) {
      if (!event.repeat) actions |= ACTION_BUY_1;
    } else if (BUY_2.has(event.code)) {
      if (!event.repeat) actions |= ACTION_BUY_2;
    } else if (BUY_3.has(event.code)) {
      if (!event.repeat) actions |= ACTION_BUY_3;
    } else if (UP.has(event.code) || DOWN.has(event.code) || LEFT.has(event.code) || RIGHT.has(event.code)) {
      held.add(event.code);
      // A key press takes the helm; moving the mouse hands it back.
      mouse.active = false;
    } else {
      return;
    }
    event.preventDefault();
  });

  window.addEventListener('keyup', (event) => {
    held.delete(event.code);
  });

  window.addEventListener('blur', () => {
    held.clear();
    mouse.down = false;
  });

  canvas.addEventListener('pointermove', (event) => {
    updatePointer(event.clientX, event.clientY);
  });

  canvas.addEventListener('pointerdown', (event) => {
    updatePointer(event.clientX, event.clientY);
    mouse.down = true;
    if (event.button === 0) actions |= ACTION_CLICK;
    else if (event.button === 2) actions |= ACTION_SPECIAL;
    event.preventDefault();
  });

  window.addEventListener('pointerup', () => {
    mouse.down = false;
  });

  window.addEventListener('pointercancel', () => {
    mouse.down = false;
  });

  canvas.addEventListener('pointerleave', () => {
    if (!mouse.down) mouse.active = false;
  });

  canvas.addEventListener('contextmenu', (event) => {
    event.preventDefault();
  });

  return {
    /** -1, 0 or 1 for each axis, normalised so diagonals are not faster. */
    getMovement() {
      const x = (held.has('ArrowRight') || held.has('KeyD') ? 1 : 0)
        - (held.has('ArrowLeft') || held.has('KeyA') ? 1 : 0);
      const y = (held.has('ArrowDown') || held.has('KeyS') ? 1 : 0)
        - (held.has('ArrowUp') || held.has('KeyW') ? 1 : 0);
      const length = Math.hypot(x, y);
      if (length > 1) return { dx: x / length, dy: y / length };
      return { dx: x, dy: y };
    },
    /** The pointer in playfield coordinates, plus whether it is currently steering. */
    getMouse() {
      return mouse;
    },
    /** Stop steering toward the last click (used when a menu click starts a wave). */
    releasePointer() {
      mouse.active = false;
      mouse.down = false;
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
