/* 战场：砖墙 / 钢墙、地图生成、坦克与子弹的碰撞查询。
   地图每局重生成，但开局中央永远留一块空地。 */
(function (TS) {
  'use strict';

  var EMPTY = 0, BRICK = 1, STEEL = 2;

  function World(seed) {
    this.tile = 40;
    this.cols = 65;
    this.rows = 50;
    this.w = this.cols * this.tile;
    this.h = this.rows * this.tile;
    this.grid = new Uint8Array(this.cols * this.rows);
    this.hp = new Float32Array(this.cols * this.rows);
    this.rng = new TS.util.RNG(seed);
    this.generate();
  }

  World.EMPTY = EMPTY;
  World.BRICK = BRICK;
  World.STEEL = STEEL;

  World.prototype.idx = function (tx, ty) { return ty * this.cols + tx; };

  World.prototype.typeAt = function (tx, ty) {
    if (tx < 0 || ty < 0 || tx >= this.cols || ty >= this.rows) return STEEL;
    return this.grid[ty * this.cols + tx];
  };

  World.prototype.solidAt = function (tx, ty) {
    return this.typeAt(tx, ty) !== EMPTY;
  };

  World.prototype.solidAtPoint = function (x, y) {
    return this.solidAt(Math.floor(x / this.tile), Math.floor(y / this.tile));
  };

  World.prototype.generate = function () {
    var rng = this.rng;
    var t = this.tile;
    var cx = this.w / 2, cy = this.h / 2;
    var safeR = 205;

    // 外框：钢，全封闭
    for (var x = 0; x < this.cols; x++) {
      for (var y = 0; y < this.rows; y++) {
        if (x < 1 || y < 1 || x >= this.cols - 1 || y >= this.rows - 1) {
          this.setTile(x, y, STEEL);
        }
      }
    }

    function overlapsSafe(tx, ty, tw, th) {
      var x0 = tx * t, y0 = ty * t;
      var x1 = (tx + tw) * t, y1 = (ty + th) * t;
      var nx = Math.max(x0, Math.min(cx, x1));
      var ny = Math.max(y0, Math.min(cy, y1));
      return Math.hypot(nx - cx, ny - cy) < safeR;
    }

    var tries = 0, placed = 0;
    while (placed < 88 && tries++ < 700) {
      var tw = rng.int(1, 5);
      var th = rng.int(1, 3);
      var tx = rng.int(2, this.cols - 3 - tw);
      var ty = rng.int(2, this.rows - 3 - th);
      if (overlapsSafe(tx, ty, tw, th)) continue;
      // 偶尔来一段长墙，制造通道感
      if (rng.chance(0.16)) { tw = rng.int(5, 8); th = 1; }
      // 不要贴着外框铺满，留出绕行空间
      if (tx <= 2 || ty <= 2) continue;
      var i, j;
      for (j = 0; j < th; j++) {
        for (i = 0; i < tw; i++) {
          if (this.typeAt(tx + i, ty + j) === EMPTY) this.setBrick(tx + i, ty + j, 24);
        }
      }
      placed++;
    }

    var steelCount = 0;
    tries = 0;
    while (steelCount < 15 && tries++ < 300) {
      var sw = rng.int(1, 2), sh = rng.int(1, 2);
      var sx = rng.int(4, this.cols - 5 - sw);
      var sy = rng.int(4, this.rows - 5 - sh);
      if (overlapsSafe(sx, sy, sw, sh)) continue;
      for (var jj = 0; jj < sh; jj++) {
        for (var ii = 0; ii < sw; ii++) {
          if (this.typeAt(sx + ii, sy + jj) === EMPTY) this.setTile(sx + ii, sy + jj, STEEL);
        }
      }
      steelCount++;
    }

    // 出生点外圈放一圈矮墙：既给掩体，也让开场不空旷
    for (var a = 0; a < 12; a++) {
      if (rng.chance(0.22)) continue;
      var ang = (a / 12) * Math.PI * 2 + rng.range(-0.08, 0.08);
      var rad = rng.range(300, 470);
      var bx = Math.floor((cx + Math.cos(ang) * rad) / t);
      var by = Math.floor((cy + Math.sin(ang) * rad) / t);
      var bw = rng.int(1, 2), bh = rng.int(1, 2);
      for (var bj = 0; bj < bh; bj++) {
        for (var bi = 0; bi < bw; bi++) {
          if (this.typeAt(bx + bi, by + bj) === EMPTY) this.setBrick(bx + bi, by + bj, 24);
        }
      }
    }

    // 场地边缘再补几个钢制角落，让边界不单调
    for (var k = 0; k < 8; k++) {
      var ex = rng.chance(0.5) ? 2 : this.cols - 4;
      var ey = rng.int(4, this.rows - 5);
      this.setTile(ex, ey, STEEL);
      this.setTile(ex + 1, ey, STEEL);
    }

    this.spawnCenter = { x: cx, y: cy };
  };

  World.prototype.setTile = function (tx, ty, type) {
    if (tx < 0 || ty < 0 || tx >= this.cols || ty >= this.rows) return;
    var i = ty * this.cols + tx;
    this.grid[i] = type;
    this.hp[i] = type === BRICK ? 24 : type === STEEL ? Infinity : 0;
  };

  World.prototype.setBrick = function (tx, ty, hp) {
    if (tx < 0 || ty < 0 || tx >= this.cols || ty >= this.rows) return;
    var i = ty * this.cols + tx;
    this.grid[i] = BRICK;
    this.hp[i] = hp;
  };

  World.prototype.damageTile = function (tx, ty, dmg) {
    if (tx < 0 || ty < 0 || tx >= this.cols || ty >= this.rows) return 'none';
    var i = ty * this.cols + tx;
    var type = this.grid[i];
    if (type === STEEL) return 'steel';
    if (type !== BRICK) return 'none';
    this.hp[i] -= dmg;
    if (this.hp[i] <= 0) {
      this.grid[i] = EMPTY;
      this.hp[i] = 0;
      return 'destroyed';
    }
    return 'damaged';
  };

  // 圆形推出墙体；返回是否发生碰撞
  World.prototype.resolveCircle = function (e, radius) {
    var t = this.tile;
    var r = radius == null ? e.r : radius;
    var hit = false;
    for (var pass = 0; pass < 2; pass++) {
      var minTx = Math.floor((e.x - r) / t);
      var maxTx = Math.floor((e.x + r) / t);
      var minTy = Math.floor((e.y - r) / t);
      var maxTy = Math.floor((e.y + r) / t);
      for (var ty = minTy; ty <= maxTy; ty++) {
        for (var tx = minTx; tx <= maxTx; tx++) {
          if (!this.solidAt(tx, ty)) continue;
          var c = TS.util.circleRect(e.x, e.y, r, tx * t, ty * t, t, t);
          if (!c) continue;
          e.x += c.x * c.depth;
          e.y += c.y * c.depth;
          hit = true;
        }
      }
    }
    // 世界边界（外框已挡，但高速移动仍可能穿出去）
    if (e.x < r) { e.x = r; hit = true; }
    if (e.y < r) { e.y = r; hit = true; }
    if (e.x > this.w - r) { e.x = this.w - r; hit = true; }
    if (e.y > this.h - r) { e.y = this.h - r; hit = true; }
    return hit;
  };

  World.prototype.tileHash = function (x, y) {
    return (Math.imul(x | 0, 73856093) ^ Math.imul(y | 0, 19349663)) >>> 0;
  };

  // 以 (x,y) 为圆心、[minR,maxR] 的环上找一个空地；失败返回 null
  World.prototype.findSpawn = function (rng, x, y, minR, maxR, clearance) {
    clearance = clearance || 22;
    for (var i = 0; i < 28; i++) {
      var a = rng.next() * Math.PI * 2;
      var rr = rng.range(minR, maxR);
      var px = x + Math.cos(a) * rr;
      var py = y + Math.sin(a) * rr;
      if (px < 80 || py < 80 || px > this.w - 80 || py > this.h - 80) continue;
      if (this.areaFree(px, py, clearance)) return { x: px, y: py };
    }
    return null;
  };

  World.prototype.areaFree = function (x, y, r) {
    var t = this.tile;
    var minTx = Math.floor((x - r) / t);
    var maxTx = Math.floor((x + r) / t);
    var minTy = Math.floor((y - r) / t);
    var maxTy = Math.floor((y + r) / t);
    for (var ty = minTy; ty <= maxTy; ty++) {
      for (var tx = minTx; tx <= maxTx; tx++) {
        if (!this.solidAt(tx, ty)) continue;
        if (TS.util.circleRect(x, y, r, tx * t, ty * t, t, t)) return false;
      }
    }
    return true;
  };

  World.prototype.randomFreePoint = function (rng, avoidX, avoidY, avoidR) {
    for (var i = 0; i < 80; i++) {
      var x = rng.range(80, this.w - 80);
      var y = rng.range(80, this.h - 80);
      if (avoidX != null && TS.util.dist2(x, y, avoidX, avoidY) < avoidR * avoidR) continue;
      if (this.areaFree(x, y, 30)) return { x: x, y: y };
    }
    return { x: this.w / 2, y: this.h / 2 };
  };

  TS.World = World;
})(window.TS = window.TS || {});
