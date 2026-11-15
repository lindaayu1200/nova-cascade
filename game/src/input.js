// Keyboard and Mouse input listener for Nova Cascade.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_SPECIAL = 4;
export const ACTION_BUY_1 = 8;
export const ACTION_BUY_2 = 16;
export const ACTION_BUY_3 = 32;

const KEY_UP = new Set(['KeyW', 'ArrowUp']);
const KEY_DOWN = new Set(['KeyS', 'ArrowDown']);
const KEY_LEFT = new Set(['KeyA', 'ArrowLeft']);
const KEY_RIGHT = new Set(['KeyD', 'ArrowRight']);

export function createInput(canvas) {
  let up = false;
  let down = false;
  let left = false;
  let right = false;

  let actions = 0;
  
  const mouse = {
    x: 640,
    y: 360,
    active: false,
    down: false,
  };

  // Convert canvas pixel position to 1280x720 playfield logical position
  function updateMousePos(clientX, clientY) {
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scale = Math.min(rect.width / 1280, rect.height / 720);
    const offsetX = (rect.width - 1280 * scale) / 2;
    const offsetY = (rect.height - 720 * scale) / 2;

    const px = (clientX - rect.left - offsetX) / scale;
    const py = (clientY - rect.top - offsetY) / scale;

    mouse.x = Math.max(0, Math.min(1280, px));
    mouse.y = Math.max(0, Math.min(720, py));
    mouse.active = true;
  }

  window.addEventListener('keydown', (event) => {
    if (KEY_UP.has(event.code)) up = true;
    else if (KEY_DOWN.has(event.code)) down = true;
    else if (KEY_LEFT.has(event.code)) left = true;
    else if (KEY_RIGHT.has(event.code)) right = true;
    else if (event.code === 'Space') {
      if (!event.repeat) {
        actions |= ACTION_SPECIAL | ACTION_CONFIRM;
      }
    } else if (event.code === 'Enter') {
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (event.code === 'KeyP' || event.code === 'Escape') {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (event.code === 'Digit1' || event.code === 'Numpad1') {
      if (!event.repeat) actions |= ACTION_BUY_1;
    } else if (event.code === 'Digit2' || event.code === 'Numpad2') {
      if (!event.repeat) actions |= ACTION_BUY_2;
    } else if (event.code === 'Digit3' || event.code === 'Numpad3') {
      if (!event.repeat) actions |= ACTION_BUY_3;
    } else return;

    // Prevent default scrolling for game controls
    if (event.code !== 'F12' && event.code !== 'F5' && event.code !== 'KeyR') {
      event.preventDefault();
    }
  });

  window.addEventListener('keyup', (event) => {
    if (KEY_UP.has(event.code)) up = false;
    else if (KEY_DOWN.has(event.code)) down = false;
    else if (KEY_LEFT.has(event.code)) left = false;
    else if (KEY_RIGHT.has(event.code)) right = false;
  });

  window.addEventListener('blur', () => {
    up = false;
    down = false;
    left = false;
    right = false;
    mouse.down = false;
  });

  if (canvas) {
    canvas.addEventListener('pointermove', (event) => {
      updateMousePos(event.clientX, event.clientY);
    });

    canvas.addEventListener('pointerdown', (event) => {
      updateMousePos(event.clientX, event.clientY);
      mouse.down = true;
      if (event.button === 2) {
        actions |= ACTION_SPECIAL;
      } else {
        actions |= ACTION_CONFIRM;
      }
    });

    canvas.addEventListener('pointerup', () => {
      mouse.down = false;
    });

    canvas.addEventListener('contextmenu', (event) => {
      event.preventDefault();
    });
  }

  return {
    getMovement() {
      let dx = (right ? 1 : 0) - (left ? 1 : 0);
      let dy = (down ? 1 : 0) - (up ? 1 : 0);
      const len = Math.hypot(dx, dy);
      if (len > 0) {
        dx /= len;
        dy /= len;
      }
      return { dx, dy };
    },
    getMouse() {
      return { x: mouse.x, y: mouse.y, active: mouse.active, down: mouse.down };
    },
    takeActions() {
      const result = actions;
      actions = 0;
      return result;
    },
  };
}
