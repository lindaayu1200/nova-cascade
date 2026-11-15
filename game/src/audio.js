// Pure WebAudio synthesizer sound generator for Nova Cascade.

export function createAudioSystem() {
  let ctx = null;

  function initContext() {
    if (ctx) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        ctx = new AudioCtx();
      }
    } catch {
      ctx = null;
    }
  }

  function resume() {
    initContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
  }

  function createNoiseBuffer(duration = 0.5) {
    if (!ctx) return null;
    const sampleRate = ctx.sampleRate;
    const bufferSize = sampleRate * duration;
    const buffer = ctx.createBuffer(1, bufferSize, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  return {
    resume,

    playLaser() {
      try {
        resume();
        if (!ctx) return;
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.exponentialRampToValueAtTime(110, now + 0.1);

        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now);
        osc.stop(now + 0.1);
      } catch {
        // Safe fallback
      }
    },

    playExplosion(scale = 1.0) {
      try {
        resume();
        if (!ctx) return;
        const duration = Math.min(0.8, 0.25 * scale);
        const now = ctx.currentTime;
        const noise = ctx.createBufferSource();
        const buffer = createNoiseBuffer(duration);
        if (!buffer) return;
        noise.buffer = buffer;

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(600, now);
        filter.frequency.exponentialRampToValueAtTime(60, now + duration);

        const gain = ctx.createGain();
        const volume = Math.min(0.35, 0.15 * scale);
        gain.gain.setValueAtTime(volume, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);

        noise.start(now);
        noise.stop(now + duration);
      } catch {
        // Safe fallback
      }
    },

    playCrystal() {
      try {
        resume();
        if (!ctx) return;
        const now = ctx.currentTime;
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();

        osc1.type = 'sine';
        osc2.type = 'sine';

        osc1.frequency.setValueAtTime(1046.5, now); // C6
        osc1.frequency.setValueAtTime(1318.5, now + 0.06); // E6
        osc2.frequency.setValueAtTime(1567.98, now + 0.06); // G6

        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);

        osc1.start(now);
        osc2.start(now + 0.06);
        osc1.stop(now + 0.18);
        osc2.stop(now + 0.18);
      } catch {
        // Safe fallback
      }
    },

    playHit() {
      try {
        resume();
        if (!ctx) return;
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(160, now);
        osc.frequency.linearRampToValueAtTime(40, now + 0.15);

        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now);
        osc.stop(now + 0.15);
      } catch {
        // Safe fallback
      }
    },

    playNova() {
      try {
        resume();
        if (!ctx) return;
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(120, now);
        osc.frequency.exponentialRampToValueAtTime(440, now + 0.2);
        osc.frequency.exponentialRampToValueAtTime(50, now + 0.6);

        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now);
        osc.stop(now + 0.6);
      } catch {
        // Safe fallback
      }
    },

    playUpgrade() {
      try {
        resume();
        if (!ctx) return;
        const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
        const now = ctx.currentTime;

        notes.forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          const startTime = now + idx * 0.05;

          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, startTime);

          gain.gain.setValueAtTime(0.12, startTime);
          gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.15);

          osc.connect(gain);
          gain.connect(ctx.destination);

          osc.start(startTime);
          osc.stop(startTime + 0.15);
        });
      } catch {
        // Safe fallback
      }
    },

    playBossWarning() {
      try {
        resume();
        if (!ctx) return;
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.setValueAtTime(175, now + 0.15);
        osc.frequency.setValueAtTime(220, now + 0.3);

        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now);
        osc.stop(now + 0.45);
      } catch {
        // Safe fallback
      }
    },
  };
}
