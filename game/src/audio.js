// All of Nova Cascade's sound is synthesised here with the WebAudio API: no files, no network and
// no samples. The context is created lazily on the first user gesture so browsers do not block it.
// Every sound is wrapped in a try/catch: audio is decoration, and the game must run without it.

export function createAudioSystem() {
  let ctx = null;
  let master = null;
  let noiseBuffer = null;
  let lastLaser = -1;

  function ensure() {
    if (ctx) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      ctx = new AudioCtx();
      master = ctx.createGain();
      master.gain.value = 0.32;
      master.connect(ctx.destination);
    } catch {
      ctx = null;
      master = null;
    }
  }

  function resume() {
    ensure();
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
  }

  function tone(type, from, to, duration, volume, delay = 0, attack = 0.006) {
    if (!ctx) return;
    const start = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(1, from), start);
    if (to !== from) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), start + duration);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(volume, start + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }

  function noise(duration, filterFrom, filterTo, volume, delay = 0) {
    if (!ctx) return;
    if (!noiseBuffer) {
      const length = Math.floor(ctx.sampleRate * 0.8);
      noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      let last = 0;
      for (let index = 0; index < length; index += 1) {
        last = last * 0.35 + (Math.random() * 2 - 1) * 0.65;
        data[index] = last;
      }
    }
    const start = ctx.currentTime + delay;
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(Math.max(20, filterFrom), start);
    filter.frequency.exponentialRampToValueAtTime(Math.max(20, filterTo), start + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(start);
    source.stop(start + duration + 0.02);
  }

  return {
    resume,

    playLaser() {
      if (!ctx) return;
      const now = ctx.currentTime;
      if (now - lastLaser < 0.045) return;
      lastLaser = now;
      tone('square', 1320, 280, 0.075, 0.055);
      tone('sine', 2100, 640, 0.045, 0.035);
    },

    playExplosion(scale = 1) {
      noise(Math.min(0.65, 0.22 + 0.12 * scale), 780, 55, 0.18, 0);
      tone('sawtooth', 120 * scale, 32, 0.28, 0.1);
    },

    playCrystal() {
      tone('sine', 1318.5, 1318.5, 0.09, 0.11);
      tone('sine', 1760, 1760, 0.12, 0.09, 0.055);
      tone('triangle', 2637, 2637, 0.1, 0.045, 0.1);
    },

    playHit() {
      noise(0.3, 520, 40, 0.24);
      tone('sawtooth', 190, 38, 0.22, 0.16);
    },

    playNova() {
      tone('sine', 90, 520, 0.28, 0.2);
      tone('sine', 320, 58, 0.7, 0.18, 0.08);
      noise(0.55, 1400, 80, 0.2, 0.02);
      tone('triangle', 660, 220, 0.4, 0.08, 0.12);
    },

    playUpgrade() {
      const notes = [523.25, 659.25, 783.99, 1046.5];
      for (let index = 0; index < notes.length; index += 1) {
        tone('triangle', notes[index], notes[index], 0.16, 0.1, index * 0.055);
      }
    },

    playBossWarning() {
      for (let index = 0; index < 3; index += 1) {
        tone('sawtooth', 220, 220, 0.13, 0.14, index * 0.2);
        tone('sawtooth', 165, 165, 0.13, 0.11, index * 0.2 + 0.09);
      }
    },

    playWaveClear() {
      const notes = [392, 523.25, 659.25, 783.99];
      for (let index = 0; index < notes.length; index += 1) {
        tone('sine', notes[index], notes[index], 0.22, 0.09, index * 0.07);
      }
    },

    playVictory() {
      const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5, 1567.98];
      for (let index = 0; index < notes.length; index += 1) {
        tone('triangle', notes[index], notes[index], 0.34, 0.11, index * 0.13);
      }
      tone('sine', 261.63, 523.25, 1.5, 0.08, 0.1);
    },

    playGameOver() {
      const notes = [440, 349.23, 293.66, 220, 146.83];
      for (let index = 0; index < notes.length; index += 1) {
        tone('sawtooth', notes[index], notes[index] * 0.98, 0.32, 0.09, index * 0.19);
      }
      noise(0.8, 420, 40, 0.15, 0.25);
    },
  };
}
