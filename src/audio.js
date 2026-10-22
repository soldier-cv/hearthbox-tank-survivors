/* 全部声音都是 WebAudio 现场合成，没有外部资源。
   目的：射击/爆炸有实体感，音乐只当低音量的底噪，不抢游戏音效。 */
(function (TS) {
  'use strict';

  var AudioSys = {
    ctx: null,
    master: null,
    sfxBus: null,
    musicBus: null,
    muted: false,
    unlocked: false,
    musicOn: false,
    _last: {},
    _seq: null,

    init: function () {
      // 真正的 AudioContext 等到第一次用户交互再建，避免被自动播放策略挂起
    },

    ensure: function () {
      if (this.ctx) return this.ctx;
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      var ctx = new AC();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.62;
      this.master.connect(ctx.destination);

      this.sfxBus = ctx.createGain();
      this.sfxBus.gain.value = 0.9;
      this.sfxBus.connect(this.master);

      this.musicBus = ctx.createGain();
      this.musicBus.gain.value = 0.28;
      this.musicBus.connect(this.master);

      this._seq = {
        next: ctx.currentTime + 0.1,
        step: 0,
        tempo: 134
      };
      return ctx;
    },

    unlock: function () {
      var ctx = this.ensure();
      if (!ctx) return;
      if (ctx.state === 'suspended') ctx.resume();
      this.unlocked = true;
      var boot = document.getElementById('bootHint');
      if (boot) boot.classList.add('is-off');
    },

    setMuted: function (m) {
      this.muted = !!m;
      if (this.master && this.ctx) {
        this.master.gain.setTargetAtTime(this.muted ? 0 : 0.62, this.ctx.currentTime, 0.02);
      }
      TS.util.store.set('tank-survivors.muted', this.muted);
    },

    toggleMute: function () {
      this.setMuted(!this.muted);
      return this.muted;
    },

    setMusic: function (on) {
      this.musicOn = !!on;
      if (on) this.ensure();
    },

    // ---------- 基础发声 ----------

    _now: function () { return this.ctx ? this.ctx.currentTime : 0; },

    _noiseBuffer: function () {
      if (this._noiseBuf) return this._noiseBuf;
      var ctx = this.ctx;
      var len = Math.floor(ctx.sampleRate * 1.2);
      var buf = ctx.createBuffer(1, len, ctx.sampleRate);
      var data = buf.getChannelData(0);
      for (var i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this._noiseBuf = buf;
      return buf;
    },

    _env: function (node, t0, attack, decay, peak) {
      var g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(peak, t0 + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
      node.connect(g);
      g.connect(this.sfxBus);
      return g;
    },

    _osc: function (type, f0, f1, t0, dur, peak, attack) {
      var ctx = this.ctx;
      var o = ctx.createOscillator();
      var g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f0, t0);
      if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
      var a = attack == null ? 0.004 : attack;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(peak, t0 + a);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g);
      g.connect(this.sfxBus);
      o.start(t0);
      o.stop(t0 + dur + 0.02);
    },

    _noise: function (t0, dur, peak, filterType, f0, f1, q) {
      var ctx = this.ctx;
      var src = ctx.createBufferSource();
      src.buffer = this._noiseBuffer();
      var flt = ctx.createBiquadFilter();
      flt.type = filterType || 'lowpass';
      flt.frequency.setValueAtTime(f0, t0);
      if (f1) flt.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
      flt.Q.value = q == null ? 0.8 : q;
      var g = ctx.createGain();
      g.gain.setValueAtTime(peak, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(flt);
      flt.connect(g);
      g.connect(this.sfxBus);
      src.start(t0);
      src.stop(t0 + dur + 0.02);
    },

    // ---------- 音效 ----------

    sfx: function (name, opt) {
      if (!this.ctx || this.muted) return;
      var t = this.ctx.currentTime;
      var now = performance.now();
      var key = name;
      // 同名音效 30ms 内只发一次，避免密集射击把音量堆爆
      if (this._last[key] && now - this._last[key] < 30) return;
      this._last[key] = now;

      switch (name) {
        case 'shoot':
          this._osc('square', 620 + (Math.random() * 80 - 40), 190, t, 0.075, 0.05);
          this._noise(t, 0.045, 0.035, 'highpass', 2400, 1600, 0.7);
          break;
        case 'shootHeavy':
          this._osc('sawtooth', 240, 70, t, 0.13, 0.075);
          this._noise(t, 0.08, 0.05, 'lowpass', 1600, 400, 0.7);
          break;
        case 'hit':
          this._noise(t, 0.035, 0.045, 'bandpass', 2100, 1500, 1.4);
          this._osc('square', 420, 260, t, 0.03, 0.02);
          break;
        case 'brick':
          this._noise(t, 0.09, 0.05, 'bandpass', 900, 420, 0.9);
          break;
        case 'explode':
          this._noise(t, 0.34, 0.16, 'lowpass', 1400, 90, 0.6);
          this._osc('sine', 120, 42, t, 0.28, 0.09);
          break;
        case 'bigExplode':
          this._noise(t, 0.85, 0.28, 'lowpass', 900, 60, 0.5);
          this._osc('sine', 90, 30, t, 0.7, 0.22);
          this._osc('sawtooth', 160, 40, t, 0.4, 0.07);
          break;
        case 'pickup':
          this._osc('sine', 880, 1320, t, 0.07, 0.045);
          break;
        case 'heart':
          this._osc('triangle', 520, 780, t, 0.1, 0.06);
          this._osc('triangle', 780, 1040, t + 0.07, 0.12, 0.05);
          break;
        case 'bomb':
          this._osc('sawtooth', 220, 30, t, 0.5, 0.1);
          this._noise(t, 0.7, 0.2, 'lowpass', 1200, 70, 0.5);
          break;
        case 'dash':
          this._noise(t, 0.18, 0.07, 'bandpass', 400, 2200, 1.2);
          break;
        case 'hurt':
          this._osc('sawtooth', 200, 70, t, 0.18, 0.09);
          this._noise(t, 0.12, 0.05, 'lowpass', 800, 200, 0.8);
          break;
        case 'levelup':
          [440, 554, 659, 880].forEach(function (f, i) {
            this._osc('triangle', f, f * 1.01, t + i * 0.075, 0.16, 0.055);
          }, this);
          break;
        case 'revive':
          [330, 440, 660].forEach(function (f, i) {
            this._osc('sine', f, f, t + i * 0.1, 0.24, 0.05);
          }, this);
          break;
        case 'boss':
          this._osc('sawtooth', 70, 46, t, 1.1, 0.14, 0.05);
          this._osc('square', 104, 69, t, 0.9, 0.05, 0.1);
          break;
        case 'ui':
          this._osc('square', 520, 660, t, 0.035, 0.028);
          break;
        case 'deny':
          this._osc('square', 220, 160, t, 0.11, 0.05);
          break;
        case 'win':
          [523, 659, 784, 1046].forEach(function (f, i) {
            this._osc('triangle', f, f, t + i * 0.13, 0.4, 0.06);
          }, this);
          break;
        case 'lose':
          [330, 277, 220].forEach(function (f, i) {
            this._osc('triangle', f, f * 0.99, t + i * 0.2, 0.5, 0.06);
          }, this);
          break;
      }
    },

    // 远处爆炸的音量衰减由调用方用 dist 决定（这里只做一个简单的音量参数）
    sfxAt: function (name, volume) {
      if (volume != null && volume < 0.06) return;
      this.sfx(name);
    },

    // ---------- 音乐 ----------

    // A 小调，4 小节循环。数字是 MIDI，0 表示休止。
    MUSIC: {
      bass: [45, 0, 45, 0, 48, 0, 45, 0, 43, 0, 43, 0, 41, 0, 43, 0,
             45, 0, 45, 0, 48, 0, 50, 0, 52, 0, 48, 0, 45, 0, 43, 0],
      lead: [69, 0, 0, 76, 0, 72, 0, 0, 67, 0, 0, 72, 0, 76, 0, 0,
             69, 0, 0, 76, 0, 79, 0, 0, 72, 0, 74, 0, 72, 0, 67, 0]
    },

    update: function (dt, intensity) {
      if (!this.ctx || !this.musicOn || this.muted) return;
      if (this.ctx.state !== 'running') return;
      var seq = this._seq;
      var stepDur = 60 / seq.tempo / 4;
      var horizon = this.ctx.currentTime + 0.18;
      var guard = 0;
      while (seq.next < horizon && guard++ < 16) {
        this._scheduleStep(seq.step, seq.next, intensity || 0);
        seq.next += stepDur;
        seq.step = (seq.step + 1) % 32;
      }
    },

    _midi: function (n) { return 440 * Math.pow(2, (n - 69) / 12); },

    _scheduleStep: function (step, t, intensity) {
      var ctx = this.ctx;
      var bass = this.MUSIC.bass[step];
      var lead = this.MUSIC.lead[step];
      var bus = this.musicBus;

      if (bass) {
        var o = ctx.createOscillator();
        var g = ctx.createGain();
        var f = ctx.createBiquadFilter();
        o.type = 'sawtooth';
        o.frequency.value = this._midi(bass);
        f.type = 'lowpass';
        f.frequency.setValueAtTime(260 + intensity * 240, t);
        f.Q.value = 3.5;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.22, t + 0.008);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
        o.connect(f); f.connect(g); g.connect(bus);
        o.start(t); o.stop(t + 0.22);
      }

      if (step % 2 === 1) {
        var s = ctx.createBufferSource();
        s.buffer = this._noiseBuffer();
        var hf = ctx.createBiquadFilter();
        hf.type = 'highpass';
        hf.frequency.value = 7000;
        var hg = ctx.createGain();
        hg.gain.setValueAtTime(0.035, t);
        hg.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);
        s.connect(hf); hf.connect(hg); hg.connect(bus);
        s.start(t); s.stop(t + 0.04);
      }

      if (lead && intensity > 0.18) {
        var lo = ctx.createOscillator();
        var lg = ctx.createGain();
        lo.type = 'triangle';
        lo.frequency.value = this._midi(lead);
        lg.gain.setValueAtTime(0.0001, t);
        lg.gain.linearRampToValueAtTime(0.075 * Math.min(1, intensity), t + 0.01);
        lg.gain.exponentialRampToValueAtTime(0.0001, t + 0.19);
        lo.connect(lg); lg.connect(bus);
        lo.start(t); lo.stop(t + 0.2);
      }

      if (step % 8 === 0) {
        var k = ctx.createOscillator();
        var kg = ctx.createGain();
        k.type = 'sine';
        k.frequency.setValueAtTime(110, t);
        k.frequency.exponentialRampToValueAtTime(40, t + 0.13);
        kg.gain.setValueAtTime(0.16, t);
        kg.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
        k.connect(kg); kg.connect(bus);
        k.start(t); k.stop(t + 0.17);
      }
    }
  };

  try {
    var pref = TS.util.store.get('tank-survivors.muted', false);
    AudioSys.muted = !!pref;
  } catch (e) { /* ignore */ }

  TS.Audio = AudioSys;
})(window.TS = window.TS || {});
