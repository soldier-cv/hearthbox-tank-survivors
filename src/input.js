/* 输入：键盘 + Gamepad API（Xbox 标准映射）。
   两个逻辑玩家各自能吃到「分配到的/手柄」和「各自键盘键位」，互不冲突。
   菜单只读边沿，游戏内读持续状态。 */
(function (TS) {
  'use strict';

  function blankPlayer(index) {
    return {
      index: index,
      source: 'none',
      padIndex: -1,
      connected: false,
      moveX: 0,
      moveY: 0,
      aimX: 0,
      aimY: 0,
      aimMag: 0,
      aimActive: false,
      dash: false,
      bomb: false,
      start: false
    };
  }

  function blankNav() {
    return {
      left: false, right: false, up: false, down: false,
      confirm: false, back: false, start: false, any: false
    };
  }

  var Input = {
    players: [blankPlayer(0), blankPlayer(1)],
    nav: blankNav(),
    pads: [],
    padNames: ['', ''],
    isTwoPlayer: false,

    _keys: new Set(),
    _just: new Set(),
    _navAxis: { h: 0, v: 0 },
    _connected: {},
    _onChange: null,
    _rumbleOk: true,
    _padAimActive: [false, false],
    _padAimHeld: [false, false],

    init: function (onChange) {
      this._onChange = onChange || null;
      var self = this;

      window.addEventListener('keydown', function (e) {
        // 方向和空格会滚动页面 / 触发按钮，全部吃掉
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Enter', 'Tab'].indexOf(e.code) >= 0) {
          e.preventDefault();
        }
        if (!e.repeat) {
          self._just.add(e.code);
        }
        self._keys.add(e.code);
        if (TS.Audio) TS.Audio.unlock();
      }, { passive: false });

      window.addEventListener('keyup', function (e) {
        self._keys.delete(e.code);
      });

      window.addEventListener('blur', function () {
        self._keys.clear();
        self._just.clear();
      });

      window.addEventListener('gamepadconnected', function (e) {
        self._connected[e.gamepad.index] = true;
        self.pads = self._readPads();
        self._assign();
        if (TS.Audio) TS.Audio.unlock();
        self._toast('手柄已连接 · ' + self._shortName(e.gamepad.id));
        self._fireChange();
      });

      window.addEventListener('gamepaddisconnected', function (e) {
        delete self._connected[e.gamepad.index];
        self.pads = self._readPads();
        self._assign();
        self._toast('手柄已断开');
        self._fireChange();
      });

      // 鼠标/触摸也算用户交互，先解锁音频；点击处理在 main 里
      window.addEventListener('pointerdown', function () {
        if (TS.Audio) TS.Audio.unlock();
      });

      document.addEventListener('visibilitychange', function () {
        if (document.hidden) self._keys.clear();
      });
    },

    _shortName: function (id) {
      if (!id) return '未知手柄';
      var name = String(id).replace(/\s*\([^)]*\)\s*$/, '').replace(/^[0-9a-f]{4}-[0-9a-f]{4}-/i, '');
      if (/xbox/i.test(name)) return 'Xbox 手柄';
      if (/dualshock|dualsense|playstation/i.test(name)) return 'PlayStation 手柄';
      if (/switch|joy-con|pro controller/i.test(name)) return 'Switch 手柄';
      return name.length > 22 ? name.slice(0, 22) + '…' : name;
    },

    _readPads: function () {
      var list = [];
      if (!navigator.getGamepads) return list;
      var raw;
      try { raw = navigator.getGamepads(); } catch (e) { return list; }
      for (var i = 0; i < raw.length; i++) {
        var gp = raw[i];
        if (!gp) continue;
        list.push({
          index: gp.index,
          id: gp.id,
          mapping: gp.mapping,
          axes: gp.axes,
          buttons: gp.buttons,
          _prev: (this._prev && this._prev[gp.index]) || []
        });
      }
      return list;
    },

    _assign: function () {
      var assigned = [null, null];
      var used = {};
      // 已有的分配优先保留
      for (var i = 0; i < 2; i++) {
        var idx = this.players[i].padIndex;
        if (idx >= 0 && this._connected[idx]) {
          assigned[i] = idx;
          used[idx] = true;
        }
      }
      // 余下的手柄按索引顺序补位
      var free = this.pads.filter(function (p) { return !used[p.index]; }).sort(function (a, b) { return a.index - b.index; });
      for (var j = 0; j < 2; j++) {
        if (assigned[j] == null && free.length) {
          assigned[j] = free.shift().index;
        }
      }
      for (var k = 0; k < 2; k++) {
        this.players[k].padIndex = assigned[k] == null ? -1 : assigned[k];
        this.players[k].connected = assigned[k] != null;
      }
      var byIndex = {};
      this.pads.forEach(function (p) { byIndex[p.index] = p; });
      this.padNames[0] = assigned[0] != null && byIndex[assigned[0]] ? this._shortName(byIndex[assigned[0]].id) : '';
      this.padNames[1] = assigned[1] != null && byIndex[assigned[1]] ? this._shortName(byIndex[assigned[1]].id) : '';
    },

    _fireChange: function () {
      if (this._onChange) this._onChange(this.padNames, this.players);
    },

    _toast: function (msg) {
      if (TS.UI && TS.UI.toast) TS.UI.toast(msg);
    },

    _deadzone: function (x, y, dz) {
      var m = Math.hypot(x, y);
      if (!m || m < dz) return null;
      var scaled = Math.min(1, (m - dz) / (0.95 - dz));
      return { x: (x / m) * scaled, y: (y / m) * scaled, m: scaled };
    },

    _btn: function (pad, i) {
      var b = pad.buttons[i];
      if (!b) return 0;
      if (typeof b === 'number') return b;
      return b.value || (b.pressed ? 1 : 0);
    },

    _padPressed: function (pad, i) {
      return this._btn(pad, i) > 0.5 && !(pad._prev[i] > 0.5);
    },

    _holdNavRepeat: true,

    poll: function () {
      var self = this;
      this.pads = this._readPads();
      this._assign();

      var nav = blankNav();
      var k = this._keys;
      var j = this._just;

      // ---- 键盘 ----
      if (j.has('Space') || j.has('Enter') || j.has('NumpadEnter')) nav.confirm = true;
      if (j.has('Escape')) nav.back = true;
      if (j.has('Escape') || j.has('KeyP')) nav.start = true;
      if (j.has('ArrowLeft') || j.has('KeyA')) nav.left = true;
      if (j.has('ArrowRight') || j.has('KeyD')) nav.right = true;
      if (j.has('ArrowUp') || j.has('KeyW')) nav.up = true;
      if (j.has('ArrowDown') || j.has('KeyS')) nav.down = true;

      // ---- 手柄 ----
      var anyPadEdge = false;
      var padEdgeConfirm = false;
      var padEdgeStart = false;

      this.pads.forEach(function (pad) {
        var prev = pad._prev || [];
        var aEdge = self._padPressed(pad, 0);
        var bEdge = self._padPressed(pad, 1);
        var xEdge = self._padPressed(pad, 2);
        var yEdge = self._padPressed(pad, 3);
        var startEdge = self._padPressed(pad, 9);
        var lbEdge = self._padPressed(pad, 4);
        var rbEdge = self._padPressed(pad, 5);

        if (aEdge || bEdge || xEdge || yEdge || startEdge || lbEdge || rbEdge) anyPadEdge = true;
        if (aEdge) padEdgeConfirm = true;
        if (startEdge) padEdgeStart = true;
        if (bEdge) nav.back = true;

        if (self._padPressed(pad, 14)) nav.left = true;
        if (self._padPressed(pad, 15)) nav.right = true;
        if (self._padPressed(pad, 12)) nav.up = true;
        if (self._padPressed(pad, 13)) nav.down = true;

        var lx = pad.axes[0] || 0, ly = pad.axes[1] || 0;
        if (lx < -0.55 && !(prev._lx < -0.55)) nav.left = true;
        if (lx > 0.55 && !(prev._lx > 0.55)) nav.right = true;
        if (ly < -0.55 && !(prev._ly < -0.55)) nav.up = true;
        if (ly > 0.55 && !(prev._ly > 0.55)) nav.down = true;
        prev._lx = lx;
        prev._ly = ly;

        // 保存供下一帧做边沿判定
        for (var i = 0; i < pad.buttons.length; i++) {
          prev[i] = self._btn(pad, i);
        }
        pad._prev = prev;
      });
      this._prev = this._prev || {};
      this.pads.forEach(function (pad) { self._prev[pad.index] = pad._prev; });

      if (padEdgeConfirm) nav.confirm = true;
      if (padEdgeStart) nav.start = true;
      nav.any = anyPadEdge || j.size > 0;

      this.nav = nav;

      // ---- 每个玩家 ----
      for (var p = 0; p < 2; p++) {
        var pl = this.players[p];
        var pad = null;
        if (pl.padIndex >= 0) {
          for (var pi = 0; pi < this.pads.length; pi++) {
            if (this.pads[pi].index === pl.padIndex) { pad = this.pads[pi]; break; }
          }
        }
        pl.connected = !!pad;
        pl.source = pad ? 'pad' : (p === 0 ? 'kb1' : 'kb2');

        var mx = 0, my = 0, ax = 0, ay = 0;
        var dash = false, bomb = false, start = false;
        var usingPad = false;

        if (pad) {
          var dz = this._deadzone(pad.axes[0] || 0, pad.axes[1] || 0, 0.18);
          if (dz) { mx += dz.x; my += dz.y; usingPad = true; }
          if (this._btn(pad, 12) > 0.5) { my -= 1; usingPad = true; }
          if (this._btn(pad, 13) > 0.5) { my += 1; usingPad = true; }
          if (this._btn(pad, 14) > 0.5) { mx -= 1; usingPad = true; }
          if (this._btn(pad, 15) > 0.5) { mx += 1; usingPad = true; }

          var adz = this._deadzone(pad.axes[2] || 0, pad.axes[3] || 0, 0.28);
          if (adz) { ax = adz.x; ay = adz.y; }

          dash = this._btn(pad, 0) > 0.5;
          bomb = this._btn(pad, 2) > 0.5 || this._btn(pad, 5) > 0.5;
          start = this._btn(pad, 9) > 0.5;
        }

        // 键盘补充（P1: WASD / P2: 方向键；单人时方向键也给 P1）
        var kbUp = p === 0
          ? (k.has('KeyW') || (!this.isTwoPlayer && k.has('ArrowUp')))
          : k.has('ArrowUp');
        var kbDown = p === 0
          ? (k.has('KeyS') || (!this.isTwoPlayer && k.has('ArrowDown')))
          : k.has('ArrowDown');
        var kbLeft = p === 0
          ? (k.has('KeyA') || (!this.isTwoPlayer && k.has('ArrowLeft')))
          : k.has('ArrowLeft');
        var kbRight = p === 0
          ? (k.has('KeyD') || (!this.isTwoPlayer && k.has('ArrowRight')))
          : k.has('ArrowRight');

        if (kbUp) my -= 1;
        if (kbDown) my += 1;
        if (kbLeft) mx -= 1;
        if (kbRight) mx += 1;

        if (p === 0) {
          dash = dash || k.has('Space');
          bomb = bomb || k.has('ShiftLeft');
        } else {
          dash = dash || k.has('Enter') || k.has('NumpadEnter');
          bomb = bomb || k.has('ShiftRight') || k.has('Numpad0');
        }
        start = start || k.has('Escape');

        var mm = Math.hypot(mx, my);
        if (mm > 1) { mx /= mm; my /= mm; }
        var am = Math.hypot(ax, ay);

        pl.moveX = mx;
        pl.moveY = my;
        pl.aimX = ax;
        pl.aimY = ay;
        pl.aimMag = am;
        pl.aimActive = am > 0.3;
        pl.dash = dash;
        pl.bomb = bomb;
        pl.start = start;

        // 手柄瞄准：松开右摇杆后保持一段时间，避免最后一帧抖动
        if (pl.aimActive) this._padAimHeld[p] = true;
      }

      this.nav.start = nav.start || this.players[0].start && this._just.has('Escape');
      this.nav.any = nav.any;
    },

    endFrame: function () {
      this._just.clear();
    },

    just: function (code) {
      return this._just.has(code);
    },

    // 镜头震动 / 受伤反馈：尽力而为，没有马达就静默失败
    rumble: function (playerIndex, duration, strong, weak) {
      if (!this._rumbleOk) return;
      var pl = this.players[playerIndex] || this.players[0];
      var pad = null;
      for (var i = 0; i < this.pads.length; i++) {
        if (this.pads[i].index === pl.padIndex) { pad = this.pads[i]; break; }
      }
      if (!pad) return;
      var full = null;
      try { full = navigator.getGamepads ? navigator.getGamepads()[pad.index] : null; } catch (e) { return; }
      if (!full) return;
      if (full.vibrationActuator && full.vibrationActuator.playEffect) {
        full.vibrationActuator.playEffect('dual-rumble', {
          duration: duration || 120,
          strongMagnitude: strong == null ? 0.6 : strong,
          weakMagnitude: weak == null ? 0.35 : weak
        }).catch(function () { /* 某些手柄不支持，静默 */ });
      } else if (full.hapticActuators && full.hapticActuators[0]) {
        full.hapticActuators[0].pulse(strong || 0.6, duration || 120);
      }
    }
  };

  TS.Input = Input;
})(window.TS = window.TS || {});
