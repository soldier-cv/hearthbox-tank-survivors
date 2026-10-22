/* 玩法核心：玩家、敌人、武器、升级、波次、Boss。
   坐标单位是「世界像素」，tile 40，世界 2600x2000。
   设计目标：坦克的重量感 + 幸存者的清屏快感；所有武器都自动开火，玩家只管走位。 */
(function (TS) {
  'use strict';

  var U = TS.util;
  var TAU = U.TAU;
  var WORLD_TILE = 40;

  var P1_COLOR = '#f2b13c';
  var P2_COLOR = '#58c8d8';

  // ===================================================================
  // 升级表
  // ===================================================================

  var ICONS = {
    shell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 2v7"/><path d="M8 9h8v8l-4 5-4-5z"/><path d="M9 21h6"/></svg>',
    ap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 19L20 5"/><path d="M14 4h6v6"/><path d="M4 12l4 4"/><path d="M4 5l4 4"/></svg>',
    he: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 2l2.2 6.2L21 10l-6 3.4L17 21l-5-4.6L7 21l2-7.6L3 10l6.8-1.8z"/></svg>',
    ricochet: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 18l6-6 4 4 8-9"/><path d="M15 7h6v6"/></svg>',
    wingman: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="7" y="9" width="10" height="8" rx="1"/><path d="M12 9V5"/><path d="M4 13H2m18 0h2"/><circle cx="12" cy="13" r="1.6"/></svg>',
    mine: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="13" r="6"/><path d="M12 3v4M12 19v2M3 13h4M17 13h4M6 7l2.4 2.4M15.6 16.6L18 19M18 7l-2.4 2.4M8.4 16.6L6 19"/></svg>',
    tesla: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M13 2L5 14h6l-1 8 8-12h-6z"/></svg>',
    napalm: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 3c3 4 5 6 5 9a5 5 0 01-10 0c0-2 1-3.5 2-5 0 2 1 3 2 3 0-2 .5-4 1-7z"/><path d="M12 21a4 4 0 01-4-4"/></svg>',
    shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/></svg>',
    repair: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14.5 6.5a4 4 0 00-5.3 5.3L4 17l3 3 5.2-5.2a4 4 0 005.3-5.3l-2.3 2.3-2.7-2.7z"/></svg>',
    engine: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 8h11l4 4h3v4h-3l-4 4H3z"/><path d="M6 12h6"/><path d="M8 2v4M12 2v4"/></svg>',
    armor: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M5 5h14v7c0 4-3 6.5-7 8-4-1.5-7-4-7-8z"/><path d="M5 9h14M5 13h14M12 5v15"/></svg>',
    ammo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M6 4h3v12H6zM11 4h3v12h-3zM16 4h3v12h-3z"/><path d="M6 16l1.5 4h0L9 16M11 16l1.5 4L14 16M16 16l1.5 4L19 16"/></svg>',
    scope: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="7"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/></svg>',
    magnet: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 4v8a7 7 0 0014 0V4h-4v8a3 3 0 01-6 0V4z"/></svg>',
    crit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 1v5M12 18v5M1 12h5M18 12h5"/></svg>',
    supply: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 8h16v12H4z"/><path d="M4 12h16M9 8V4h6v4"/><path d="M12 14v4M10 16h4"/></svg>'
  };

  var UPGRADE_DEFS = [
    {
      id: 'cannon', name: '主炮', kind: '主武器', max: 6, color: '#f2ad3a', icon: 'shell', weight: 1.5,
      desc: '主炮伤害 +5，射速 +9%。2 / 4 / 6 级各增加一发并联炮弹。',
      tag: function (l) { return l >= 6 ? '多炮塔' : '火力'; }
    },
    {
      id: 'ap', name: '穿甲弹', kind: '弹药', max: 4, color: '#9ad14f', icon: 'ap', weight: 1.1,
      desc: '炮弹可多穿透 1 个目标，弹速 +70，伤害 +2。',
      tag: function (l) { return l >= 4 ? '贯穿' : '穿透'; }
    },
    {
      id: 'he', name: '高爆弹', kind: '弹药', max: 3, color: '#e2543c', icon: 'he', weight: 1.2,
      desc: '炮弹命中时爆炸，范围 +42，对周围敌人与砖墙造成伤害。',
      tag: function (l) { return '爆破'; }
    },
    {
      id: 'ricochet', name: '跳弹', kind: '弹药', max: 3, color: '#58c8d8', icon: 'ricochet', weight: 0.9,
      desc: '炮弹可以从墙面弹开，额外弹跳 +1 次，伤害 +4%。',
      tag: function (l) { return l >= 3 ? '弹球' : '反弹'; }
    },
    {
      id: 'wingman', name: '僚机', kind: '自动化', max: 3, color: '#c9a0ff', icon: 'wingman', weight: 1.3,
      desc: '增加一架环绕僚机，自动索敌并开火。',
      tag: function (l) { return '无人机'; }
    },
    {
      id: 'mines', name: '布雷器', kind: '自动化', max: 4, color: '#e8a33c', icon: 'mine', weight: 1.0,
      desc: '在车尾周期性布设地雷，敌人靠近即引爆。升级提高伤害与布设频率。',
      tag: function (l) { return '陷阱'; }
    },
    {
      id: 'tesla', name: '电磁链', kind: '自动化', max: 4, color: '#7bd6ff', icon: 'tesla', weight: 1.1,
      desc: '周期电击附近敌人，升级增加连锁目标与伤害。',
      tag: function (l) { return '连锁'; }
    },
    {
      id: 'napalm', name: '燃烧弹', kind: '弹药', max: 3, color: '#ff8a4c', icon: 'napalm', weight: 0.95,
      desc: '炮弹有 22% 概率在命中处留下燃烧地带，升级提高持续伤害与触发率。',
      tag: function (l) { return '火焰'; }
    },
    {
      id: 'shield', name: '能量护盾', kind: '防御', max: 3, color: '#58c8d8', icon: 'shield', weight: 1.1,
      desc: '获得 1 层护盾，可抵挡一次伤害；护盾会自行恢复。',
      tag: function (l) { return l >= 3 ? '力场' : '护盾'; }
    },
    {
      id: 'repair', name: '维修组', kind: '防御', max: 4, color: '#9ad14f', icon: 'repair', weight: 1.0,
      desc: '每秒恢复 0.85 点生命，升级叠加。',
      tag: function (l) { return '自修'; }
    },
    {
      id: 'engine', name: '强化引擎', kind: '属性', max: 4, color: '#f2ad3a', icon: 'engine', weight: 1.0,
      desc: '移动速度 +8.5%，倒车也更快。',
      tag: function (l) { return '机动'; }
    },
    {
      id: 'armor', name: '复合装甲', kind: '属性', max: 4, color: '#b8c2c9', icon: 'armor', weight: 1.0,
      desc: '生命上限 +18，受到的所有伤害 -1.5。',
      tag: function (l) { return '生存'; }
    },
    {
      id: 'ammo', name: '弹药架', kind: '属性', max: 4, color: '#e8a33c', icon: 'ammo', weight: 1.0,
      desc: '射击间隔 -10%。',
      tag: function (l) { return '射速'; }
    },
    {
      id: 'scope', name: '瞄准镜', kind: '属性', max: 3, color: '#58c8d8', icon: 'scope', weight: 0.95,
      desc: '自动瞄准射程 +55，炮弹速度 +45。',
      tag: function (l) { return '射程'; }
    },
    {
      id: 'magnet', name: '磁力回收', kind: '属性', max: 3, color: '#9ad14f', icon: 'magnet', weight: 0.95,
      desc: '经验拾取范围 +36，获得经验 +10%。',
      tag: function (l) { return '拾取'; }
    },
    {
      id: 'crit', name: '穿甲瞄具', kind: '属性', max: 3, color: '#e2543c', icon: 'crit', weight: 0.9,
      desc: '暴击率 +7%，暴击伤害 +20%。',
      tag: function (l) { return '暴击'; }
    }
  ];

  var DEF_BY_ID = {};
  UPGRADE_DEFS.forEach(function (d) { DEF_BY_ID[d.id] = d; });

  // ===================================================================
  // 敌人模板
  // ===================================================================

  var ENEMY_TYPES = {
    grunt: {
      r: 15, hp: 22, speed: 62, dmg: 11, xp: 1, score: 12, color: '#d9533f',
      name: '轻型坦克', tread: '#8d3227'
    },
    runner: {
      r: 12, hp: 14, speed: 116, dmg: 8, xp: 1, score: 14, color: '#e8a33c',
      name: '侦察车', tread: '#8a5a1c'
    },
    gunner: {
      r: 16, hp: 38, speed: 54, dmg: 10, xp: 2, score: 22, color: '#b46bd6',
      name: '炮手', tread: '#5f3574', shoot: true, shootCd: 2.3, shootRange: 380, bulletDmg: 9
    },
    brute: {
      r: 24, hp: 150, speed: 40, dmg: 22, xp: 4, score: 40, color: '#9c4a3a',
      name: '重装坦克', tread: '#4e241c'
    },
    bomber: {
      r: 17, hp: 30, speed: 92, dmg: 12, xp: 3, score: 30, color: '#e0432b',
      name: '自爆车', tread: '#7c1d12', explodeOnDeath: true
    }
  };

  // ===================================================================
  // 空间网格：只用于敌人相互排斥与子弹查询
  // ===================================================================

  function Grid(cell) {
    this.cell = cell || 80;
    this.map = new Map();
  }

  Grid.prototype.clear = function () { this.map.clear(); };

  Grid.prototype._key = function (gx, gy) { return gx * 100000 + gy; };

  Grid.prototype.insert = function (e) {
    var gx = Math.floor(e.x / this.cell), gy = Math.floor(e.y / this.cell);
    var k = this._key(gx, gy);
    var arr = this.map.get(k);
    if (!arr) { arr = []; this.map.set(k, arr); }
    arr.push(e);
  };

  Grid.prototype.query = function (x, y, r, out) {
    out.length = 0;
    var c = this.cell;
    var minX = Math.floor((x - r) / c), maxX = Math.floor((x + r) / c);
    var minY = Math.floor((y - r) / c), maxY = Math.floor((y + r) / c);
    for (var gy = minY; gy <= maxY; gy++) {
      for (var gx = minX; gx <= maxX; gx++) {
        var arr = this.map.get(this._key(gx, gy));
        if (!arr) continue;
        for (var i = 0; i < arr.length; i++) out.push(arr[i]);
      }
    }
    return out;
  };

  // ===================================================================
  // Game
  // ===================================================================

  function Game(opts) {
    this.onEvent = opts && opts.onEvent ? opts.onEvent : function () {};
    this.state = 'idle';
    this.view = { w: 1280, h: 800 };
    this.baseScale = 1;
    this.pendingLevels = 0;
    this.offers = [];
    this.cam = { x: 0, y: 0, zoom: 1, targetZoom: 1 };
    this.shake = 0;
    this.flash = 0;
    this.hitStop = 0;
    this.elapsedReal = 0;
    this.players = [];
    this.bullets = [];
    this.ebullets = [];
    this.enemies = [];
    this.pickups = [];
    this.particles = [];
    this.texts = [];
    this.puddles = [];
    this.mines = [];
    this.arcs = [];
    this.decals = [];
    this.drones = [];
    this.grid = new Grid(90);
    this._q = [];
    this._q2 = [];
    this.lastSpawnAttempt = 0;
  }

  Game.prototype.emit = function (name, data) {
    this.onEvent(name, data);
  };

  Game.prototype.xpNeed = function (level) {
    return Math.round(10 + level * 7 + Math.pow(level, 1.4));
  };

  Game.prototype.start = function (playerCount, seed) {
    this.seed = seed || (Date.now() % 0xffffffff);
    this.rng = new U.RNG(this.seed);
    this.world = new TS.World(this.seed);
    this.playerCount = playerCount;
    this.state = 'playing';
    this.time = 0;
    this.realTime = 0;
    this.level = 1;
    this.xp = 0;
    this.xpNeedNow = this.xpNeed(1);
    this.pendingLevels = 0;
    this.offers = [];

    this.kills = 0;
    this.totalSpawned = 0;
    this.score = 0;
    this.teamDamage = 0;

    this.bullets.length = 0;
    this.ebullets.length = 0;
    this.enemies.length = 0;
    this.pickups.length = 0;
    this.particles.length = 0;
    this.texts.length = 0;
    this.puddles.length = 0;
    this.mines.length = 0;
    this.arcs.length = 0;
    this.decals.length = 0;
    this.drones.length = 0;

    this.shake = 0;
    this.flash = 0;
    this.hitStop = 0;
    this.endTimer = 0;
    this.winTimer = 0;
    this.boss = null;
    this.bossSpawned = [false, false];
    this.nextWave = 30;
    this.waveIndex = 0;
    this.spawnAcc = 0;
    this.spawnCap = 165;
    this.over = false;
    this.won = false;

    var cx = this.world.w / 2, cy = this.world.h / 2;
    this.players = [];
    for (var i = 0; i < playerCount; i++) {
      var px = cx + (i === 0 ? -46 : 46);
      this.players.push(this.makePlayer(i, px, cy, i === 0 ? P1_COLOR : P2_COLOR));
    }
    // 单人时站位居中
    if (playerCount === 1) this.players[0].x = cx;

    this.cam.x = cx;
    this.cam.y = cy;
    this.cam.zoom = 1;
    this.cam.targetZoom = 1;

    this.emit('start', { game: this });
  };

  Game.prototype.makePlayer = function (index, x, y, color) {
    var p = {
      index: index,
      name: index === 0 ? 'P1' : 'P2',
      color: color,
      x: x, y: y,
      vx: 0, vy: 0,
      r: 14,
      angle: -Math.PI / 2,
      aimAngle: -Math.PI / 2,
      turretAngle: -Math.PI / 2,
      fireCd: 0,
      dashCd: 0,
      dashTime: 0,
      invuln: 0,
      hurtFlash: 0,
      bombs: 3,
      shield: 0,
      shieldCd: 0,
      alive: true,
      downed: false,
      reviveT: 0,
      reviveR: 2.2,
      up: { cannon: 1 },
      stats: null,
      mineCd: 0,
      teslaCd: 0,
      droneCd: 0,
      kills: 0,
      damage: 0,
      lastDash: false,
      lastBomb: false,
      recoil: 0,
      treadT: 0
    };
    p.stats = this.calcStats(p);
    p.hp = p.stats.maxHp;
    p.maxHp = p.stats.maxHp;
    return p;
  };

  Game.prototype.calcStats = function (p) {
    var u = p.up;
    var at = function (id) { return u[id] || 0; };
    var s = {};
    s.damage = 16 + at('cannon') * 5 + at('ap') * 2;
    s.fireInterval = 0.42 / (1 + at('cannon') * 0.09 + at('ammo') * 0.10);
    s.projectiles = 1 + (at('cannon') >= 2 ? 1 : 0) + (at('cannon') >= 4 ? 1 : 0) + (at('cannon') >= 6 ? 1 : 0);
    s.pierce = at('ap');
    s.bulletSpeed = 520 + at('ap') * 70 + at('scope') * 45;
    s.range = 465 + at('scope') * 55;
    s.explosive = at('he') ? 34 + at('he') * 20 : 0;
    s.bounce = at('ricochet');
    s.crit = 0.05 + at('crit') * 0.07;
    s.critMul = 1.7 + at('crit') * 0.2;
    s.maxHp = 100 + at('armor') * 18;
    s.speed = 198 * (1 + at('engine') * 0.085);
    s.pickup = 92 + at('magnet') * 36;
    s.xpMult = 1 + at('magnet') * 0.10;
    s.regen = at('repair') * 0.85;
    s.shieldMax = Math.min(3, at('shield'));
    s.shieldRecharge = 9.5 - at('shield') * 1.6;
    s.drones = at('wingman');
    s.mineLvl = at('mines');
    s.teslaLvl = at('tesla');
    s.napalmLvl = at('napalm');
    s.armorFlat = at('armor') * 1.5;
    s.ricochetDmg = 1 + at('ricochet') * 0.04;
    return s;
  };

  // -------------------------------------------------------------------
  // 主更新
  // -------------------------------------------------------------------

  Game.prototype.update = function (dt) {
    if (this.state !== 'playing') return;
    if (this.hitStop > 0) {
      this.hitStop -= dt;
      dt *= 0.22;
    }
    this.realTime += dt;
    this.time += dt;
    this.shake = Math.max(0, this.shake - dt * 46);
    this.flash = Math.max(0, this.flash - dt * 3.2);

    this.updateCamera(dt);
    this.updatePlayers(dt);
    this.updateDrones(dt);
    this.updateEnemies(dt);
    this.updateBullets(dt);
    this.updateEnemyBullets(dt);
    this.updateMines(dt);
    this.updateTesla(dt);
    this.updatePuddles(dt);
    this.updatePickups(dt);
    this.updateEffects(dt);
    this.updateDecals(dt);
    this.updateSpawning(dt);
    this.updateEvents(dt);

    if (this.endTimer > 0) {
      this.endTimer -= dt;
      if (this.endTimer <= 0) this.finish(false);
    }
    if (this.winTimer > 0) {
      this.winTimer -= dt;
      if (this.winTimer <= 0) this.finish(true);
    }
  };

  Game.prototype.updateCamera = function (dt) {
    var ps = this.players;
    var cx = 0, cy = 0, n = 0;
    var spread = 0;
    for (var i = 0; i < ps.length; i++) {
      if (!ps[i].alive && !ps[i].downed) continue;
      cx += ps[i].x; cy += ps[i].y; n++;
    }
    if (n === 0) { cx = this.cam.x; cy = this.cam.y; }
    else { cx /= n; cy /= n; }
    if (n >= 2) {
      spread = U.dist(ps[0].x, ps[0].y, ps[1].x, ps[1].y);
    }
    var targetZoom = U.clamp(1.04 - spread / 2400, 0.68, 1.04);

    this.cam.x = U.damp(this.cam.x, cx, 7, dt);
    this.cam.y = U.damp(this.cam.y, cy, 7, dt);
    this.cam.zoom = U.damp(this.cam.zoom, targetZoom, 3.2, dt);

    // 视野边界：不让镜头露出世界之外
    var scale = this.baseScale * this.cam.zoom;
    var halfW = this.view.w / scale / 2;
    var halfH = this.view.h / scale / 2;
    if (this.world.w > halfW * 2) {
      this.cam.x = U.clamp(this.cam.x, halfW, this.world.w - halfW);
    } else {
      this.cam.x = this.world.w / 2;
    }
    if (this.world.h > halfH * 2) {
      this.cam.y = U.clamp(this.cam.y, halfH, this.world.h - halfH);
    } else {
      this.cam.y = this.world.h / 2;
    }
  };

  // -------------------------------------------------------------------
  // 玩家
  // -------------------------------------------------------------------

  Game.prototype.updatePlayers = function (dt) {
    for (var i = 0; i < this.players.length; i++) {
      var p = this.players[i];
      if (!p.alive) {
        if (p.downed) this.updateDowned(p, dt);
        continue;
      }
      var inp = TS.Input.players[p.index];

      var imx = inp.moveX, imy = inp.moveY;
      var imm = Math.hypot(imx, imy);
      if (imm > 1) { imx /= imm; imy /= imm; imm = 1; }

      // 冲刺
      if (inp.dash && !p.lastDash && p.dashCd <= 0) {
        p.dashTime = 0.17;
        p.dashCd = 1.45;
        p.invuln = Math.max(p.invuln, 0.3);
        // 没有移动输入时沿炮口方向冲刺，避免原地空放
        if (imm > 0.2) {
          p.dashDirX = imx / imm;
          p.dashDirY = imy / imm;
        } else {
          p.dashDirX = Math.cos(p.aimAngle);
          p.dashDirY = Math.sin(p.aimAngle);
        }
        this.addParticles(p.x, p.y, 10, p.color, 120, 4, 0.35);
        TS.Audio.sfx('dash');
        TS.Input.rumble(p.index, 90, 0.35, 0.2);
      }
      p.lastDash = inp.dash;
      p.dashCd = Math.max(0, p.dashCd - dt);
      p.dashTime = Math.max(0, p.dashTime - dt);

      // 炸弹
      if (inp.bomb && !p.lastBomb) this.useBomb(p);
      p.lastBomb = inp.bomb;

      var spd = p.stats.speed * (p.dashTime > 0 ? 3.1 : 1);
      var mx = imx, my = imy;
      if (p.dashTime > 0 && imm < 0.2) {
        mx = p.dashDirX || Math.cos(p.aimAngle);
        my = p.dashDirY || Math.sin(p.aimAngle);
      }
      p.vx = U.damp(p.vx, mx * spd, 13, dt);
      p.vy = U.damp(p.vy, my * spd, 13, dt);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      this.world.resolveCircle(p, p.r);

      var moving = Math.hypot(p.vx, p.vy) > 22;
      if (moving) {
        p.angle = U.angleLerp(p.angle, Math.atan2(p.vy, p.vx), 1 - Math.exp(-10 * dt));
        // 履带印：按时间节流，别每帧都塞
        p.treadT -= dt;
        if (p.treadT <= 0) {
          p.treadT = 0.075;
          var perp = p.angle + Math.PI / 2;
          var side = 10;
          for (var sgn = -1; sgn <= 1; sgn += 2) {
            this.addDecal(
              p.x + Math.cos(perp) * side * sgn,
              p.y + Math.sin(perp) * side * sgn,
              p.angle, '#000000', 0.26
            );
          }
        }
      }

      // 瞄准：右摇杆优先，否则自动锁定最近目标
      var target = this.nearestEnemy(p.x, p.y, p.stats.range);
      if (inp.aimActive) {
        p.aimAngle = Math.atan2(inp.aimY, inp.aimX);
      } else if (target) {
        var lead = U.dist(p.x, p.y, target.x, target.y) / p.stats.bulletSpeed;
        var tx = target.x + target.vx * lead;
        var ty = target.y + target.vy * lead;
        p.aimAngle = Math.atan2(ty - p.y, tx - p.x);
      } else if (moving) {
        p.aimAngle = U.angleLerp(p.aimAngle, Math.atan2(p.vy, p.vx), 1 - Math.exp(-4 * dt));
      }
      p.turretAngle = U.angleLerp(p.turretAngle, p.aimAngle, 1 - Math.exp(-18 * dt));

      // 主炮
      p.fireCd -= dt;
      p.recoil = Math.max(0, p.recoil - dt * 8);
      var wantsFire = target || inp.aimActive;
      if (wantsFire && p.fireCd <= 0) {
        this.fireCannon(p);
        p.fireCd = p.stats.fireInterval;
      }

      // 地雷
      if (p.stats.mineLvl > 0) {
        p.mineCd -= dt;
        if (p.mineCd <= 0) {
          p.mineCd = Math.max(1.6, 4.2 - p.stats.mineLvl * 0.55);
          this.dropMine(p);
        }
      }

      // 护盾
      p.shieldCd = Math.max(0, p.shieldCd - dt);
      if (p.stats.shieldMax > 0 && p.shield < p.stats.shieldMax && p.shieldCd <= 0) {
        p.shield++;
        p.shieldCd = p.stats.shieldRecharge;
        this.emit('toast', '护盾已充能');
      }

      // 回复
      if (p.stats.regen > 0 && p.hp < p.maxHp) {
        p.hp = Math.min(p.maxHp, p.hp + p.stats.regen * dt);
      }

      p.invuln = Math.max(0, p.invuln - dt);
      p.hurtFlash = Math.max(0, p.hurtFlash - dt);

      if (p.dashTime > 0 && Math.random() < 0.7) {
        this.addParticles(p.x, p.y, 1, p.color, 40, 3, 0.25);
      }
    }
  };

  Game.prototype.updateDowned = function (p, dt) {
    // 队友靠近即可救援，两人都倒下就结束
    var helper = null;
    for (var i = 0; i < this.players.length; i++) {
      var q = this.players[i];
      if (q !== p && q.alive && U.dist(q.x, q.y, p.x, p.y) < 58) { helper = q; break; }
    }
    if (helper) {
      p.reviveT += dt;
      helper.reviveTarget = p;
      if (Math.random() < 0.35) {
        this.addParticles(p.x, p.y, 1, helper.color, 50, 3, 0.3);
      }
      if (p.reviveT >= p.reviveR) {
        p.alive = true;
        p.downed = false;
        p.hp = Math.round(p.maxHp * 0.5);
        p.invuln = 2;
        p.dashCd = 0;
        p.reviveT = 0;
        helper.reviveTarget = null;
        this.flash = 0.35;
        this.addText(p.x, p.y - 24, '归队', helper.color, 20);
        this.addParticles(p.x, p.y, 26, helper.color, 190, 4, 0.6);
        TS.Audio.sfx('revive');
        this.endTimer = 0;
        this.emit('toast', p.name + ' 已被 ' + helper.name + ' 救回');
      }
    } else {
      p.reviveT = Math.max(0, p.reviveT - dt * 0.8);
      if (helper && p.reviveT <= 0) helper.reviveTarget = null;
    }
    if (!this.anyAlive() && this.endTimer <= 0) {
      this.endTimer = 1.5;
    }
  };

  Game.prototype.anyAlive = function () {
    for (var i = 0; i < this.players.length; i++) if (this.players[i].alive) return true;
    return false;
  };

  Game.prototype.nearestEnemy = function (x, y, maxDist) {
    var best = null, bestD = maxDist * maxDist;
    for (var i = 0; i < this.enemies.length; i++) {
      var e = this.enemies[i];
      if (e.dead) continue;
      var d = U.dist2(x, y, e.x, e.y);
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  };

  Game.prototype.fireCannon = function (p) {
    var n = p.stats.projectiles;
    var spread = 0.10;
    var base = p.turretAngle;
    for (var i = 0; i < n; i++) {
      var off = (i - (n - 1) / 2) * spread;
      this.spawnBullet(p, base + off + (Math.random() - 0.5) * 0.018);
    }
    p.recoil = 1;
    this.addParticles(
      p.x + Math.cos(base) * 26, p.y + Math.sin(base) * 26,
      3, '#ffd47a', 90, 3, 0.18
    );
    TS.Audio.sfx(n > 1 ? 'shootHeavy' : 'shoot');
  };

  Game.prototype.spawnBullet = function (p, angle) {
    var crit = Math.random() < p.stats.crit;
    var dmg = p.stats.damage * (crit ? p.stats.critMul : 1);
    var b = {
      x: p.x + Math.cos(angle) * 25,
      y: p.y + Math.sin(angle) * 25,
      vx: Math.cos(angle) * p.stats.bulletSpeed,
      vy: Math.sin(angle) * p.stats.bulletSpeed,
      r: 3.4,
      dmg: dmg,
      crit: crit,
      pierce: p.stats.pierce,
      bounce: p.stats.bounce,
      explosive: p.stats.explosive,
      napalm: p.stats.napalmLvl,
      ricochetDmg: p.stats.ricochetDmg,
      owner: p.index,
      color: p.color,
      life: 1.5,
      hit: [],
      angle: angle
    };
    this.bullets.push(b);
  };

  Game.prototype.useBomb = function (p) {
    if (p.bombs <= 0) {
      TS.Audio.sfx('deny');
      this.emit('toast', p.name + ' 没有炸弹了');
      return;
    }
    p.bombs--;
    var R = 360;
    this.flash = 0.75;
    this.shake = 24;
    this.addParticles(p.x, p.y, 46, '#ffb347', 320, 6, 0.8);
    this.addParticles(p.x, p.y, 26, '#f3ecdd', 220, 9, 0.55);
    TS.Audio.sfx('bomb');
    TS.Input.rumble(p.index, 350, 1, 0.7);

    // 清弹 + 伤害
    for (var i = this.ebullets.length - 1; i >= 0; i--) {
      var eb = this.ebullets[i];
      if (U.dist2(p.x, p.y, eb.x, eb.y) < R * R) this.ebullets.splice(i, 1);
    }
    for (var j = this.enemies.length - 1; j >= 0; j--) {
      var e = this.enemies[j];
      if (e.dead) continue;
      var d = U.dist(p.x, p.y, e.x, e.y);
      if (d < R + e.r) {
        this.hitEnemy(e, 150 + this.level * 6, { noText: false });
      }
    }
    this.damageTilesInRadius(p.x, p.y, 130, 999);
    this.emit('toast', '战术炸弹');
  };

  // -------------------------------------------------------------------
  // 僚机
  // -------------------------------------------------------------------

  Game.prototype.updateDrones = function (dt) {
    // 按玩家重建本案的僚机列表（升级后立刻出现）
    var wanted = [];
    for (var i = 0; i < this.players.length; i++) {
      var p = this.players[i];
      if (!p.alive) continue;
      for (var d = 0; d < p.stats.drones; d++) {
        wanted.push({ p: p, i: i, d: d });
      }
    }
    while (this.drones.length < wanted.length) {
      this.drones.push({ phase: Math.random() * TAU, x: 0, y: 0, cd: 0, owner: 0, idx: 0 });
    }
    while (this.drones.length > wanted.length) this.drones.pop();

    for (var k = 0; k < wanted.length; k++) {
      var spec = wanted[k];
      var dr = this.drones[k];
      dr.owner = spec.p.index;
      dr.idx = spec.i;
      dr.phase += dt * (1.1 + spec.d * 0.12);
      var radius = 54 + spec.d * 14;
      dr.x = spec.p.x + Math.cos(dr.phase + spec.d * 2.1) * radius;
      dr.y = spec.p.y + Math.sin(dr.phase + spec.d * 2.1) * radius;
      dr.cd -= dt;
      var target = this.nearestEnemy(dr.x, dr.y, 430);
      if (target && dr.cd <= 0) {
        dr.cd = 1.05;
        var ang = Math.atan2(target.y - dr.y, target.x - dr.x);
        var dmg = spec.p.stats.damage * 0.55;
        this.bullets.push({
          x: dr.x, y: dr.y,
          vx: Math.cos(ang) * 620, vy: Math.sin(ang) * 620,
          r: 3, dmg: dmg, crit: false, pierce: 0, bounce: 0,
          explosive: Math.floor(spec.p.stats.explosive * 0.5),
          napalm: 0, ricochetDmg: 1, owner: spec.p.index,
          color: '#c9a0ff', life: 1.2, hit: [], angle: ang
        });
        this.addParticles(dr.x, dr.y, 2, '#c9a0ff', 60, 2, 0.15);
      }
    }
  };

  // -------------------------------------------------------------------
  // 地雷 / 电磁 / 燃烧
  // -------------------------------------------------------------------

  Game.prototype.dropMine = function (p) {
    var lvl = p.stats.mineLvl;
    var ang = p.angle + Math.PI + (Math.random() - 0.5) * 0.5;
    var x = p.x + Math.cos(ang) * 26;
    var y = p.y + Math.sin(ang) * 26;
    if (!this.world.areaFree(x, y, 12)) { x = p.x; y = p.y; }
    this.mines.push({
      x: x, y: y, r: 12, arm: 0.45, life: 12,
      dmg: 55 + lvl * 30, radius: 78 + lvl * 8, owner: p.index, pulse: 0
    });
    if (this.mines.length > 30) this.mines.shift();
  };

  Game.prototype.updateMines = function (dt) {
    for (var i = this.mines.length - 1; i >= 0; i--) {
      var m = this.mines[i];
      m.arm -= dt;
      m.life -= dt;
      m.pulse += dt;
      var boom = false;
      if (m.arm <= 0) {
        for (var j = 0; j < this.enemies.length; j++) {
          var e = this.enemies[j];
          if (e.dead) continue;
          if (U.dist2(m.x, m.y, e.x, e.y) < (e.r + 42) * (e.r + 42)) { boom = true; break; }
        }
      }
      if (m.life <= 0) boom = true;
      if (boom) {
        this.mines.splice(i, 1);
        this.explodeAt(m.x, m.y, m.radius, m.dmg, m.owner, '#ffb347');
      }
    }
  };

  Game.prototype.updateTesla = function (dt) {
    for (var i = 0; i < this.players.length; i++) {
      var p = this.players[i];
      if (!p.alive || !p.stats.teslaLvl) continue;
      p.teslaCd -= dt;
      if (p.teslaCd > 0) continue;
      p.teslaCd = Math.max(1.1, 2.9 - p.stats.teslaLvl * 0.28);
      var maxTargets = 1 + p.stats.teslaLvl;
      var origin = { x: p.x, y: p.y };
      var hit = [];
      var pts = [origin];
      for (var t = 0; t < maxTargets; t++) {
        var best = null, bestD = 300 * 300;
        for (var j = 0; j < this.enemies.length; j++) {
          var e = this.enemies[j];
          if (e.dead || hit.indexOf(e) >= 0) continue;
          var d = U.dist2(origin.x, origin.y, e.x, e.y);
          if (d < bestD) { bestD = d; best = e; }
        }
        if (!best) break;
        hit.push(best);
        pts.push({ x: best.x, y: best.y });
        this.hitEnemy(best, 18 + p.stats.teslaLvl * 9, {});
        origin = best;
      }
      if (pts.length > 1) {
        this.arcs.push({ pts: pts, life: 0.16, color: '#7bd6ff' });
        TS.Audio.sfx('hit');
      }
    }
  };

  Game.prototype.updatePuddles = function (dt) {
    for (var i = this.puddles.length - 1; i >= 0; i--) {
      var p = this.puddles[i];
      p.life -= dt;
      p.tick -= dt;
      if (p.tick <= 0) {
        p.tick = 0.3;
        for (var j = 0; j < this.enemies.length; j++) {
          var e = this.enemies[j];
          if (e.dead) continue;
          if (U.dist2(p.x, p.y, e.x, e.y) < (p.r + e.r) * (p.r + e.r)) {
            this.hitEnemy(e, p.dps * 0.3, { noText: true, fire: true });
          }
        }
      }
      if (Math.random() < 0.4) {
        this.addParticles(p.x + (Math.random() - 0.5) * p.r, p.y + (Math.random() - 0.5) * p.r, 1, '#ff8a4c', 40, 3, 0.4);
      }
      if (p.life <= 0) this.puddles.splice(i, 1);
    }
  };

  // -------------------------------------------------------------------
  // 敌人
  // -------------------------------------------------------------------

  Game.prototype.updateEnemies = function (dt) {
    this.grid.clear();
    for (var i = 0; i < this.enemies.length; i++) {
      if (!this.enemies[i].dead) this.grid.insert(this.enemies[i]);
    }

    for (var k = this.enemies.length - 1; k >= 0; k--) {
      var e = this.enemies[k];
      if (e.dead) { this.enemies.splice(k, 1); continue; }

      e.flash = Math.max(0, e.flash - dt);
      var target = this.nearestPlayer(e.x, e.y);
      if (!target) continue;

      var dx = target.x - e.x, dy = target.y - e.y;
      var dist = Math.hypot(dx, dy) || 1;
      var nx = dx / dist, ny = dy / dist;

      if (e.type === 'boss') {
        this.updateBoss(e, target, nx, ny, dist, dt);
      } else {
        var desiredSpeed = e.speed;
        var vx = nx, vy = ny;
        // 炮手保持中距离
        if (e.template.shoot) {
          if (dist < 210) { vx = -nx; vy = -ny; }
          else if (dist < e.template.shootRange * 0.7) {
            // 侧移
            vx = -ny * e.strafe;
            vy = nx * e.strafe;
          }
        }
        // 分离：避免所有坦克叠在一条线上
        var q = this.grid.query(e.x, e.y, 54, this._q);
        for (var s = 0; s < q.length; s++) {
          var o = q[s];
          if (o === e || o.dead) continue;
          var ddx = e.x - o.x, ddy = e.y - o.y;
          var dd = Math.hypot(ddx, ddy);
          if (dd > 0.001 && dd < e.r + o.r + 12) {
            var push = (1 - dd / (e.r + o.r + 12));
            vx += (ddx / dd) * push * 1.5;
            vy += (ddy / dd) * push * 1.5;
          }
        }
        var vm = Math.hypot(vx, vy) || 1;
        vx /= vm; vy /= vm;

        // 撞墙后沿切向绕行
        if (e.wallT > 0) {
          e.wallT -= dt;
          vx += -ny * e.wallSign * 1.1;
          vy += nx * e.wallSign * 1.1;
        }

        e.vx = U.damp(e.vx, vx * desiredSpeed, 7, dt);
        e.vy = U.damp(e.vy, vy * desiredSpeed, 7, dt);
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        if (this.world.resolveCircle(e, e.r * 0.92)) {
          if (e.wallT <= 0) {
            e.wallT = 0.55;
            e.wallSign = this.rng.chance(0.5) ? 1 : -1;
          }
          this.chewWall(e, nx, ny, dt);
          e.vx *= 0.4;
          e.vy *= 0.4;
        }
        if (e.vx || e.vy) e.angle = U.angleLerp(e.angle, Math.atan2(e.vy, e.vx), 1 - Math.exp(-8 * dt));

        // 炮手开火
        if (e.template.shoot) {
          e.fireCd -= dt;
          if (dist < e.template.shootRange && e.fireCd <= 0) {
            e.fireCd = e.template.shootCd * this.rng.range(0.85, 1.2);
            var lead = dist / 330;
            var ax = target.x + target.vx * lead - e.x;
            var ay = target.y + target.vy * lead - e.y;
            var aa = Math.atan2(ay, ax);
            this.spawnEnemyBullet(e.x + Math.cos(aa) * 18, e.y + Math.sin(aa) * 18, aa, 200, e.template.bulletDmg);
            TS.Audio.sfx('shoot');
          }
        }
      }

      // 接触伤害
      for (var pi = 0; pi < this.players.length; pi++) {
        var p = this.players[pi];
        if (!p.alive) continue;
        var rr = e.r + p.r - 2;
        if (U.dist2(e.x, e.y, p.x, p.y) < rr * rr) {
          if (e.type === 'boss') this.hurtPlayer(p, 26 + Math.floor(this.time / 120));
          else this.hurtPlayer(p, e.template.dmg);
          var kx = e.x - p.x, ky = e.y - p.y, km = Math.hypot(kx, ky) || 1;
          e.x += (kx / km) * 6;
          e.y += (ky / km) * 6;
          p.vx -= (kx / km) * 60;
          p.vy -= (ky / km) * 60;
        }
      }
    }

    // 自爆车死亡统一下沉到 killEnemy 处理
  };

  // 被墙挡住时啃掉面前的砖墙：没有寻路，至少别让整波兵永久卡在墙后面
  Game.prototype.chewWall = function (e, nx, ny, dt) {
    var t = WORLD_TILE;
    var ex = Math.floor(e.x / t), ey = Math.floor(e.y / t);
    var best = null, bestDot = -2;
    for (var ox = -1; ox <= 1; ox++) {
      for (var oy = -1; oy <= 1; oy++) {
        var tx = ex + ox, ty = ey + oy;
        if (this.world.typeAt(tx, ty) !== TS.World.BRICK) continue;
        var ccx = tx * t + t / 2, ccy = ty * t + t / 2;
        var d = Math.hypot(ccx - e.x, ccy - e.y) || 1;
        if (d > e.r + t * 1.4) continue;
        var dot = ((ccx - e.x) / d) * nx + ((ccy - e.y) / d) * ny;
        if (dot > bestDot) { bestDot = dot; best = { tx: tx, ty: ty, x: ccx, y: ccy }; }
      }
    }
    if (!best || bestDot < 0.15) return;
    var dps = e.boss ? 110 : (e.type === 'brute' ? 24 : (e.type === 'bomber' ? 16 : 11));
    var res = this.world.damageTile(best.tx, best.ty, dps * dt);
    if (res === 'destroyed') {
      this.addParticles(best.x, best.y, 7, '#b5613c', 110, 4, 0.5);
      this.addParticles(best.x, best.y, 2, '#3a3a38', 70, 6, 0.6);
      TS.Audio.sfx('brick');
    }
  };

  Game.prototype.nearestPlayer = function (x, y) {    var best = null, bestD = Infinity;
    for (var i = 0; i < this.players.length; i++) {
      var p = this.players[i];
      if (!p.alive) continue;
      var d = U.dist2(x, y, p.x, p.y);
      if (d < bestD) { bestD = d; best = p; }
    }
    return best;
  };

  Game.prototype.spawnEnemy = function (type, x, y, elite) {
    // 软上限：波次和 BOSS 召唤也不能无限堆，否则后期帧率和可读性一起崩
    if (this.enemies.length >= this.spawnCap + 35) return null;
    if (!type) {
      var t = this.time;
      var roll = this.rng.next();
      if (t < 45) type = roll < 0.72 ? 'grunt' : 'runner';
      else if (t < 120) type = roll < 0.56 ? 'grunt' : roll < 0.82 ? 'runner' : 'gunner';
      else if (t < 240) type = roll < 0.40 ? 'grunt' : roll < 0.62 ? 'runner' : roll < 0.82 ? 'gunner' : 'brute';
      else type = roll < 0.28 ? 'grunt' : roll < 0.48 ? 'runner' : roll < 0.70 ? 'gunner' : roll < 0.86 ? 'brute' : 'bomber';
    }
    var def = ENEMY_TYPES[type];
    if (!def) return null;

    var hpMul = 1 + this.time / 100;
    var spdMul = Math.min(1.5, 1 + this.time / 700);
    if (elite) hpMul *= 4.2;

    var e = {
      id: (this._eid = (this._eid || 0) + 1),
      type: type,
      template: def,
      x: x, y: y,
      vx: 0, vy: 0,
      r: def.r * (elite ? 1.32 : 1),
      hp: def.hp * hpMul,
      maxHp: def.hp * hpMul,
      speed: def.speed * spdMul * (elite ? 0.86 : 1),
      dmg: def.dmg * (1 + this.time / 420),
      angle: this.rng.next() * TAU,
      flash: 0,
      fireCd: this.rng.range(0.6, 2.2),
      elite: !!elite,
      boss: false,
      dead: false,
      wallT: 0,
      wallSign: 1,
      strafe: this.rng.chance(0.5) ? 1 : -1,
      xp: def.xp * (elite ? 5 : 1),
      score: def.score * (elite ? 5 : 1)
    };
    this.enemies.push(e);
    this.totalSpawned++;
    return e;
  };

  Game.prototype.spawnBoss = function (final) {
    var cam = this.cam;
    var pos = this.world.findSpawn(this.rng, cam.x, cam.y, 500, 640, 50);
    if (!pos) pos = { x: this.world.w / 2, y: this.world.h / 2 };
    var hp = final ? 8200 : 2800;
    var e = {
      id: (this._eid = (this._eid || 0) + 1),
      type: 'boss',
      template: {
        name: final ? '终焉要塞' : '重装坦克',
        color: final ? '#ff5a3c' : '#d9533f',
        dmg: final ? 34 : 24
      },
      boss: true,
      final: !!final,
      x: pos.x, y: pos.y,
      vx: 0, vy: 0,
      r: final ? 46 : 36,
      hp: hp, maxHp: hp,
      speed: final ? 68 : 58,
      dmg: final ? 34 : 24,
      angle: 0,
      flash: 0,
      fireCd: 1.5,
      summonCd: 6,
      chargeCd: 8,
      chargeT: 0,
      spin: 0,
      elite: false,
      dead: false,
      wallT: 0,
      wallSign: 1,
      xp: final ? 60 : 35,
      score: final ? 2000 : 800
    };
    this.enemies.push(e);
    this.boss = e;
    this.shake = 16;
    TS.Audio.sfx('boss');
    this.emit('boss', e);
    this.emit('toast', (final ? '终焉要塞来袭' : '重装坦克来袭') + ' · 击毁它');
    return e;
  };

  Game.prototype.updateBoss = function (e, target, nx, ny, dist, dt) {
    // 慢慢压过来，隔一段时间冲撞
    var speed = e.speed;
    if (e.chargeCd > 0) e.chargeCd -= dt;
    if (e.chargeCd <= 0 && e.chargeT <= 0 && dist < 700) {
      e.chargeT = 0.55;
      e.chargeCd = 9;
      e.chargeVx = nx * 380;
      e.chargeVy = ny * 380;
      this.shake = 8;
    }
    if (e.chargeT > 0) {
      e.chargeT -= dt;
      e.vx = e.chargeVx;
      e.vy = e.chargeVy;
    } else {
      var desired = dist > 240 ? 1 : -0.3;
      e.vx = U.damp(e.vx, nx * speed * desired, 3, dt);
      e.vy = U.damp(e.vy, ny * speed * desired, 3, dt);
    }
    e.x += e.vx * dt;
    e.y += e.vy * dt;
    if (this.world.resolveCircle(e, e.r * 0.9)) {
      e.chargeT = 0;
      this.chewWall(e, nx, ny, dt);
    }
    e.angle = U.angleLerp(e.angle, Math.atan2(ny, nx), 1 - Math.exp(-3 * dt));

    e.fireCd -= dt;
    if (e.fireCd <= 0) {
      e.fireCd = e.final ? 1.75 : 2.3;
      e.spin += e.final ? 0.42 : 0.55;
      var count = e.final ? 18 : 12;
      for (var i = 0; i < count; i++) {
        var a = e.spin + (i / count) * TAU;
        this.spawnEnemyBullet(e.x + Math.cos(a) * e.r, e.y + Math.sin(a) * e.r, a, e.final ? 250 : 215, e.final ? 16 : 12, '#ff7a5c', 5);
      }
      if (e.final) {
        // 终焉要塞额外打一组瞄准三连
        var aa = Math.atan2(target.y - e.y, target.x - e.x);
        for (var k = -1; k <= 1; k++) {
          this.spawnEnemyBullet(e.x, e.y, aa + k * 0.13, 330, 20, '#ffd166', 6);
        }
      }
      this.shake = 6;
      TS.Audio.sfx('shootHeavy');
    }

    e.summonCd -= dt;
    if (e.summonCd <= 0) {
      e.summonCd = e.final ? 7 : 10;
      var n = e.final ? 6 : 4;
      for (var s = 0; s < n; s++) {
        var p = this.world.findSpawn(this.rng, e.x, e.y, 70, 180, 24);
        if (p) this.spawnEnemy(this.rng.chance(0.5) ? 'grunt' : 'runner', p.x, p.y, false);
      }
      this.addText(e.x, e.y - e.r - 12, '召唤援军', '#ffb2a3', 15);
    }
  };

  Game.prototype.spawnEnemyBullet = function (x, y, angle, speed, dmg, color, r) {
    this.ebullets.push({
      x: x, y: y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      r: r || 4,
      dmg: dmg,
      life: 4,
      color: color || '#ff7a5c'
    });
  };

  Game.prototype.updateEnemyBullets = function (dt) {
    for (var i = this.ebullets.length - 1; i >= 0; i--) {
      var b = this.ebullets[i];
      b.life -= dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.life <= 0) { this.ebullets.splice(i, 1); continue; }
      if (this.world.solidAtPoint(b.x, b.y)) {
        var tx = Math.floor(b.x / WORLD_TILE), ty = Math.floor(b.y / WORLD_TILE);
        if (this.world.typeAt(tx, ty) === TS.World.BRICK) {
          if (this.world.damageTile(tx, ty, b.dmg * 0.7) === 'destroyed') {
            this.addParticles(b.x, b.y, 5, '#b5613c', 100, 4, 0.4);
          }
        }
        this.addParticles(b.x, b.y, 3, '#ffb2a3', 60, 2, 0.2);
        this.ebullets.splice(i, 1);
        continue;
      }
      var hit = false;
      for (var p = 0; p < this.players.length; p++) {
        var pl = this.players[p];
        if (!pl.alive) continue;
        var rr = pl.r + b.r;
        if (U.dist2(b.x, b.y, pl.x, pl.y) < rr * rr) {
          this.hurtPlayer(pl, b.dmg);
          hit = true;
          break;
        }
      }
      if (hit) this.ebullets.splice(i, 1);
    }
  };

  // -------------------------------------------------------------------
  // 玩家炮弹
  // -------------------------------------------------------------------

  Game.prototype.updateBullets = function (dt) {
    for (var i = this.bullets.length - 1; i >= 0; i--) {
      var b = this.bullets[i];
      b.life -= dt;
      if (b.life <= 0) { this.bullets.splice(i, 1); continue; }

      var steps = Math.max(1, Math.ceil(Math.hypot(b.vx, b.vy) * dt / 14));
      var stepDt = dt / steps;
      var dead = false;

      for (var s = 0; s < steps && !dead; s++) {
        var oldX = b.x, oldY = b.y;
        b.x += b.vx * stepDt;
        b.y += b.vy * stepDt;

        // 墙
        var tx = Math.floor(b.x / WORLD_TILE), ty = Math.floor(b.y / WORLD_TILE);
        if (this.world.solidAt(tx, ty)) {
          var type = this.world.typeAt(tx, ty);
          if (b.explosive > 0) {
            this.explodeAt(b.x, b.y, b.explosive, b.dmg * 0.8, b.owner, '#ffb347');
            dead = true;
            break;
          }
          if (b.bounce > 0) {
            b.bounce--;
            // 判断从哪一侧撞入：用旧坐标分别回退
            this.world.damageTile(tx, ty, 6);
            var hitX = this.world.solidAt(Math.floor(oldX / WORLD_TILE), ty);
            var hitY = this.world.solidAt(tx, Math.floor(oldY / WORLD_TILE));
            if (hitX) b.vx = -b.vx;
            if (hitY) b.vy = -b.vy;
            if (!hitX && !hitY) { b.vx = -b.vx; b.vy = -b.vy; }
            b.x = oldX; b.y = oldY;
            this.addParticles(oldX, oldY, 3, b.color, 80, 2.4, 0.25);
            TS.Audio.sfx('hit');
            continue;
          }
          this.world.damageTile(tx, ty, b.dmg * 0.8);
          if (type === TS.World.BRICK) TS.Audio.sfx('brick');
          this.addParticles(b.x, b.y, 4, '#c98a5f', 90, 2.6, 0.3);
          dead = true;
          break;
        }

        // 敌人
        var near = this.grid.query(b.x, b.y, 46, this._q2);
        for (var n = 0; n < near.length; n++) {
          var e = near[n];
          if (e.dead || b.hit.indexOf(e.id) >= 0) continue;
          var rr = e.r + b.r;
          if (U.dist2(b.x, b.y, e.x, e.y) < rr * rr) {
            b.hit.push(e.id);
            this.hitEnemy(e, b.dmg, { crit: b.crit });
            if (b.explosive > 0) {
              this.explodeAt(b.x, b.y, b.explosive, b.dmg * 0.55, b.owner, '#ffb347');
              dead = true;
            } else if (b.pierce > 0) {
              b.pierce--;
              b.dmg *= 0.86;
            } else {
              dead = true;
            }
            // 燃烧弹
            if (b.napalm && Math.random() < 0.15 + b.napalm * 0.07) {
              this.puddles.push({
                x: b.x, y: b.y, r: 34, life: 3.2, tick: 0,
                dps: 11 + b.napalm * 7, owner: b.owner
              });
              if (this.puddles.length > 40) this.puddles.shift();
            }
            break;
          }
        }
        if (dead) break;

        // 出界
        if (b.x < 0 || b.y < 0 || b.x > this.world.w || b.y > this.world.h) {
          dead = true;
          break;
        }
      }

      if (dead) this.bullets.splice(i, 1);
    }
  };

  Game.prototype.hitEnemy = function (e, dmg, opts) {
    if (e.dead) return;
    opts = opts || {};
    var dmgMul = opts.fire ? 1 : 1;
    var real = dmg * dmgMul;
    e.hp -= real;
    e.flash = 0.12;
    if (!opts.noText) {
      var py = e.y - e.r - 4;
      if (opts.crit) {
        this.addText(e.x, py, Math.round(real) + '!', '#ffd166', 16);
      } else if (Math.random() < 0.55) {
        this.addText(e.x, py, Math.round(real), '#f3ecdd', 12);
      }
    }
    if (e.hp <= 0) this.killEnemy(e, opts);
  };

  Game.prototype.killEnemy = function (e, opts) {
    if (e.dead) return;
    e.dead = true;
    var idx = this.enemies.indexOf(e);
    if (idx >= 0) this.enemies.splice(idx, 1);

    this.kills++;
    var owner = null;
    // 简单归功：最后开火的玩家不好追踪，这里按距离最近算
    owner = this.nearestPlayer(e.x, e.y);
    if (owner) owner.kills++;
    this.score += Math.round(e.score || 10);
    this.teamDamage += 1;

    this.addParticles(e.x, e.y, e.boss ? 70 : 14, e.boss ? '#ffb347' : e.template.color, e.boss ? 360 : 170, e.boss ? 7 : 4, e.boss ? 1.1 : 0.55);
    this.addParticles(e.x, e.y, e.boss ? 30 : 6, '#2a2f33', e.boss ? 260 : 90, e.boss ? 12 : 7, e.boss ? 1.4 : 0.7);
    TS.Audio.sfx(e.boss ? 'bigExplode' : 'explode');
    this.shake = Math.max(this.shake, e.boss ? 26 : 5);
    if (e.boss) {
      this.flash = 0.6;
      this.hitStop = 0.35;
    }

    if (e.template.explodeOnDeath) {
      this.explodeAt(e.x, e.y, 96, 22 + this.time * 0.04, null, '#ff7a3c');
    }

    // 掉落
    var gemVal = e.xp || 1;
    if (e.boss) {
      if (this.boss === e) this.boss = null;
      this.dropPickup(e.x, e.y, 'xp', 18, true);
      for (var k = 0; k < 5; k++) this.dropPickup(e.x, e.y, 'xp', 4, true);
      this.dropPickup(e.x, e.y, 'heart', 1, true);
    } else {
      this.dropPickup(e.x, e.y, 'xp', gemVal, e.elite);
      if (e.elite) {
        this.dropPickup(e.x, e.y, 'heart', 1, true);
        if (this.rng.chance(0.5)) this.dropPickup(e.x, e.y, 'bomb', 1, true);
      } else {
        if (this.rng.chance(0.035)) this.dropPickup(e.x, e.y, 'heart', 1, false);
        if (this.rng.chance(0.016)) this.dropPickup(e.x, e.y, 'bomb', 1, false);
        if (this.rng.chance(0.008)) this.dropPickup(e.x, e.y, 'magnet', 1, false);
      }
    }

    if (e.boss) {
      this.emit('bossDead', e);
      if (e.final) {
        this.winTimer = 2.2;
        this.emit('toast', '要塞已被击毁');
      }
    }
  };

  Game.prototype.explodeAt = function (x, y, radius, dmg, owner, color) {
    this.addParticles(x, y, 22, color || '#ffb347', 240, 5, 0.6);
    this.addParticles(x, y, 8, '#2a2f33', 120, 8, 0.8);
    this.shake = Math.max(this.shake, Math.min(14, radius / 5));
    TS.Audio.sfx(radius > 100 ? 'bigExplode' : 'explode');
    this.damageTilesInRadius(x, y, radius * 0.7, 30);
    for (var i = 0; i < this.enemies.length; i++) {
      var e = this.enemies[i];
      if (e.dead) continue;
      var d = U.dist(x, y, e.x, e.y);
      if (d < radius + e.r) {
        var falloff = U.clamp(1 - d / (radius + e.r), 0.3, 1);
        this.hitEnemy(e, dmg * falloff, {});
      }
    }
    // 溅射也会伤到玩家，但只吃一小部分
    for (var pi = 0; pi < this.players.length; pi++) {
      var p = this.players[pi];
      if (!p.alive) continue;
      if (U.dist(x, y, p.x, p.y) < radius * 0.65) {
        // 自己的炸弹不伤自己；这里只处理敌人自爆
        if (owner == null) this.hurtPlayer(p, 12);
      }
    }
  };

  Game.prototype.damageTilesInRadius = function (x, y, radius, dmg) {
    var t = WORLD_TILE;
    var minTx = Math.floor((x - radius) / t), maxTx = Math.floor((x + radius) / t);
    var minTy = Math.floor((y - radius) / t), maxTy = Math.floor((y + radius) / t);
    for (var ty = minTy; ty <= maxTy; ty++) {
      for (var tx = minTx; tx <= maxTx; tx++) {
        if (!this.world.solidAt(tx, ty)) continue;
        var ccx = tx * t + t / 2, ccy = ty * t + t / 2;
        if (U.dist2(x, y, ccx, ccy) > radius * radius) continue;
        var res = this.world.damageTile(tx, ty, dmg);
        if (res === 'destroyed') {
          this.addParticles(ccx, ccy, 4, '#b5613c', 100, 4, 0.4);
          if (Math.random() < 0.3) TS.Audio.sfx('brick');
        }
      }
    }
  };

  // -------------------------------------------------------------------
  // 玩家受伤 / 结局
  // -------------------------------------------------------------------

  Game.prototype.hurtPlayer = function (p, amount) {
    if (!p.alive || p.invuln > 0) return;
    amount = Math.max(2, amount - p.stats.armorFlat);
    if (p.shield > 0) {
      p.shield--;
      p.shieldCd = p.stats.shieldRecharge;
      p.invuln = 0.5;
      this.addParticles(p.x, p.y, 16, '#7bd6ff', 180, 4, 0.5);
      this.flash = 0.18;
      TS.Audio.sfx('hit');
      this.addText(p.x, p.y - 24, '护盾抵挡', '#7bd6ff', 14);
      return;
    }
    p.hp -= amount;
    p.invuln = 0.62;
    p.hurtFlash = 0.4;
    this.shake = Math.max(this.shake, 9);
    this.flash = Math.max(this.flash, 0.28);
    this.addText(p.x, p.y - 24, '-' + Math.round(amount), '#ff8a75', 15);
    this.addParticles(p.x, p.y, 8, '#e2543c', 130, 3.5, 0.4);
    TS.Audio.sfx('hurt');
    TS.Input.rumble(p.index, 220, 0.9, 0.5);

    if (p.hp <= 0) {
      p.hp = 0;
      p.alive = false;
      p.downed = true;
      p.reviveT = 0;
      p.vx = 0; p.vy = 0;
      this.addParticles(p.x, p.y, 34, p.color, 260, 6, 0.9);
      this.addParticles(p.x, p.y, 16, '#2a2f33', 140, 8, 1.1);
      TS.Audio.sfx('bigExplode');
      this.shake = 22;
      this.flash = 0.5;
      this.emit('toast', p.name + ' 被击毁' + (this.anyAlive() ? ' · 队友靠近可救援' : ''));
      if (!this.anyAlive() && this.endTimer <= 0) this.endTimer = 1.6;
    }
  };

  Game.prototype.finish = function (won) {
    if (this.over) return;
    this.over = true;
    this.won = !!won;
    this.state = won ? 'win' : 'over';
    this.score += Math.floor(this.time) * 4 + this.level * 110;
    TS.Audio.sfx(won ? 'win' : 'lose');
    this.emit(won ? 'win' : 'over', this.result());
  };

  Game.prototype.result = function () {
    return {
      won: this.won,
      time: this.time,
      kills: this.kills,
      level: this.level,
      score: this.score,
      players: this.players.map(function (p) {
        return { name: p.name, kills: p.kills, color: p.color };
      }),
      best: null
    };
  };

  // -------------------------------------------------------------------
  // 拾取物
  // -------------------------------------------------------------------

  Game.prototype.dropPickup = function (x, y, type, value, big) {
    this.pickups.push({
      x: x + this.rng.range(-8, 8),
      y: y + this.rng.range(-8, 8),
      vx: this.rng.range(-30, 30),
      vy: this.rng.range(-30, 30),
      type: type,
      value: value || 1,
      big: !!big,
      r: type === 'xp' ? (big ? 9 : 6) : 10,
      life: 40,
      t: this.rng.next() * TAU,
      magnet: false
    });
    if (this.pickups.length > 420) this.pickups.shift();
  };

  Game.prototype.updatePickups = function (dt) {
    for (var i = this.pickups.length - 1; i >= 0; i--) {
      var k = this.pickups[i];
      k.life -= dt;
      k.t += dt;
      k.x += k.vx * dt;
      k.y += k.vy * dt;
      k.vx *= 1 - 3 * dt;
      k.vy *= 1 - 3 * dt;
      this.world.resolveCircle(k, 6);

      var best = null, bestD = Infinity;
      for (var p = 0; p < this.players.length; p++) {
        var pl = this.players[p];
        if (!pl.alive) continue;
        var d = U.dist2(k.x, k.y, pl.x, pl.y);
        var range = pl.stats.pickup;
        if (k.magnet) range = 5000;
        if (d < range * range && d < bestD) { bestD = d; best = pl; }
      }
      if (best) {
        var dd = Math.sqrt(bestD) || 1;
        var pull = k.magnet ? 1400 : 620;
        k.vx += ((best.x - k.x) / dd) * pull * dt;
        k.vy += ((best.y - k.y) / dd) * pull * dt;
        if (dd < best.r + 8) {
          this.collectPickup(best, k);
          this.pickups.splice(i, 1);
          continue;
        }
      }
      if (k.life <= 0) this.pickups.splice(i, 1);
    }
  };

  Game.prototype.collectPickup = function (p, k) {
    if (k.type === 'xp') {
      var mult = 1;
      for (var i = 0; i < this.players.length; i++) if (this.players[i].alive) mult = Math.max(mult, this.players[i].stats.xpMult);
      this.addXp(k.value * mult);
      this.addParticles(k.x, k.y, 3, '#9ad14f', 80, 2, 0.25);
      TS.Audio.sfx('pickup');
    } else if (k.type === 'heart') {
      p.hp = Math.min(p.maxHp, p.hp + 30);
      this.addText(p.x, p.y - 26, '+30', '#9ad14f', 15);
      this.addParticles(p.x, p.y, 8, '#9ad14f', 90, 3, 0.4);
      TS.Audio.sfx('heart');
    } else if (k.type === 'bomb') {
      p.bombs = Math.min(5, p.bombs + 1);
      this.addText(p.x, p.y - 26, '+1 炸弹', '#f2b13c', 14);
      TS.Audio.sfx('heart');
    } else if (k.type === 'magnet') {
      for (var m = 0; m < this.pickups.length; m++) {
        if (this.pickups[m].type === 'xp') this.pickups[m].magnet = true;
      }
      this.addText(p.x, p.y - 26, '磁力回收', '#9ad14f', 14);
      TS.Audio.sfx('pickup');
    }
  };

  Game.prototype.addXp = function (amount) {
    this.xp += amount;
    while (this.xp >= this.xpNeedNow) {
      this.xp -= this.xpNeedNow;
      this.level++;
      this.pendingLevels++;
      this.xpNeedNow = this.xpNeed(this.level);
    }
    if (this.pendingLevels > 0 && this.state === 'playing') {
      this.state = 'levelup';
      this.offers = this.rollOffers();
      this.emit('levelup', { offers: this.offers, level: this.level });
    }
  };

  // -------------------------------------------------------------------
  // 升级配置
  // -------------------------------------------------------------------

  Game.prototype.rollOffers = function () {
    var self = this;
    var pool = UPGRADE_DEFS.filter(function (d) {
      return (self.players[0].up[d.id] || 0) < d.max;
    });
    var out = [];
    var weights = function (d) {
      var lv = self.players[0].up[d.id] || 0;
      var w = d.weight || 1;
      if (lv === 0) w *= 1.55;
      else if (lv >= d.max - 1) w *= 0.75;
      return w;
    };
    while (out.length < 3 && pool.length) {
      var pick = U.weightedPick(this.rng, pool, weights);
      if (!pick) break;
      var i = pool.indexOf(pick);
      if (i >= 0) pool.splice(i, 1);
      out.push(this.makeOffer(pick));
    }
    while (out.length < 3) {
      out.push(this.makeOffer({
        id: 'supply', name: '紧急补给', kind: '补给', max: 99, color: '#9ad14f', icon: 'supply',
        desc: '立即回复 35 点生命，并补充 1 枚炸弹。'
      }));
    }
    return out;
  };

  Game.prototype.makeOffer = function (d) {
    var lv = this.players[0].up[d.id] || 0;
    return {
      id: d.id,
      name: d.name,
      kind: d.kind,
      color: d.color,
      icon: d.icon,
      desc: d.desc,
      level: lv,
      next: lv + 1,
      max: d.max,
      tag: d.tag ? d.tag(lv) : ''
    };
  };

  Game.prototype.chooseUpgrade = function (id) {
    if (this.state !== 'levelup') return 'ignore';
    var def = DEF_BY_ID[id];
    if (id === 'supply') {
      for (var i = 0; i < this.players.length; i++) {
        var p = this.players[i];
        p.hp = Math.min(p.maxHp, p.hp + 35);
        p.bombs = Math.min(5, p.bombs + 1);
      }
    } else if (def) {
      for (var j = 0; j < this.players.length; j++) {
        var pl = this.players[j];
        var before = pl.stats.maxHp;
        pl.up[id] = Math.min(def.max, (pl.up[id] || 0) + 1);
        var stats = this.calcStats(pl);
        pl.stats = stats;
        var added = stats.maxHp - before;
        if (added > 0) {
          pl.hp += added;
          pl.maxHp = stats.maxHp;
        } else {
          pl.maxHp = stats.maxHp;
          pl.hp = Math.min(pl.hp, pl.maxHp);
        }
        if (id === 'shield' && pl.shield < stats.shieldMax) {
          pl.shield = stats.shieldMax;
          pl.shieldCd = stats.shieldRecharge;
        }
      }
      TS.Audio.sfx('levelup');
    }

    this.pendingLevels = Math.max(0, this.pendingLevels - 1);
    if (this.pendingLevels > 0) {
      this.offers = this.rollOffers();
      this.emit('levelupMore', { offers: this.offers, level: this.level });
      return 'more';
    }
    this.state = 'playing';
    this.emit('resume', {});
    return 'resume';
  };

  // -------------------------------------------------------------------
  // 波次与生成
  // -------------------------------------------------------------------

  Game.prototype.updateSpawning = function (dt) {
    if (this.time > 480) return; // 终焉要塞之后不再刷杂兵
    var rate = 1.1 + this.time * 0.036;
    if (rate > 12) rate = 12;
    // 双人时略增，保持两人都有事做
    if (this.playerCount > 1) rate *= 1.18;
    this.spawnAcc += rate * dt;

    var alive = this.enemies.length;
    if (alive >= this.spawnCap) { this.spawnAcc = Math.min(this.spawnAcc, 1); return; }

    var guard = 0;
    while (this.spawnAcc >= 1 && guard++ < 12) {
      this.spawnAcc -= 1;
      var pos = this.spawnRing();
      if (!pos) continue;
      var elite = this.time > 70 && this.rng.chance(Math.min(0.10, 0.012 + this.time / 6000));
      this.spawnEnemy(null, pos.x, pos.y, elite);
    }
  };

  Game.prototype.spawnRing = function () {
    var cam = this.cam;
    var scale = this.baseScale * this.cam.zoom;
    var viewW = this.view.w / scale;
    var viewH = this.view.h / scale;
    var minR = Math.max(viewW, viewH) * 0.56 + 60;
    var maxR = minR + 180;
    var pos = this.world.findSpawn(this.rng, cam.x, cam.y, minR, maxR, 26);
    if (pos) {
      // 不要贴着玩家出生
      for (var i = 0; i < this.players.length; i++) {
        if (U.dist(pos.x, pos.y, this.players[i].x, this.players[i].y) < 280) return null;
      }
    }
    return pos;
  };

  Game.prototype.updateEvents = function (dt) {
    // 30 秒一波的提示与增强
    if (this.time >= this.nextWave && this.time < 470) {
      this.nextWave += 30;
      this.waveIndex++;
      var label = ['装甲纵队', '炮手分队', '混合编队', '重装推进', '焦土攻势'][Math.min(4, Math.floor(this.waveIndex / 3))];
      this.emit('toast', '第 ' + this.waveIndex + ' 波 · ' + label);
      var pack = 6 + Math.min(18, this.waveIndex * 2);
      for (var i = 0; i < pack; i++) {
        var pos = this.spawnRing();
        if (pos) this.spawnEnemy(null, pos.x, pos.y, this.time > 90 && this.rng.chance(0.06));
      }
      this.emit('wave', this.waveIndex);
    }

    if (!this.bossSpawned[0] && this.time >= 240) {
      this.bossSpawned[0] = true;
      this.spawnBoss(false);
      this.emit('toast', 'BOSS · 重装坦克');
    }
    if (!this.bossSpawned[1] && this.time >= 480) {
      this.bossSpawned[1] = true;
      this.spawnBoss(true);
      this.emit('toast', 'FINAL BOSS · 终焉要塞');
    }
  };

  // -------------------------------------------------------------------
  // 特效
  // -------------------------------------------------------------------

  Game.prototype.addParticles = function (x, y, n, color, speed, size, life) {
    if (this.particles.length > 900) return;
    for (var i = 0; i < n; i++) {
      var a = Math.random() * TAU;
      var sp = speed * (0.25 + Math.random() * 0.85);
      this.particles.push({
        x: x, y: y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: life * (0.6 + Math.random() * 0.6),
        maxLife: life,
        size: size * (0.5 + Math.random()),
        color: color,
        drag: 2.6 + Math.random() * 2
      });
    }
  };

  Game.prototype.addText = function (x, y, text, color, size) {
    if (this.texts.length > 90) this.texts.shift();
    this.texts.push({
      x: x + (Math.random() - 0.5) * 8,
      y: y,
      vy: -34,
      life: 0.75,
      maxLife: 0.75,
      text: text,
      color: color || '#f3ecdd',
      size: size || 12
    });
  };

  Game.prototype.updateEffects = function (dt) {
    var i;
    for (i = this.particles.length - 1; i >= 0; i--) {
      var pt = this.particles[i];
      pt.life -= dt;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      var drag = 1 - pt.drag * dt;
      pt.vx *= drag;
      pt.vy *= drag;
      if (pt.life <= 0) this.particles.splice(i, 1);
    }
    for (i = this.texts.length - 1; i >= 0; i--) {
      var tx = this.texts[i];
      tx.life -= dt;
      tx.y += tx.vy * dt;
      tx.vy *= 1 - 2 * dt;
      if (tx.life <= 0) this.texts.splice(i, 1);
    }
    for (i = this.arcs.length - 1; i >= 0; i--) {
      this.arcs[i].life -= dt;
      if (this.arcs[i].life <= 0) this.arcs.splice(i, 1);
    }
    // 履带印：限量，避免无限增长
    if (this.decals.length > 260) this.decals.splice(0, this.decals.length - 260);
  };

  Game.prototype.addDecal = function (x, y, angle, color, alpha) {
    this.decals.push({ x: x, y: y, a: angle, color: color, alpha: alpha == null ? 0.35 : alpha, life: 40 });
  };

  Game.prototype.updateDecals = function (dt) {
    for (var i = this.decals.length - 1; i >= 0; i--) {
      this.decals[i].life -= dt;
      if (this.decals[i].life <= 0) this.decals.splice(i, 1);
    }
  };

  // 供渲染使用
  Game.prototype.viewBounds = function () {
    var scale = this.baseScale * this.cam.zoom;
    var halfW = this.view.w / scale / 2 + 80;
    var halfH = this.view.h / scale / 2 + 80;
    return {
      x0: this.cam.x - halfW, x1: this.cam.x + halfW,
      y0: this.cam.y - halfH, y1: this.cam.y + halfH,
      scale: scale
    };
  };

  TS.Game = Game;
  TS.UPGRADE_DEFS = UPGRADE_DEFS;
  TS.ICONS = ICONS;
  TS.ENEMY_TYPES = ENEMY_TYPES;
})(window.TS = window.TS || {});
