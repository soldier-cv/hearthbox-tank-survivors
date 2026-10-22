/**
 * 音频（docs/port.md 第 4 步）。
 *
 * 只用平台给的 ctx.audio：
 *   - 接 ctx.audio.sfx / music，绝不接 destination
 *   - 不自己 new AudioContext
 *   - 平台在 pause/失焦/退出时自动挂起，这里不处理
 *
 * 所有音效运行时合成，零音频文件（docs/art.md：本作不使用任何外部素材）。
 */

import type { AudioApi } from '@hearthbox/sdk';

export type SfxId =
  | 'ui'
  | 'shoot'
  | 'shootHeavy'
  | 'hit'
  | 'crit'
  | 'enemyDie'
  | 'bossDie'
  | 'blast'
  | 'mine'
  | 'tesla'
  | 'hurt'
  | 'dash'
  | 'bomb'
  | 'pickup'
  | 'levelup'
  | 'shieldBreak'
  | 'shieldHit'
  | 'rail'
  | 'nova'
  | 'bossPhase'
  | 'win'
  | 'lose'
  | 'brick'
  | 'evolve'
  | 'deny';

interface Voice {
  /** 起始频率。 */
  f0: number;
  /** 结束频率（滑音）。 */
  f1: number;
  type: OscillatorType;
  /** 时长（秒）。 */
  dur: number;
  /** 峰值增益。 */
  gain: number;
  /** 噪声而非振荡器。 */
  noise?: boolean;
  /** 滤波截止（噪声用）。 */
  cutoff?: number;
}

const VOICES: Record<SfxId, Voice> = {
  ui: { f0: 660, f1: 880, type: 'square', dur: 0.06, gain: 0.1 },
  shoot: { f0: 320, f1: 120, type: 'square', dur: 0.08, gain: 0.13 },
  shootHeavy: { f0: 180, f1: 60, type: 'sawtooth', dur: 0.14, gain: 0.17 },
  hit: { f0: 520, f1: 240, type: 'triangle', dur: 0.05, gain: 0.09 },
  crit: { f0: 900, f1: 300, type: 'square', dur: 0.09, gain: 0.14 },
  enemyDie: { f0: 240, f1: 40, type: 'sawtooth', dur: 0.22, gain: 0.14, noise: true, cutoff: 900 },
  bossDie: { f0: 160, f1: 30, type: 'sawtooth', dur: 1.1, gain: 0.28, noise: true, cutoff: 700 },
  blast: { f0: 120, f1: 40, type: 'sine', dur: 0.34, gain: 0.24, noise: true, cutoff: 1400 },
  mine: { f0: 200, f1: 50, type: 'square', dur: 0.18, gain: 0.16, noise: true, cutoff: 1100 },
  tesla: { f0: 1400, f1: 600, type: 'sawtooth', dur: 0.12, gain: 0.11 },
  hurt: { f0: 300, f1: 90, type: 'sawtooth', dur: 0.2, gain: 0.2, noise: true, cutoff: 600 },
  dash: { f0: 700, f1: 220, type: 'sine', dur: 0.16, gain: 0.12 },
  bomb: { f0: 90, f1: 30, type: 'sine', dur: 0.6, gain: 0.3, noise: true, cutoff: 1600 },
  pickup: { f0: 880, f1: 1320, type: 'triangle', dur: 0.07, gain: 0.09 },
  levelup: { f0: 520, f1: 1040, type: 'square', dur: 0.3, gain: 0.16 },
  shieldBreak: { f0: 1200, f1: 400, type: 'sawtooth', dur: 0.18, gain: 0.15 },
  shieldHit: { f0: 1500, f1: 900, type: 'sine', dur: 0.08, gain: 0.1 },
  rail: { f0: 2000, f1: 200, type: 'sawtooth', dur: 0.4, gain: 0.22 },
  nova: { f0: 80, f1: 600, type: 'sine', dur: 0.5, gain: 0.26, noise: true, cutoff: 2000 },
  bossPhase: { f0: 120, f1: 300, type: 'sawtooth', dur: 0.5, gain: 0.22 },
  win: { f0: 660, f1: 1320, type: 'square', dur: 0.7, gain: 0.2 },
  lose: { f0: 300, f1: 70, type: 'sawtooth', dur: 0.8, gain: 0.2 },
  brick: { f0: 400, f1: 160, type: 'triangle', dur: 0.06, gain: 0.07, noise: true, cutoff: 2400 },
  evolve: { f0: 440, f1: 1760, type: 'sine', dur: 0.6, gain: 0.2 },
  deny: { f0: 200, f1: 140, type: 'square', dur: 0.12, gain: 0.12 },
};

