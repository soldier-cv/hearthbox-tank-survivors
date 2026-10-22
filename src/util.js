/* 基础工具：数学、随机、格式化。经典脚本，挂在 window.TS 上。 */
(function (TS) {
  'use strict';

  var TAU = Math.PI * 2;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function invLerp(a, b, v) { return clamp((v - a) / (b - a), 0, 1); }

  // 与帧率无关的指数趋近
  function damp(a, b, lambda, dt) { return lerp(a, b, 1 - Math.exp(-lambda * dt)); }

  function angleDiff(a, b) {
    var d = (b - a) % TAU;
    if (d > Math.PI) d -= TAU;
    if (d < -Math.PI) d += TAU;
    return d;
  }

  function angleLerp(a, b, t) { return a + angleDiff(a, b) * t; }

  function dist2(ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay;
    return dx * dx + dy * dy;
  }

  function dist(ax, ay, bx, by) { return Math.sqrt(dist2(ax, ay, bx, by)); }

  function norm(x, y) {
    var m = Math.hypot(x, y);
    if (m < 0.00001) return { x: 0, y: 0, m: 0 };
    return { x: x / m, y: y / m, m: m };
  }

  function formatTime(seconds) {
    var s = Math.max(0, Math.floor(seconds));
    var m = Math.floor(s / 60);
    s = s % 60;
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }

  function formatScore(n) {
    n = Math.floor(n);
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  // mulberry32：小、快、够用；每局用时间戳做种，局局地图不同。
  function RNG(seed) {
    this.s = (seed >>> 0) || 0x9e3779b9;
  }
  RNG.prototype.next = function () {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    var t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  RNG.prototype.range = function (a, b) { return a + (b - a) * this.next(); };
  RNG.prototype.int = function (a, b) { return Math.floor(this.range(a, b + 1)); };
  RNG.prototype.chance = function (p) { return this.next() < p; };
  RNG.prototype.pick = function (arr) { return arr[Math.floor(this.next() * arr.length)]; };
  RNG.prototype.sign = function () { return this.next() < 0.5 ? -1 : 1; };

  function shuffle(rng, arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rng.next() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  function weightedPick(rng, items, weightOf) {
    var total = 0, i;
    for (i = 0; i < items.length; i++) total += Math.max(0, weightOf(items[i]));
    if (total <= 0) return items[0] || null;
    var r = rng.next() * total;
    for (i = 0; i < items.length; i++) {
      r -= Math.max(0, weightOf(items[i]));
      if (r <= 0) return items[i];
    }
    return items[items.length - 1];
  }

  var store = {
    get: function (key, fallback) {
      try {
        var raw = window.localStorage.getItem(key);
        if (raw == null) return fallback;
        return JSON.parse(raw);
      } catch (e) { return fallback; }
    },
    set: function (key, value) {
      try { window.localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* 隐私模式忽略 */ }
    }
  };

  // 圆形与轴对齐矩形：返回推开向量，没有交叠时返回 null
  function circleRect(cx, cy, r, rx, ry, rw, rh) {
    var nx = clamp(cx, rx, rx + rw);
    var ny = clamp(cy, ry, ry + rh);
    var dx = cx - nx, dy = cy - ny;
    var d2 = dx * dx + dy * dy;
    if (d2 >= r * r) return null;
    var d = Math.sqrt(d2);
    if (d < 0.00001) {
      // 圆心在矩形内：沿最近的边推出
      var left = cx - rx, right = rx + rw - cx, top = cy - ry, bottom = ry + rh - cy;
      var m = Math.min(left, right, top, bottom);
      if (m === left) return { x: -1, y: 0, depth: left + r };
      if (m === right) return { x: 1, y: 0, depth: right + r };
      if (m === top) return { x: 0, y: -1, depth: top + r };
      return { x: 0, y: 1, depth: bottom + r };
    }
    return { x: dx / d, y: dy / d, depth: r - d };
  }

  function pointInRect(px, py, rx, ry, rw, rh) {
    return px >= rx && px <= rx + rw && py >= ry && py <= ry + rh;
  }

  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
  function easeInOutCubic(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

  function roman(n) {
    var map = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
    var out = '';
    for (var i = 0; i < map.length; i++) {
      while (n >= map[i][0]) { out += map[i][1]; n -= map[i][0]; }
    }
    return out;
  }

  TS.util = {
    TAU: TAU,
    clamp: clamp,
    lerp: lerp,
    invLerp: invLerp,
    damp: damp,
    angleDiff: angleDiff,
    angleLerp: angleLerp,
    dist: dist,
    dist2: dist2,
    norm: norm,
    formatTime: formatTime,
    formatScore: formatScore,
    RNG: RNG,
    shuffle: shuffle,
    weightedPick: weightedPick,
    store: store,
    circleRect: circleRect,
    pointInRect: pointInRect,
    easeOutCubic: easeOutCubic,
    easeInOutCubic: easeInOutCubic,
    roman: roman
  };
})(window.TS = window.TS || {});
