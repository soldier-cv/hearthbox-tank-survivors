/* 渲染：全部用 Canvas 2D 画，没有任何贴图。
   画风是「俯视街机」：粗描边、硬阴影、暖色高亮、暗色地面。 */
(function (TS) {
  'use strict';

  var TAU = Math.PI * 2;

  var PALETTES = {
    p1: { body: '#f2b13c', dark: '#8f5c12', light: '#ffe6b0', tread: '#3d2d15', glow: 'rgba(242,177,60,.32)' },
    p2: { body: '#58c8d8', dark: '#1f6470', light: '#c9f5fb', tread: '#16383e', glow: 'rgba(88,200,216,.32)' },
    grunt: { body: '#c94b37', dark: '#6f2419', light: '#f2a08f', tread: '#331310', glow: 'rgba(226,84,60,.25)' },
    runner: { body: '#e0973c', dark: '#7d4c14', light: '#f7cf95', tread: '#3a260d', glow: 'rgba(224,151,60,.25)' },
    gunner: { body: '#a963c9', dark: '#592e70', light: '#dcb5ef', tread: '#2a1533', glow: 'rgba(180,107,214,.25)' },
    brute: { body: '#8f4a3c', dark: '#48211b', light: '#cc8a7b', tread: '#241110', glow: 'rgba(156,74,58,.3)' },
    bomber: { body: '#d9452b', dark: '#731d10', light: '#ff9a7f', tread: '#2e1009', glow: 'rgba(224,67,43,.3)' },
    boss: { body: '#b9362a', dark: '#4d100c', light: '#ff8b6f', tread: '#1d0705', glow: 'rgba(226,84,60,.35)' },
    boss2: { body: '#d0392a', dark: '#52100a', light: '#ffd166', tread: '#230604', glow: 'rgba(255,90,60,.42)' }
  };

  function rrect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function hash2(x, y) {
    var h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
    h = (h ^ (h >>> 13)) * 1274126177;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  var Renderer = {
    canvas: null,
    ctx: null,
    w: 0,
    h: 0,
    dpr: 1,

    init: function (canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.resize();
      var self = this;
      window.addEventListener('resize', function () { self.resize(); });
    },

    resize: function () {
      this.dpr = Math.min(2, window.devicePixelRatio || 1);
      this.w = window.innerWidth;
      this.h = window.innerHeight;
      this.canvas.width = Math.floor(this.w * this.dpr);
      this.canvas.height = Math.floor(this.h * this.dpr);
      this.canvas.style.width = this.w + 'px';
      this.canvas.style.height = this.h + 'px';
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this.ctx.imageSmoothingEnabled = true;
    },

    baseScale: function () {
      return Math.min(this.w / 1060, this.h / 660);
    },

    // =================================================================
    // 主渲染
    // =================================================================

    render: function (game, dt) {
      var ctx = this.ctx;
      var w = this.w, h = this.h;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#0c0f11';
      ctx.fillRect(0, 0, w, h);

      if (!game || !game.world) {
        this.drawAttract(dt);
        return;
      }

      game.baseScale = this.baseScale();
      var scale = game.baseScale * game.cam.zoom;
      var sx = 0, sy = 0;
      if (game.shake > 0.1) {
        var k = Math.min(1, game.shake / 12);
        sx = (Math.random() - 0.5) * 16 * k;
        sy = (Math.random() - 0.5) * 16 * k;
      }

      var camX = game.cam.x, camY = game.cam.y;
      ctx.save();
      ctx.translate(w / 2 + sx, h / 2 + sy);
      ctx.scale(scale, scale);
      ctx.translate(-camX, -camY);

      var vb = {
        x0: camX - w / scale / 2 - 100,
        x1: camX + w / scale / 2 + 100,
        y0: camY - h / scale / 2 - 100,
        y1: camY + h / scale / 2 + 100
      };

      this.drawGround(game, vb);
      this.drawDecals(game, vb);
      this.drawPuddles(game, vb);
      this.drawMines(game, vb);
      this.drawPickups(game, vb);
      this.drawWalls(game, vb);
      this.drawDrones(game, vb);
      this.drawEnemies(game, vb);
      this.drawPlayers(game, vb);
      this.drawBullets(game, vb);
      this.drawArcs(game, vb);
      this.drawParticles(game, vb);
      this.drawTexts(game, vb);

      ctx.restore();

      this.drawOffscreenMarkers(game, scale, camX, camY);
      this.drawDangerVignette(game);
      this.drawFlash(game);
    },

    // =================================================================
    // 标题背景
    // =================================================================

    drawAttract: function (dt) {
      var ctx = this.ctx, w = this.w, h = this.h;
      this._attractT = (this._attractT || 0) + dt;
      var t = this._attractT;

      var g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, '#111619');
      g.addColorStop(0.6, '#0d1113');
      g.addColorStop(1, '#0a0d0f');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      // 慢慢移动的战术网格
      var cell = 64;
      var off = (t * 9) % cell;
      ctx.strokeStyle = 'rgba(255,255,255,.035)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (var x = -off; x < w + cell; x += cell) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
      }
      for (var y = -off; y < h + cell; y += cell) {
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
      }
      ctx.stroke();

      // 大块的地面阴影
      ctx.fillStyle = 'rgba(0,0,0,.28)';
      ctx.beginPath();
      ctx.ellipse(w * 0.72, h * 0.58, w * 0.42, h * 0.42, 0, 0, TAU);
      ctx.fill();

      // 右侧的巨型坦克蓝图 + 雷达环，给标题一个稳定的视觉锚点
      if (w >= 1100 && h >= 620) {
        var gx = w * 0.79, gy = h * 0.54;
        var gr = Math.min(w, h) * 0.23;
        ctx.save();
        ctx.translate(gx, gy);
        for (var ring = 1; ring <= 3; ring++) {
          ctx.strokeStyle = 'rgba(242,173,58,' + (0.1 - ring * 0.022) + ')';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(0, 0, gr * 0.75 + ring * 34 + Math.sin(t * 0.6 + ring) * 4, 0, TAU);
          ctx.stroke();
        }

        // 雷达刻度
        ctx.strokeStyle = 'rgba(242,173,58,.16)';
        ctx.lineWidth = 1;
        for (var tick = 0; tick < 24; tick++) {
          var ta = (tick / 24) * TAU + t * 0.05;
          var r0 = gr * 0.75 + 34 * 3;
          var r1 = r0 + (tick % 6 === 0 ? 12 : 6);
          ctx.beginPath();
          ctx.moveTo(Math.cos(ta) * r0, Math.sin(ta) * r0);
          ctx.lineTo(Math.cos(ta) * r1, Math.sin(ta) * r1);
          ctx.stroke();
        }

        // 十字参考线
        ctx.strokeStyle = 'rgba(242,173,58,.07)';
        ctx.beginPath();
        ctx.moveTo(-gr * 1.5, 0);
        ctx.lineTo(gr * 1.5, 0);
        ctx.moveTo(0, -gr * 1.5);
        ctx.lineTo(0, gr * 1.5);
        ctx.stroke();

        ctx.rotate(-0.32);
        ctx.globalAlpha = 0.2;
        this.drawTankShape(ctx, {
          palette: PALETTES.p1,
          size: Math.min(w, h) * 0.16,
          turret: -0.15,
          treadPhase: 0,
          barrelScale: 1.5,
          extraArmor: true
        });
        ctx.globalAlpha = 1;
        ctx.restore();

        // 蓝图角标与标注
        var frame = Math.min(w, h) * 0.23 * 1.05;
        ctx.strokeStyle = 'rgba(242,173,58,.22)';
        ctx.lineWidth = 1;
        var corners = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
        for (var ci = 0; ci < 4; ci++) {
          var cxx = corners[ci][0], cyy = corners[ci][1];
          var fx = gx + cxx * frame, fy = gy + cyy * frame;
          ctx.beginPath();
          ctx.moveTo(fx, fy + cyy * 22);
          ctx.lineTo(fx, fy);
          ctx.lineTo(fx - cxx * 22, fy);
          ctx.stroke();
        }
        ctx.font = '600 11px ui-monospace, Consolas, monospace';
        ctx.fillStyle = 'rgba(242,173,58,.55)';
        ctx.textAlign = 'left';
        ctx.fillText('M-01 / SIEGE PLATFORM', gx - frame, gy - frame - 14);
        ctx.textAlign = 'right';
        ctx.fillStyle = 'rgba(242,173,58,.5)';
        ctx.fillText('SCHEMATIC · 1:8', gx + frame, gy + frame + 22);
        ctx.textAlign = 'left';
        ctx.fillStyle = 'rgba(168,176,178,.45)';
        ctx.fillText('ARMOR: STEEL COMPOSITE', gx - frame, gy + frame + 22);
      }

      // 远处炮火
      var pulse = (Math.sin(t * 1.2) + 1) / 2;
      var rg = ctx.createRadialGradient(w * 0.86, h * 0.18, 0, w * 0.86, h * 0.18, w * 0.35);
      rg.addColorStop(0, 'rgba(242,173,58,' + (0.05 + pulse * 0.05) + ')');
      rg.addColorStop(1, 'rgba(242,173,58,0)');
      ctx.fillStyle = rg;
      ctx.fillRect(0, 0, w, h);

      // 底部暗角
      var bg = ctx.createLinearGradient(0, h * 0.7, 0, h);
      bg.addColorStop(0, 'rgba(11,14,16,0)');
      bg.addColorStop(1, 'rgba(11,14,16,.85)');
      ctx.fillStyle = bg;
      ctx.fillRect(0, h * 0.7, w, h * 0.3);
    },

    // =================================================================
    // 地面 / 墙
    // =================================================================

    drawGround: function (game, vb) {
      var ctx = this.ctx, t = game.world.tile;
      var x0 = Math.max(0, Math.floor(vb.x0 / t));
      var x1 = Math.min(game.world.cols - 1, Math.ceil(vb.x1 / t));
      var y0 = Math.max(0, Math.floor(vb.y0 / t));
      var y1 = Math.min(game.world.rows - 1, Math.ceil(vb.y1 / t));

      ctx.fillStyle = '#14181b';
      ctx.fillRect(vb.x0, vb.y0, vb.x1 - vb.x0, vb.y1 - vb.y0);

      // 5x5 大板块的明暗
      for (var by = Math.floor(y0 / 5); by <= Math.floor(y1 / 5); by++) {
        for (var bx = Math.floor(x0 / 5); bx <= Math.floor(x1 / 5); bx++) {
          var hv = hash2(bx, by);
          if (hv < 0.34) {
            ctx.fillStyle = 'rgba(255,255,255,.012)';
            ctx.fillRect(bx * 5 * t, by * 5 * t, 5 * t, 5 * t);
          } else if (hv > 0.78) {
            ctx.fillStyle = 'rgba(0,0,0,.12)';
            ctx.fillRect(bx * 5 * t, by * 5 * t, 5 * t, 5 * t);
          }
        }
      }

      ctx.strokeStyle = 'rgba(255,255,255,.028)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (var gx = x0; gx <= x1 + 1; gx++) {
        if (gx % 5 !== 0) continue;
        ctx.moveTo(gx * t, vb.y0);
        ctx.lineTo(gx * t, vb.y1);
      }
      for (var gy = y0; gy <= y1 + 1; gy++) {
        if (gy % 5 !== 0) continue;
        ctx.moveTo(vb.x0, gy * t);
        ctx.lineTo(vb.x1, gy * t);
      }
      ctx.stroke();

      // 碎石和污渍
      ctx.fillStyle = 'rgba(255,255,255,.055)';
      for (var ty = y0; ty <= y1; ty++) {
        for (var tx = x0; tx <= x1; tx++) {
          var r = hash2(tx * 7 + 3, ty * 11 + 5);
          if (r < 0.5) continue;
          var px = tx * t + 6 + hash2(tx, ty + 90) * (t - 12);
          var py = ty * t + 6 + hash2(tx + 70, ty) * (t - 12);
          ctx.fillRect(px, py, 1.6, 1.6);
        }
      }

      // 随机轮胎印/焦痕（静态，靠 hash 决定）
      for (var sy = y0; sy <= y1; sy += 3) {
        for (var sxx = x0; sxx <= x1; sxx += 3) {
          var hv2 = hash2(sxx + 21, sy + 55);
          if (hv2 > 0.92) {
            ctx.fillStyle = 'rgba(0,0,0,.18)';
            ctx.beginPath();
            ctx.ellipse(sxx * t + 60, sy * t + 40, 34, 12, hv2 * 3, 0, TAU);
            ctx.fill();
          }
        }
      }
    },

    drawWalls: function (game, vb) {
      var ctx = this.ctx, world = game.world, t = world.tile;
      var x0 = Math.max(0, Math.floor(vb.x0 / t));
      var x1 = Math.min(world.cols - 1, Math.ceil(vb.x1 / t));
      var y0 = Math.max(0, Math.floor(vb.y0 / t));
      var y1 = Math.min(world.rows - 1, Math.ceil(vb.y1 / t));

      for (var ty = y0; ty <= y1; ty++) {
        for (var tx = x0; tx <= x1; tx++) {
          var type = world.typeAt(tx, ty);
          if (!type) continue;
          var px = tx * t, py = ty * t;
          if (type === TS.World.BRICK) this.drawBrick(ctx, px, py, t, world.hp[ty * world.cols + tx] / 24, tx, ty);
          else this.drawSteel(ctx, px, py, t, tx, ty);
        }
      }
    },

    drawBrick: function (ctx, x, y, t, ratio, tx, ty) {
      var r = Math.max(0, Math.min(1, ratio));
      ctx.fillStyle = '#2a1a14';
      ctx.fillRect(x, y, t, t);
      ctx.fillStyle = r > 0.45 ? '#a9563a' : '#8b4029';
      ctx.fillRect(x + 2, y + 2, t - 4, t - 4);

      ctx.fillStyle = 'rgba(255,255,255,.10)';
      ctx.fillRect(x + 2, y + 2, t - 4, 3);
      ctx.fillStyle = 'rgba(0,0,0,.22)';
      ctx.fillRect(x + 2, y + t - 5, t - 4, 3);

      // 砖缝
      ctx.strokeStyle = 'rgba(35,18,12,.65)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(x + 3, y + t * 0.34);
      ctx.lineTo(x + t - 3, y + t * 0.34);
      ctx.moveTo(x + 3, y + t * 0.67);
      ctx.lineTo(x + t - 3, y + t * 0.67);
      var off = (Math.floor((tx + ty) % 2) === 0) ? t * 0.5 : t * 0.3;
      ctx.moveTo(x + off, y + 3);
      ctx.lineTo(x + off, y + t * 0.34);
      ctx.moveTo(x + t - off, y + t * 0.34);
      ctx.lineTo(x + t - off, y + t * 0.67);
      ctx.moveTo(x + off, y + t * 0.67);
      ctx.lineTo(x + off, y + t - 3);
      ctx.stroke();

      if (r < 0.85) {
        ctx.fillStyle = 'rgba(15,18,20,.55)';
        var hv = hash2(tx, ty);
        ctx.fillRect(x + 4 + hv * 18, y + 3, 5, 6);
        ctx.fillRect(x + 10 + hv * 10, y + t - 12, 7, 5);
        ctx.strokeStyle = 'rgba(20,10,7,.6)';
        ctx.beginPath();
        ctx.moveTo(x + 6, y + 8);
        ctx.lineTo(x + 14, y + 17);
        ctx.lineTo(x + 11, y + 24);
        ctx.stroke();
      }
    },

    drawSteel: function (ctx, x, y, t, tx, ty) {
      ctx.fillStyle = '#232a2f';
      ctx.fillRect(x, y, t, t);
      ctx.fillStyle = '#65727b';
      ctx.fillRect(x + 2, y + 2, t - 4, t - 4);
      ctx.fillStyle = '#7f8d96';
      ctx.fillRect(x + 4, y + 4, t - 8, t - 14);
      ctx.fillStyle = 'rgba(255,255,255,.16)';
      ctx.fillRect(x + 4, y + 4, t - 8, 3);
      ctx.fillStyle = 'rgba(0,0,0,.26)';
      ctx.fillRect(x + 4, y + t - 12, t - 8, 8);

      // 铆钉
      ctx.fillStyle = '#4c5961';
      var pad = 8;
      ctx.fillRect(x + pad, y + pad, 3, 3);
      ctx.fillRect(x + t - pad - 3, y + pad, 3, 3);
      ctx.fillRect(x + pad, y + t - pad - 3, 3, 3);
      ctx.fillRect(x + t - pad - 3, y + t - pad - 3, 3, 3);

      // 拼缝
      ctx.strokeStyle = 'rgba(20,26,30,.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + t / 2, y + 4);
      ctx.lineTo(x + t / 2, y + t - 4);
      ctx.stroke();
    },

    // =================================================================
    // 实体
    // =================================================================

    drawTankShape: function (ctx, o) {
      var size = o.size;
      var pal = o.palette;
      var treadW = size * 1.75;
      var treadH = size * 0.5;
      var bodyW = size * 1.6;
      var bodyH = size * 1.24;

      // 履带
      ctx.fillStyle = pal.tread;
      rrect(ctx, -treadW / 2, -bodyH / 2 - treadH + 3, treadW, treadH, 3);
      ctx.fill();
      rrect(ctx, -treadW / 2, bodyH / 2 - 3, treadW, treadH, 3);
      ctx.fill();

      // 履带齿
      ctx.fillStyle = 'rgba(255,255,255,.13)';
      var phase = (o.treadPhase || 0) % 8;
      for (var i = -treadW / 2 + 3 + phase; i < treadW / 2 - 2; i += 8) {
        ctx.fillRect(i, -bodyH / 2 - treadH + 6, 3, treadH - 6);
        ctx.fillRect(i, bodyH / 2 + 3, 3, treadH - 6);
      }

      // 车体
      ctx.fillStyle = pal.dark;
      rrect(ctx, -bodyW / 2 - 1.5, -bodyH / 2 - 1.5, bodyW + 3, bodyH + 3, 5);
      ctx.fill();
      ctx.fillStyle = pal.body;
      rrect(ctx, -bodyW / 2, -bodyH / 2, bodyW, bodyH, 4);
      ctx.fill();

      // 车体高光与阴影
      ctx.fillStyle = pal.light;
      ctx.globalAlpha = 0.30;
      ctx.fillRect(-bodyW / 2 + 4, -bodyH / 2 + 3, bodyW - 8, 3);
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(0,0,0,.18)';
      ctx.fillRect(-bodyW / 2 + 4, bodyH / 2 - 6, bodyW - 8, 3);

      // 车体前后装甲条
      ctx.fillStyle = pal.dark;
      ctx.fillRect(bodyW / 2 - 5, -bodyH / 2 + 3, 3, bodyH - 6);
      ctx.fillRect(-bodyW / 2 + 2, -bodyH / 2 + 3, 3, bodyH - 6);

      // 炮塔
      var tr = size * 0.52;
      ctx.fillStyle = pal.dark;
      ctx.beginPath();
      ctx.arc(0, 0, tr + 2, 0, TAU);
      ctx.fill();
      ctx.fillStyle = pal.body;
      ctx.beginPath();
      ctx.arc(0, 0, tr, 0, TAU);
      ctx.fill();
      ctx.fillStyle = pal.light;
      ctx.globalAlpha = 0.28;
      ctx.beginPath();
      ctx.arc(-tr * 0.25, -tr * 0.25, tr * 0.6, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;

      // 炮管
      ctx.save();
      ctx.rotate(o.turret || 0);
      var barrel = size * (o.barrelScale || 1.35);
      ctx.fillStyle = pal.dark;
      rrect(ctx, 0, -size * 0.17, barrel + 4, size * 0.34, 2);
      ctx.fill();
      ctx.fillStyle = pal.body;
      rrect(ctx, 2, -size * 0.12, barrel, size * 0.24, 2);
      ctx.fill();
      if (o.muzzle) {
        ctx.fillStyle = 'rgba(255,214,122,.9)';
        ctx.beginPath();
        ctx.arc(barrel + 4, 0, size * 0.34, 0, TAU);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.85)';
        ctx.beginPath();
        ctx.arc(barrel + 4, 0, size * 0.16, 0, TAU);
        ctx.fill();
      }
      ctx.restore();

      // 玩家标记
      if (o.star) {
        ctx.fillStyle = o.starColor || '#20160a';
        ctx.globalAlpha = 0.55;
        ctx.beginPath();
        ctx.arc(-size * 0.1, 0, size * 0.2, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      if (o.extraArmor) {
        ctx.strokeStyle = pal.light;
        ctx.globalAlpha = 0.35;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(-bodyW / 2 + 5, -bodyH / 2 + 6);
        ctx.lineTo(bodyW / 2 - 5, -bodyH / 2 + 6);
        ctx.moveTo(-bodyW / 2 + 5, bodyH / 2 - 6);
        ctx.lineTo(bodyW / 2 - 5, bodyH / 2 - 6);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    },

    drawTank: function (ctx, e, opts) {
      var pal = PALETTES[e.type] || PALETTES.grunt;
      if (e.boss) pal = e.final ? PALETTES.boss2 : PALETTES.boss;
      var size = e.boss ? (e.final ? 46 : 36) : (e.type === 'brute' ? 24 : e.type === 'runner' ? 13 : 17);
      if (e.elite) size *= 1.25;

      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.rotate(e.angle);

      if (e.boss) {
        // 外圈能量环
        var pulse = 0.55 + Math.sin((this._t || 0) * 3) * 0.2;
        ctx.strokeStyle = 'rgba(226,84,60,' + pulse + ')';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, size * 1.55, 0, TAU);
        ctx.stroke();
      } else if (e.elite) {
        ctx.strokeStyle = 'rgba(242,173,58,.65)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, size * 1.6, 0, TAU);
        ctx.stroke();
      }

      ctx.globalAlpha = e.flash > 0 ? 1 : 1;
      if (e.flash > 0) {
        ctx.shadowColor = '#fff';
      }

      this.drawTankShape(ctx, {
        palette: pal,
        size: size,
        turret: e.type === 'boss' ? Math.sin((this._t || 0) * 1.3) * 0.25 : 0,
        treadPhase: (e._tread || 0),
        barrelScale: e.type === 'gunner' ? 1.7 : e.type === 'brute' ? 1.5 : 1.3,
        extraArmor: e.type === 'brute' || e.boss,
        star: false
      });

      // 自爆车警示灯
      if (e.type === 'bomber') {
        var blink = (Math.sin((this._t || 0) * 12) > 0) ? 1 : 0.25;
        ctx.fillStyle = 'rgba(255,90,60,' + blink + ')';
        ctx.beginPath();
        ctx.arc(0, 0, size * 0.22, 0, TAU);
        ctx.fill();
      }

      if (e.flash > 0) {
        ctx.globalAlpha = Math.min(0.75, e.flash * 6);
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(0, 0, size * 1.1, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.restore();

      // 精英血条
      if ((e.elite || e.boss) && e.hp < e.maxHp && !e.boss) {
        var bw = size * 2.6;
        var by = e.y - size * 1.9;
        ctx.fillStyle = 'rgba(0,0,0,.6)';
        ctx.fillRect(e.x - bw / 2, by, bw, 4);
        ctx.fillStyle = '#f2ad3a';
        ctx.fillRect(e.x - bw / 2, by, bw * (e.hp / e.maxHp), 4);
      }
    },

    drawPlayers: function (game, vb) {
      var ctx = this.ctx;
      for (var i = 0; i < game.players.length; i++) {
        var p = game.players[i];
        if (p.x < vb.x0 || p.x > vb.x1 || p.y < vb.y0 || p.y > vb.y1) continue;

        if (!p.alive) {
          this.drawWreck(ctx, p);
          continue;
        }

        var pal = i === 0 ? PALETTES.p1 : PALETTES.p2;
        var blink = p.invuln > 0 && Math.floor(p.invuln * 18) % 2 === 0;

        // 护盾
        if (p.shield > 0) {
          var sp = 0.55 + Math.sin((this._t || 0) * 4 + i) * 0.12;
          ctx.strokeStyle = 'rgba(123,214,255,' + sp + ')';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r + 12, 0, TAU);
          ctx.stroke();
          ctx.fillStyle = 'rgba(123,214,255,.06)';
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r + 12, 0, TAU);
          ctx.fill();
        }

        if (blink) ctx.globalAlpha = 0.45;

        // 车底光晕：暗场里一眼能找到自己
        var glow = ctx.createRadialGradient(p.x, p.y, 4, p.x, p.y, 46);
        glow.addColorStop(0, pal.glow);
        glow.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 46, 0, TAU);
        ctx.fill();

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);

        if (p.dashTime > 0) {
          ctx.fillStyle = pal.glow;
          ctx.beginPath();
          ctx.ellipse(-14, 0, 30, 16, 0, 0, TAU);
          ctx.fill();
        }

        this.drawTankShape(ctx, {
          palette: pal,
          size: 18,
          turret: p.turretAngle - p.angle,
          treadPhase: (p.x + p.y) * 0.4,
          muzzle: p.recoil > 0.55,
          star: true,
          starColor: '#241704'
        });
        ctx.restore();
        ctx.globalAlpha = 1;

        // 车顶标签
        ctx.font = '700 10px ui-monospace, Consolas, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(0,0,0,.55)';
        var label = p.name;
        var tw = ctx.measureText(label).width;
        rrect(ctx, p.x - tw / 2 - 4, p.y - 39, tw + 8, 14, 2);
        ctx.fill();
        ctx.fillStyle = p.color;
        ctx.fillText(label, p.x, p.y - 31.5);

        // 手动瞄准标记
        var inp = TS.Input.players[p.index];
        if (inp && inp.aimActive) {
          var ax = p.x + Math.cos(p.aimAngle) * 66;
          var ay = p.y + Math.sin(p.aimAngle) * 66;
          ctx.strokeStyle = 'rgba(255,255,255,.35)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(ax, ay, 6, 0, TAU);
          ctx.moveTo(ax - 10, ay);
          ctx.lineTo(ax - 7, ay);
          ctx.moveTo(ax + 7, ay);
          ctx.lineTo(ax + 10, ay);
          ctx.stroke();
        }
      }
    },

    drawWreck: function (ctx, p) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      ctx.globalAlpha = 0.8;
      ctx.fillStyle = '#2b2b28';
      rrect(ctx, -16, -13, 32, 26, 5);
      ctx.fill();
      ctx.fillStyle = '#1a1a18';
      rrect(ctx, -9, -8, 18, 16, 3);
      ctx.fill();
      ctx.fillStyle = p.color;
      ctx.globalAlpha = 0.25;
      ctx.fillRect(-2, -16, 4, 32);
      ctx.restore();

      // 救援进度
      if (p.downed) {
        var prog = Math.min(1, p.reviveT / p.reviveR);
        ctx.strokeStyle = 'rgba(154,209,79,.85)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 30, -Math.PI / 2, -Math.PI / 2 + TAU * prog);
        ctx.stroke();
        ctx.font = '700 10px ui-monospace, Consolas, monospace';
        ctx.fillStyle = 'rgba(243,236,221,.8)';
        ctx.textAlign = 'center';
        ctx.fillText(prog > 0 ? '救援中' : '队友靠近可救援', p.x, p.y + 46);
      }
    },

    drawEnemies: function (game, vb) {
      var ctx = this.ctx;
      for (var i = 0; i < game.enemies.length; i++) {
        var e = game.enemies[i];
        if (e.dead) continue;
        if (e.x < vb.x0 || e.x > vb.x1 || e.y < vb.y0 || e.y > vb.y1) continue;
        if (e.type === 'boss') {
          this.drawBoss(ctx, e);
        } else {
          this.drawTank(ctx, e);
          if (e.elite) {
            ctx.font = '700 8px ui-monospace, Consolas, monospace';
            ctx.fillStyle = '#f2ad3a';
            ctx.textAlign = 'center';
            ctx.fillText('ELITE', e.x, e.y - e.r * 1.9 - 8);
          }
        }
      }
    },

    drawBoss: function (ctx, e) {
      var size = e.final ? 46 : 36;
      ctx.save();
      ctx.translate(e.x, e.y);

      // 阴影与光环
      var pulse = 0.5 + Math.sin((this._t || 0) * 2.5) * 0.15;
      var rg = ctx.createRadialGradient(0, 0, size * 0.6, 0, 0, size * 2.6);
      rg.addColorStop(0, 'rgba(226,84,60,.18)');
      rg.addColorStop(1, 'rgba(226,84,60,0)');
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.arc(0, 0, size * 2.6, 0, TAU);
      ctx.fill();

      ctx.rotate(e.angle);
      ctx.fillStyle = 'rgba(0,0,0,.55)';
      rrect(ctx, -size * 1.4, -size * 1.1, size * 2.8, size * 2.2, 8);
      ctx.fill();

      var pal = e.final ? PALETTES.boss2 : PALETTES.boss;
      this.drawTankShape(ctx, {
        palette: pal,
        size: size,
        turret: Math.sin((this._t || 0) * 1.1) * 0.3,
        treadPhase: 0,
        barrelScale: 1.55,
        extraArmor: true
      });

      // 核心
      ctx.fillStyle = 'rgba(255,209,102,' + (0.6 + pulse * 0.3) + ')';
      ctx.beginPath();
      ctx.arc(0, 0, size * 0.24, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,90,60,.6)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, size * 0.45, 0, TAU);
      ctx.stroke();

      // 侧炮
      ctx.fillStyle = pal.dark;
      for (var s = -1; s <= 1; s += 2) {
        rrect(ctx, size * 0.2, s * size * 0.92 - size * 0.14, size * 1.1, size * 0.28, 2);
        ctx.fill();
      }
      ctx.restore();

      if (e.flash > 0) {
        ctx.globalAlpha = Math.min(0.45, e.flash * 4);
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(e.x, e.y, size * 1.8, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    },

    drawDrones: function (game, vb) {
      var ctx = this.ctx;
      for (var i = 0; i < game.drones.length; i++) {
        var d = game.drones[i];
        if (d.x < vb.x0 || d.x > vb.x1 || d.y < vb.y0 || d.y > vb.y1) continue;
        var p = game.players[d.owner];
        var col = p ? p.color : '#c9a0ff';
        ctx.save();
        ctx.translate(d.x, d.y);
        ctx.rotate(d.phase * 2);
        ctx.fillStyle = 'rgba(0,0,0,.4)';
        rrect(ctx, -7, -6, 14, 12, 3);
        ctx.fill();
        ctx.fillStyle = '#23282c';
        rrect(ctx, -6, -5, 12, 10, 2);
        ctx.fill();
        ctx.fillStyle = col;
        ctx.fillRect(-3, -3, 6, 6);
        ctx.strokeStyle = col;
        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        ctx.arc(0, 0, 9, 0, TAU);
        ctx.stroke();
        ctx.restore();
      }
    },

    drawBullets: function (game, vb) {
      var ctx = this.ctx;
      ctx.globalCompositeOperation = 'lighter';
      for (var i = 0; i < game.bullets.length; i++) {
        var b = game.bullets[i];
        if (b.x < vb.x0 || b.x > vb.x1 || b.y < vb.y0 || b.y > vb.y1) continue;
        var tx = b.x - b.vx * 0.022;
        var ty = b.y - b.vy * 0.022;
        ctx.strokeStyle = b.color;
        ctx.globalAlpha = 0.35;
        ctx.lineWidth = b.crit ? 5 : 3.5;
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.fillStyle = b.crit ? '#fff0c2' : b.color;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.crit ? 4.2 : 3.2, 0, TAU);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.9)';
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.crit ? 2.1 : 1.5, 0, TAU);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';

      for (var j = 0; j < game.ebullets.length; j++) {
        var e = game.ebullets[j];
        if (e.x < vb.x0 || e.x > vb.x1 || e.y < vb.y0 || e.y > vb.y1) continue;
        ctx.fillStyle = 'rgba(255,120,90,.22)';
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r * 2.4, 0, TAU);
        ctx.fill();
        ctx.fillStyle = e.color || '#ff7a5c';
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r, 0, TAU);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.8)';
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r * 0.45, 0, TAU);
        ctx.fill();
      }
    },

    drawArcs: function (game, vb) {
      var ctx = this.ctx;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (var i = 0; i < game.arcs.length; i++) {
        var a = game.arcs[i];
        var alpha = a.life / 0.16;
        ctx.strokeStyle = a.color;
        ctx.globalAlpha = alpha * 0.9;
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (var s = 0; s < a.pts.length - 1; s++) {
          var p0 = a.pts[s], p1 = a.pts[s + 1];
          ctx.moveTo(p0.x, p0.y);
          var segs = 5;
          for (var k = 1; k <= segs; k++) {
            var t = k / segs;
            var jx = (k < segs) ? (Math.random() - 0.5) * 18 : 0;
            var jy = (k < segs) ? (Math.random() - 0.5) * 18 : 0;
            ctx.lineTo(p0.x + (p1.x - p0.x) * t + jx, p0.y + (p1.y - p0.y) * t + jy);
          }
        }
        ctx.stroke();
      }
      ctx.restore();
    },

    drawParticles: function (game, vb) {
      var ctx = this.ctx;
      for (var i = 0; i < game.particles.length; i++) {
        var p = game.particles[i];
        if (p.x < vb.x0 || p.x > vb.x1 || p.y < vb.y0 || p.y > vb.y1) continue;
        var life = p.life / p.maxLife;
        ctx.globalAlpha = Math.max(0, Math.min(1, life));
        ctx.fillStyle = p.color;
        var s = p.size * (0.5 + life * 0.6);
        ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
      }
      ctx.globalAlpha = 1;
    },

    drawTexts: function (game, vb) {
      var ctx = this.ctx;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (var i = 0; i < game.texts.length; i++) {
        var t = game.texts[i];
        if (t.x < vb.x0 || t.x > vb.x1 || t.y < vb.y0 || t.y > vb.y1) continue;
        var a = Math.min(1, t.life / t.maxLife * 1.6);
        ctx.globalAlpha = a;
        ctx.font = '700 ' + t.size + 'px ui-monospace, Consolas, monospace';
        ctx.fillStyle = 'rgba(0,0,0,.55)';
        ctx.fillText(t.text, t.x + 1, t.y + 1);
        ctx.fillStyle = t.color;
        ctx.fillText(t.text, t.x, t.y);
      }
      ctx.globalAlpha = 1;
    },

    drawDecals: function (game, vb) {
      var ctx = this.ctx;
      ctx.save();
      for (var i = 0; i < game.decals.length; i++) {
        var d = game.decals[i];
        if (d.x < vb.x0 || d.x > vb.x1 || d.y < vb.y0 || d.y > vb.y1) continue;
        ctx.save();
        ctx.translate(d.x, d.y);
        ctx.rotate(d.a);
        ctx.globalAlpha = d.alpha * Math.min(1, d.life / 8);
        ctx.fillStyle = d.color;
        ctx.fillRect(-6, -3.5, 12, 7);
        ctx.restore();
      }
      ctx.restore();
    },

    drawPuddles: function (game, vb) {
      var ctx = this.ctx;
      var t = this._t || 0;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (var i = 0; i < game.puddles.length; i++) {
        var p = game.puddles[i];
        if (p.x < vb.x0 || p.x > vb.x1 || p.y < vb.y0 || p.y > vb.y1) continue;
        var flicker = 0.72 + Math.sin(t * 11 + i) * 0.12;
        ctx.globalAlpha = Math.min(0.55, p.life / 2) * flicker;
        var rg = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
        rg.addColorStop(0, '#ffb347');
        rg.addColorStop(0.5, 'rgba(255,110,50,.7)');
        rg.addColorStop(1, 'rgba(255,80,20,0)');
        ctx.fillStyle = rg;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    },

    drawMines: function (game, vb) {
      var ctx = this.ctx;
      var t = this._t || 0;
      for (var i = 0; i < game.mines.length; i++) {
        var m = game.mines[i];
        if (m.x < vb.x0 || m.x > vb.x1 || m.y < vb.y0 || m.y > vb.y1) continue;
        ctx.fillStyle = m.arm > 0 ? '#3b3f42' : '#2a2e31';
        ctx.beginPath();
        ctx.arc(m.x, m.y, 9, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,.2)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = '#f2ad3a';
        ctx.globalAlpha = m.arm > 0 ? 0.35 : (0.6 + Math.sin(t * 9 + i) * 0.4);
        ctx.beginPath();
        ctx.arc(m.x, m.y, 3, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 1;
        // 触发范围提示
        if (m.arm <= 0) {
          ctx.strokeStyle = 'rgba(242,173,58,.12)';
          ctx.beginPath();
          ctx.arc(m.x, m.y, 42, 0, TAU);
          ctx.stroke();
        }
      }
    },

    drawPickups: function (game, vb) {
      var ctx = this.ctx;
      var t = this._t || 0;
      ctx.save();
      for (var i = 0; i < game.pickups.length; i++) {
        var k = game.pickups[i];
        if (k.x < vb.x0 || k.x > vb.x1 || k.y < vb.y0 || k.y > vb.y1) continue;
        var bob = Math.sin(t * 3 + k.t) * 2;
        var y = k.y + bob;

        if (k.type === 'xp') {
          var s = k.big ? 9 : 5.5;
          ctx.globalCompositeOperation = 'lighter';
          ctx.fillStyle = 'rgba(154,209,79,.16)';
          ctx.beginPath();
          ctx.arc(k.x, y, s * 2.4, 0, TAU);
          ctx.fill();
          ctx.globalCompositeOperation = 'source-over';
          ctx.save();
          ctx.translate(k.x, y);
          ctx.rotate(t * 1.6 + k.t);
          ctx.fillStyle = k.big ? '#b8ef6b' : '#8fce4a';
          ctx.beginPath();
          ctx.moveTo(0, -s);
          ctx.lineTo(s * 0.72, 0);
          ctx.lineTo(0, s);
          ctx.lineTo(-s * 0.72, 0);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,.7)';
          ctx.beginPath();
          ctx.moveTo(0, -s * 0.6);
          ctx.lineTo(s * 0.3, 0);
          ctx.lineTo(0, s * 0.2);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        } else if (k.type === 'heart') {
          ctx.fillStyle = 'rgba(154,209,79,.14)';
          ctx.beginPath();
          ctx.arc(k.x, y, 16, 0, TAU);
          ctx.fill();
          ctx.fillStyle = '#9ad14f';
          ctx.fillRect(k.x - 3, k.y - 8 + bob, 6, 16);
          ctx.fillRect(k.x - 8, k.y - 3 + bob, 16, 6);
        } else if (k.type === 'bomb') {
          ctx.fillStyle = 'rgba(242,173,58,.16)';
          ctx.beginPath();
          ctx.arc(k.x, y, 16, 0, TAU);
          ctx.fill();
          ctx.fillStyle = '#f2ad3a';
          ctx.beginPath();
          ctx.arc(k.x, y + 2, 7, 0, TAU);
          ctx.fill();
          ctx.fillStyle = '#2a1c08';
          ctx.fillRect(k.x - 2, k.y - 8 + bob, 4, 5);
          ctx.strokeStyle = '#f2ad3a';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(k.x + 7, k.y - 9 + bob, 3, 0, TAU);
          ctx.stroke();
        } else {
          // 磁铁
          ctx.strokeStyle = '#9ad14f';
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.arc(k.x, y, 6, 0, Math.PI);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(k.x - 6, y);
          ctx.lineTo(k.x - 6, y - 5);
          ctx.moveTo(k.x + 6, y);
          ctx.lineTo(k.x + 6, y - 5);
          ctx.stroke();
        }
      }
      ctx.restore();
    },

    // =================================================================
    // 屏幕空间
    // =================================================================

    drawOffscreenMarkers: function (game, scale, camX, camY) {
      var ctx = this.ctx;
      var w = this.w, h = this.h;

      // BOSS 在画面外时给一个边缘指示，否则玩家只看到血条不知道往哪打
      var boss = game.boss;
      var topSafe = 96, bottomSafe = 118, sideSafe = 30;
      if (boss && !boss.dead) {
        var bx = (boss.x - camX) * scale + w / 2;
        var by = (boss.y - camY) * scale + h / 2;
        if (bx < sideSafe || bx > w - sideSafe || by < topSafe || by > h - bottomSafe) {
          var bcx = Math.max(sideSafe, Math.min(w - sideSafe, bx));
          var bcy = Math.max(topSafe, Math.min(h - bottomSafe, by));
          var bang = Math.atan2(by - h / 2, bx - w / 2);
          var pulse = 0.6 + Math.sin((this._t || 0) * 6) * 0.4;
          ctx.save();
          ctx.translate(bcx, bcy);
          ctx.rotate(bang);
          ctx.fillStyle = 'rgba(226,84,60,' + (0.75 + pulse * 0.25) + ')';
          ctx.beginPath();
          ctx.moveTo(14, 0);
          ctx.lineTo(-8, -8);
          ctx.lineTo(-3, 0);
          ctx.lineTo(-8, 8);
          ctx.closePath();
          ctx.fill();
          ctx.restore();

          ctx.save();
          ctx.translate(bcx - Math.cos(bang) * 26, bcy - Math.sin(bang) * 26);
          ctx.font = '700 10px ui-monospace, Consolas, monospace';
          ctx.textAlign = 'center';
          ctx.fillStyle = '#ff8a75';
          ctx.fillText('BOSS', 0, 3);
          ctx.restore();
        }
      }

      for (var i = 0; i < game.players.length; i++) {
        var p = game.players[i];
        if (!p.alive && !p.downed) continue;
        var sx = (p.x - camX) * scale + w / 2;
        var sy = (p.y - camY) * scale + h / 2;
        if (sx > sideSafe && sx < w - sideSafe && sy > topSafe && sy < h - bottomSafe) continue;
        var cx = Math.max(sideSafe, Math.min(w - sideSafe, sx));
        var cy = Math.max(topSafe, Math.min(h - bottomSafe, sy));
        var ang = Math.atan2(sy - h / 2, sx - w / 2);
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(ang);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        ctx.moveTo(10, 0);
        ctx.lineTo(-7, -7);
        ctx.lineTo(-3, 0);
        ctx.lineTo(-7, 7);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        ctx.font = '700 9px ui-monospace, Consolas, monospace';
        ctx.fillStyle = p.color;
        ctx.textAlign = 'center';
        ctx.fillText(p.name, cx - Math.cos(ang) * 18, cy - Math.sin(ang) * 18 + 3);
      }
      ctx.globalAlpha = 1;
    },

    drawDangerVignette: function (game) {
      var low = null;
      for (var i = 0; i < game.players.length; i++) {
        var p = game.players[i];
        if (!p.alive) continue;
        var ratio = p.hp / p.maxHp;
        if (!low || ratio < low.ratio) low = { ratio: ratio, color: p.color };
      }
      if (!low || low.ratio > 0.34) return;
      var ctx = this.ctx;
      var alpha = (0.34 - low.ratio) / 0.34;
      var rg = ctx.createRadialGradient(this.w / 2, this.h / 2, Math.min(this.w, this.h) * 0.3, this.w / 2, this.h / 2, Math.max(this.w, this.h) * 0.72);
      rg.addColorStop(0, 'rgba(120,10,0,0)');
      rg.addColorStop(1, 'rgba(150,20,8,' + (alpha * 0.5) + ')');
      ctx.fillStyle = rg;
      ctx.fillRect(0, 0, this.w, this.h);
    },

    drawFlash: function (game) {
      if (!game.flash || game.flash <= 0.01) return;
      var ctx = this.ctx;
      ctx.fillStyle = 'rgba(255,231,190,' + Math.min(0.42, game.flash * 0.5) + ')';
      ctx.fillRect(0, 0, this.w, this.h);
    }
  };

  Renderer.renderFrame = function (game, dt) {
    Renderer._t = (Renderer._t || 0) + dt;
    Renderer.render(game, dt);
  };

  TS.Renderer = Renderer;
})(window.TS = window.TS || {});