export class Audio {
  /** 复用的白噪声缓冲，避免每次爆炸都新建。 */
  private noiseBuf: AudioBuffer | null = null;
  private musicNodes: { osc: OscillatorNode; gain: GainNode }[] = [];
  private musicOn = false;
  private lastPlay = new Map<SfxId, number>();

  constructor(private readonly api: AudioApi) {}

  /**
   * 播一个音效。
   *
   * 同一音效 25ms 内不重复播放 —— 否则人海战里几十次命中会把音量堆爆。
   */
  sfx(id: SfxId, detune = 0, gainScale = 1): void {
    const ctx = this.api.ctx;
    const now = ctx.currentTime;
    const prev = this.lastPlay.get(id) ?? -1;
    if (now - prev < 0.025) return;
    this.lastPlay.set(id, now);

    const v = VOICES[id];
    const t0 = now;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, v.gain * gainScale), t0 + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + v.dur);
    gain.connect(this.api.sfx);

    if (v.noise) {
      const src = ctx.createBufferSource();
      const buf = this.noiseBuffer();
      src.buffer = buf;
      src.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(v.cutoff ?? 1200, t0);
      filter.frequency.exponentialRampToValueAtTime(Math.max(80, (v.cutoff ?? 1200) * 0.25), t0 + v.dur);
      src.connect(filter);
      filter.connect(gain);
      src.start(t0);
      src.stop(t0 + v.dur + 0.02);
    } else {
      const osc = ctx.createOscillator();
      osc.type = v.type;
      osc.frequency.setValueAtTime(v.f0, t0);
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, v.f1), t0 + v.dur);
      if (detune) osc.detune.setValueAtTime(detune, t0);
      osc.connect(gain);
      osc.start(t0);
      osc.stop(t0 + v.dur + 0.02);
    }
  }

  /**
   * 循环低音垫（合成，无音频文件）。
   *
   * 三个失谐正弦构成缓慢拍频，够"战场底噪"用，成本远低于真音轨。
   */
  musicStart(): void {
    if (this.musicOn) return;
    const ctx = this.api.ctx;
    this.musicOn = true;
    const base = 55;
    for (let i = 0; i < 3; i += 1) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = i === 0 ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(base * (i === 0 ? 1 : i === 1 ? 1.5 : 2), ctx.currentTime);
      osc.detune.setValueAtTime(i * 6 - 6, ctx.currentTime);
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.05 / (i + 1), ctx.currentTime + 2);
      osc.connect(gain);
      gain.connect(this.api.music);
      osc.start();
      this.musicNodes.push({ osc, gain });
    }
  }

  musicStop(): void {
    if (!this.musicOn) return;
    this.musicOn = false;
    const ctx = this.api.ctx;
    for (const n of this.musicNodes) {
      n.gain.gain.cancelScheduledValues(ctx.currentTime);
      n.gain.gain.setValueAtTime(n.gain.gain.value, ctx.currentTime);
      n.gain.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
      n.osc.stop(ctx.currentTime + 0.45);
    }
    this.musicNodes = [];
  }

  get playing(): boolean {
    return this.musicOn;
  }

  private noiseBuffer(): AudioBuffer {
    if (this.noiseBuf) return this.noiseBuf;
    const ctx = this.api.ctx;
    const len = Math.floor(ctx.sampleRate * 0.5);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    // 确定性填充：用平台随机流会影响可复现性，这里用固定的伪随机
    let s = 0x2f6e2b1;
    for (let i = 0; i < len; i += 1) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      data[i] = (s / 0x7fffffff) * 2 - 1;
    }
    this.noiseBuf = buf;
    return buf;
  }

  /** 会话结束：平台会挂起 AudioContext，但音乐节点要自己停掉。 */
  dispose(): void {
    this.musicStop();
  }
}
