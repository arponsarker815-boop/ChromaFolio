import { PageTurnSoundStyle } from '../types/ebook';

export type AmbientSoundType = 'off' | 'rain' | 'hearth' | 'drone';

class AmbientSoundscapeEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private stopNodes: Array<() => void> = [];
  private activeType: AmbientSoundType = 'off';

  public start(type: AmbientSoundType, volume = 0.25) {
    this.stop();
    this.activeType = type;
    if (type === 'off') return;

    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    if (!this.ctx) {
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }

    const ctx = this.ctx;
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.001, ctx.currentTime);
    master.gain.exponentialRampToValueAtTime(Math.max(0.01, volume * 0.45), ctx.currentTime + 0.8);
    master.connect(ctx.destination);
    this.masterGain = master;

    if (type === 'rain' || type === 'hearth') {
      const bufferSize = ctx.sampleRate * 3;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      let lastOut = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        // Pink/Brownian filtered noise
        data[i] = (lastOut + 0.04 * white) / 1.04;
        lastOut = data[i];
        data[i] *= type === 'rain' ? 2.4 : 3.2;
      }

      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      noise.loop = true;

      const filter = ctx.createBiquadFilter();
      filter.type = type === 'rain' ? 'bandpass' : 'lowpass';
      filter.frequency.value = type === 'rain' ? 1100 : 320;
      filter.Q.value = type === 'rain' ? 0.6 : 0.9;

      noise.connect(filter);
      filter.connect(master);
      noise.start();
      this.stopNodes.push(() => {
        try {
          noise.stop();
          noise.disconnect();
        } catch {
          // ignore
        }
      });
    } else if (type === 'drone') {
      const freqs = [130.81, 196.0, 261.63]; // Warm C3-G3-C4 chord
      freqs.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const oscGain = ctx.createGain();
        osc.type = i === 1 ? 'triangle' : 'sine';
        osc.frequency.value = freq;
        oscGain.gain.value = 0.09 / (i + 1);
        osc.connect(oscGain);
        oscGain.connect(master);
        osc.start();
        this.stopNodes.push(() => {
          try {
            osc.stop();
            osc.disconnect();
          } catch {
            // ignore
          }
        });
      });
    }
  }

  public setVolume(volume: number) {
    if (this.masterGain && this.ctx && this.activeType !== 'off') {
      this.masterGain.gain.setTargetAtTime(Math.max(0.005, volume * 0.45), this.ctx.currentTime, 0.1);
    }
  }

  public stop() {
    this.stopNodes.forEach((fn) => fn());
    this.stopNodes = [];
    if (this.masterGain) {
      try {
        this.masterGain.disconnect();
      } catch {
        // ignore
      }
      this.masterGain = null;
    }
    this.activeType = 'off';
  }

  public playTimerChime() {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    if (!this.ctx) {
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    const ctx = this.ctx;
    const notes = [523.25, 659.25, 783.99]; // C5 - E5 - G5 chime
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const start = ctx.currentTime + idx * 0.16;
      gain.gain.setValueAtTime(0.001, start);
      gain.gain.exponentialRampToValueAtTime(0.16, start + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.9);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.95);
    });
  }

  public playPageTurnSound(
    style: PageTurnSoundStyle = 'paper',
    direction: 1 | -1 = 1,
    volume = 0.65
  ) {
    if (style === 'off' || volume <= 0.01) return;

    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    if (!this.ctx) {
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }

    const ctx = this.ctx;
    const now = ctx.currentTime;
    const clampedVol = Math.min(1, Math.max(0.05, volume));

    const profiles: Record<
      Exclude<PageTurnSoundStyle, 'off'>,
      {
        duration: number;
        startFreq: number;
        peakFreq: number;
        endFreq: number;
        q: number;
        flutterHz: number;
        flutterDepth: number;
        settleGain: number;
        settleFreq: number;
        gainScale: number;
      }
    > = {
      paper: {
        duration: 0.21,
        startFreq: 950,
        peakFreq: 2650,
        endFreq: 1100,
        q: 1.1,
        flutterHz: 34,
        flutterDepth: 0.25,
        settleGain: 0.11,
        settleFreq: 145,
        gainScale: 0.34,
      },
      soft: {
        duration: 0.18,
        startFreq: 680,
        peakFreq: 1450,
        endFreq: 750,
        q: 0.85,
        flutterHz: 22,
        flutterDepth: 0.14,
        settleGain: 0.05,
        settleFreq: 115,
        gainScale: 0.22,
      },
      hardcover: {
        duration: 0.25,
        startFreq: 720,
        peakFreq: 2150,
        endFreq: 840,
        q: 0.95,
        flutterHz: 28,
        flutterDepth: 0.2,
        settleGain: 0.24,
        settleFreq: 118,
        gainScale: 0.4,
      },
      vintage: {
        duration: 0.24,
        startFreq: 1200,
        peakFreq: 3350,
        endFreq: 1500,
        q: 1.45,
        flutterHz: 46,
        flutterDepth: 0.36,
        settleGain: 0.09,
        settleFreq: 155,
        gainScale: 0.32,
      },
    };

    const cfg = profiles[style];

    // 1. Pre-create textured paper grain noise buffer
    const sampleLen = Math.floor(ctx.sampleRate * (cfg.duration + 0.06));
    const buffer = ctx.createBuffer(1, sampleLen, ctx.sampleRate);
    const channel = buffer.getChannelData(0);
    let pink = 0;
    for (let i = 0; i < sampleLen; i++) {
      const t = i / ctx.sampleRate;
      const white = Math.random() * 2 - 1;
      pink = (pink + 0.18 * white) / 1.18;
      // Subtle paper fiber flutter + crisp micro-crackle
      const flutter = 1 - cfg.flutterDepth * (0.5 + 0.5 * Math.sin(2 * Math.PI * cfg.flutterHz * t));
      const crackle = Math.random() > 0.985 ? white * 1.45 : pink;
      channel[i] = (crackle * 0.65 + white * 0.35) * flutter;
    }

    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = buffer;

    // 2. Bandpass sweep simulating the curved paper sheet moving through air
    const sweepFilter = ctx.createBiquadFilter();
    sweepFilter.type = 'bandpass';
    sweepFilter.Q.value = cfg.q;

    const fStart = direction > 0 ? cfg.startFreq : cfg.endFreq;
    const fEnd = direction > 0 ? cfg.endFreq : cfg.startFreq;
    sweepFilter.frequency.setValueAtTime(fStart, now);
    sweepFilter.frequency.exponentialRampToValueAtTime(cfg.peakFreq, now + cfg.duration * 0.42);
    sweepFilter.frequency.exponentialRampToValueAtTime(fEnd, now + cfg.duration);

    // High-shelf crispness for paper edge snap
    const highShelf = ctx.createBiquadFilter();
    highShelf.type = 'highshelf';
    highShelf.frequency.value = 2400;
    highShelf.gain.value = style === 'soft' ? -4 : style === 'vintage' ? 4.5 : 2;

    // Natural envelope: brief finger-lift transient -> paper whoosh -> smooth settle
    const env = ctx.createGain();
    const peak = clampedVol * cfg.gainScale;
    env.gain.setValueAtTime(0.0008, now);
    env.gain.exponentialRampToValueAtTime(peak * 0.65, now + 0.018);
    env.gain.linearRampToValueAtTime(peak * 0.42, now + 0.045);
    env.gain.exponentialRampToValueAtTime(peak, now + cfg.duration * 0.48);
    env.gain.exponentialRampToValueAtTime(0.0008, now + cfg.duration);

    noiseSrc.connect(sweepFilter);
    sweepFilter.connect(highShelf);
    highShelf.connect(env);
    env.connect(ctx.destination);

    noiseSrc.start(now);
    noiseSrc.stop(now + cfg.duration + 0.02);

    // 3. Soft physical settle thud as page lands against the opposite stack / binding
    const settleTime = now + cfg.duration * 0.72;
    const thudOsc = ctx.createOscillator();
    const thudGain = ctx.createGain();
    thudOsc.type = 'sine';
    thudOsc.frequency.setValueAtTime(cfg.settleFreq, settleTime);
    thudOsc.frequency.exponentialRampToValueAtTime(52, settleTime + 0.075);

    thudGain.gain.setValueAtTime(0.0008, settleTime);
    thudGain.gain.exponentialRampToValueAtTime(clampedVol * cfg.settleGain, settleTime + 0.012);
    thudGain.gain.exponentialRampToValueAtTime(0.0005, settleTime + 0.085);

    thudOsc.connect(thudGain);
    thudGain.connect(ctx.destination);
    thudOsc.start(settleTime);
    thudOsc.stop(settleTime + 0.095);
  }
}

export const ambientAudio = new AmbientSoundscapeEngine();
