/* 应用层：状态机、菜单、HUD、输入分发、主循环。 */
(function (TS) {
  'use strict';

  var U = TS.util;
  var Audio = TS.Audio;
  var Input = TS.Input;

  var App = {
    state: 'title',
    game: null,
    mode: 1,
    offers: [],
    selected: 0,
    pauseIndex: 0,
    resultTimer: 0,
    lastResult: null,
    hudT: 0,
    _hudEls: null,
    _toastTimer: 0
  };
  TS.App = App;

  var $ = function (id) { return document.getElementById(id); };

  // ===================================================================
  // 提示 & 屏幕切换
  // ===================================================================

  function toast(msg) {
    var el = $('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('is-on');
    clearTimeout(App._toastTimer);
    App._toastTimer = setTimeout(function () {
      el.classList.remove('is-on');
    }, 2000);
  }

  function showScreen(id) {
    ['screen-title', 'screen-levelup', 'screen-pause', 'screen-over'].forEach(function (sid) {
      var el = $(sid);
      if (el) el.classList.toggle('hidden', sid !== id);
    });
    // 升级 / 暂停 / 结算盖住画面时，别让战斗提示浮在最上层
    if (id === 'screen-levelup' || id === 'screen-pause' || id === 'screen-over') {
      var t = $('toast');
      if (t) t.classList.remove('is-on');
      clearTimeout(App._toastTimer);
    }
  }

  function hideScreens() {
    ['screen-title', 'screen-levelup', 'screen-pause', 'screen-over'].forEach(function (sid) {
      var el = $(sid);
      if (el) el.classList.add('hidden');
    });
  }

  function setHudVisible(on) {
    var hud = $('hud');
    if (hud) hud.classList.toggle('hidden', !on);
  }

  TS.UI = { toast: toast };

  // ===================================================================
  // 标题
  // ===================================================================

  function refreshTitle() {
    var best = U.store.get('tank-survivors.best', null);
    var bestEl = $('bestScore');
    if (bestEl) {
      if (best) {
        bestEl.textContent = U.formatTime(best.time) + ' · ' + U.formatScore(best.score || 0);
      } else {
        bestEl.textContent = '—';
      }
    }
    var modes = document.querySelectorAll('.mode');
    for (var i = 0; i < modes.length; i++) {
      modes[i].setAttribute('aria-pressed', String(Number(modes[i].getAttribute('data-mode')) === App.mode));
    }
    refreshPads();
  }

  function refreshPads() {
    for (var i = 0; i < 2; i++) {
      var row = $('padRow' + i);
      var name = $('padName' + i);
      var led = $('padLed' + i);
      var label;
      if (Input.padNames[i]) {
        label = 'P' + (i + 1) + ' · ' + Input.padNames[i];
        if (row) row.classList.add('is-on');
        if (led) led.style.background = '#9ad14f';
      } else if (i === 1) {
        label = 'P2 · 第二只手柄 / 方向键';
        if (row) row.classList.remove('is-on');
      } else {
        label = 'P1 · 键盘 WASD / 手柄';
        if (row) row.classList.remove('is-on');
      }
      if (name) name.textContent = label;
    }
  }

  function setMode(mode) {
    App.mode = mode === 2 ? 2 : 1;
    U.store.set('tank-survivors.mode', App.mode);
    Audio.sfx('ui');
    refreshTitle();
  }

  // ===================================================================
  // 开局
  // ===================================================================

  function startRun() {
    Audio.unlock();
    Audio.setMuted(Audio.muted);
    Audio.setMusic(true);
    Input.isTwoPlayer = App.mode === 2;
    setHudVisible(true);
    hideScreens();

    var game = new TS.Game({ onEvent: onGameEvent });
    game.baseScale = TS.Renderer.baseScale();
    App.game = game;
    App.state = 'playing';
    App.offers = [];
    App.selected = 0;
    App.hudT = 0;
    App.lastResult = null;
    game.start(App.mode);
    buildPlayerCards(game);
    updateHud(true);
    toast(App.mode === 2 ? '双人同屏 · 靠近倒下的队友可救援' : '生存 8 分钟 · 击毁终焉要塞');
  }

  function retryRun() {
    if (!App.game) { startRun(); return; }
    var game = new TS.Game({ onEvent: onGameEvent });
    game.baseScale = TS.Renderer.baseScale();
    App.game = game;
    App.state = 'playing';
    App.offers = [];
    App.selected = 0;
    App.hudT = 0;
    App.lastResult = null;
    hideScreens();
    setHudVisible(true);
    game.start(App.mode);
    buildPlayerCards(game);
    updateHud(true);
  }

  function quitToTitle() {
    App.state = 'title';
    App.game = null;
    App.offers = [];
    App.lastResult = null;
    setHudVisible(false);
    hideScreens();
    showScreen('screen-title');
    Audio.setMusic(false);
    refreshTitle();
  }

  function pauseGame() {
    if (App.state !== 'playing' || !App.game) return;
    App.state = 'paused';
    App.pauseIndex = 0;
    renderPauseMenu();
    showScreen('screen-pause');
    Audio.sfx('ui');
  }

  function resumeGame() {
    if (App.state !== 'paused') return;
    hideScreens();
    App.state = 'playing';
    Audio.sfx('ui');
  }

  function renderPauseMenu() {
    var items = document.querySelectorAll('#pauseMenu .menu-item');
    for (var i = 0; i < items.length; i++) {
      items[i].setAttribute('aria-pressed', String(i === App.pauseIndex));
    }
    var muteLabel = $('muteLabel');
    if (muteLabel) muteLabel.textContent = Audio.muted ? '取消静音' : '静音';
  }

  function activatePause(i) {
    var act = ['resume', 'mute', 'restart', 'quit'][i];
    if (act === 'resume') resumeGame();
    else if (act === 'mute') {
      Audio.unlock();
      Audio.toggleMute();
      renderPauseMenu();
    } else if (act === 'restart') {
      Audio.sfx('ui');
      startRun();
    } else if (act === 'quit') {
      quitToTitle();
    }
  }

  // ===================================================================
  // 升级选卡
  // ===================================================================

  function openLevelup(offers) {
    if (!App.game) return;
    App.state = 'levelup';
    App.offers = offers;
    App.selected = 0;
    App.levelupSound = true;
    Audio.sfx('levelup');
    var num = $('levelupNum');
    if (num) num.textContent = String(App.game.level);
    renderCards();
    showScreen('screen-levelup');
  }

  function renderCards() {
    var box = $('cards');
    if (!box) return;
    var html = '';
    for (var i = 0; i < App.offers.length; i++) {
      var o = App.offers[i];
      var pips = '';
      var maxShow = Math.min(6, o.max);
      for (var k = 0; k < maxShow; k++) {
        pips += '<i class="' + (k < o.level ? 'on' : '') + '"></i>';
      }
      var lvText = o.max >= 90 ? '补给' : (o.level > 0 ? 'LV ' + o.level + ' → ' + o.next : '新装备');
      html +=
        '<button class="card" type="button" data-index="' + i + '" aria-pressed="' + (i === App.selected) + '"' +
        ' style="--card-accent:' + o.color + '">' +
          '<div class="card-top">' +
            '<span class="card-icon">' + (TS.ICONS[o.icon] || '') + '</span>' +
            '<span class="card-lv">' + lvText + '<br><span class="pips">' + pips + '</span></span>' +
          '</div>' +
          '<div class="card-kind">' + o.kind + (o.tag ? ' · ' + o.tag : '') + '</div>' +
          '<h3 class="card-name">' + o.name + '</h3>' +
          '<p class="card-desc">' + o.desc + '</p>' +
          '<div class="card-key"><span><kbd>1</kbd> / <kbd>2</kbd> / <kbd>3</kbd></span><em>' +
            (o.max >= 90 ? '补给' : 'Lv ' + Math.min(o.max, o.next)) + '</em></div>' +
        '</button>';
    }
    box.innerHTML = html;
    var cards = box.querySelectorAll('.card');
    for (var c = 0; c < cards.length; c++) {
      cards[c].addEventListener('mouseenter', function () {
        App.selected = Number(this.getAttribute('data-index'));
        paintCardSelection();
      });
      cards[c].addEventListener('click', function () {
        var idx = Number(this.getAttribute('data-index'));
        chooseCard(idx);
      });
    }
  }

  function paintCardSelection() {
    var box = $('cards');
    if (!box) return;
    var cards = box.querySelectorAll('.card');
    for (var i = 0; i < cards.length; i++) {
      cards[i].setAttribute('aria-pressed', String(i === App.selected));
    }
  }

  function chooseCard(index) {
    if (App.state !== 'levelup' || !App.game) return;
    var offer = App.offers[index];
    if (!offer) return;
    Audio.sfx('ui');
    var res = App.game.chooseUpgrade(offer.id);
    if (res === 'more') {
      App.offers = App.game.offers;
      App.selected = 0;
      var num = $('levelupNum');
      if (num) num.textContent = String(App.game.level);
      renderCards();
    } else if (res === 'resume') {
      hideScreens();
      App.state = 'playing';
      App.offers = [];
    }
  }

  // ===================================================================
  // 结算
  // ===================================================================

  function showResult(kind, data) {
    App.state = kind === 'win' ? 'win' : 'over';
    App.lastResult = data;
    Audio.setMusic(false);

    var wrap = document.querySelector('#screen-over .result-wrap');
    if (wrap) wrap.classList.toggle('is-win', kind === 'win');
    var kicker = $('overKicker');
    var title = $('overTitle');
    var sub = $('overSub');
    if (kicker) kicker.textContent = kind === 'win' ? 'MISSION COMPLETE' : 'MISSION FAILED';
    if (title) title.textContent = kind === 'win' ? '要塞已摧毁' : '全员阵亡';
    if (sub) sub.textContent = kind === 'win'
      ? '8 分钟，你把整条战线推平了。'
      : '再试一次，这次先活下来。';

    var best = U.store.get('tank-survivors.best', null);
    var isBest = !best || data.score > (best.score || 0);
    if (isBest) {
      best = { score: data.score, time: data.time, level: data.level, kills: data.kills };
      U.store.set('tank-survivors.best', best);
    }

    var grid = $('resultGrid');
    if (grid) {
      grid.innerHTML =
        '<div class="result-cell"><b>' + U.formatTime(data.time) + '</b><span>存活时间</span></div>' +
        '<div class="result-cell"><b>' + data.kills + '</b><span>击毁</span></div>' +
        '<div class="result-cell"><b>' + U.formatScore(data.score) + '</b><span>' + (isBest ? '新纪录' : '得分') + '</span></div>';
    }
    var actions = document.querySelector('.btn-primary');
    if (actions) actions.innerHTML = '再来一局 <kbd>A</kbd>';
    App.resultTimer = 0.6;
    showScreen('screen-over');
    setHudVisible(false);
  }

  // ===================================================================
  // 事件
  // ===================================================================

  function onGameEvent(name, data) {
    if (name === 'levelup') {
      openLevelup(data.offers);
    } else if (name === 'levelupMore') {
      App.offers = data.offers;
      renderCards();
    } else if (name === 'toast') {
      toast(data);
    } else if (name === 'over') {
      showResult('over', data);
    } else if (name === 'win') {
      showResult('win', data);
    }
  }

  // ===================================================================
  // HUD
  // ===================================================================

  function buildPlayerCards(game) {
    var wrap = $('hudPlayers');
    if (!wrap) return;
    var html = '';
    for (var i = 0; i < game.players.length; i++) {
      var p = game.players[i];
      html +=
        '<div class="pcard" id="pcard' + i + '" style="--pc:' + p.color + '">' +
          '<div class="pcard-top">' +
            '<span class="pcard-name" id="pname' + i + '">' + p.name + '</span>' +
            '<span class="pcard-hpnum" id="phpnum' + i + '">100</span>' +
          '</div>' +
          '<div class="pcard-hp" id="php' + i + '"><i id="phpfill' + i + '"></i></div>' +
          '<div class="pcard-bottom">' +
            '<div class="pcard-items" id="pitems' + i + '"></div>' +
            '<div class="pcard-bombs" id="pbombs' + i + '"></div>' +
            '<div class="dash-pip"><i id="pdash' + i + '"></i></div>' +
          '</div>' +
        '</div>';
    }
    wrap.innerHTML = html;

    App._hudEls = {
      timer: $('hudTimer'),
      level: $('hudLevel'),
      xpFill: $('xpFill'),
      xpGhost: $('xpGhost'),
      xpText: $('hudXpText'),
      kills: $('hudKills'),
      bossBar: $('bossBar'),
      bossFill: $('bossFill'),
      bossName: $('bossName'),
      bossHp: $('bossHpText'),
      players: []
    };
    for (var k = 0; k < game.players.length; k++) {
      App._hudEls.players.push({
        card: $('pcard' + k),
        hpFill: $('phpfill' + k),
        hpNum: $('phpnum' + k),
        hpBar: $('php' + k),
        items: $('pitems' + k),
        bombs: $('pbombs' + k),
        dash: $('pdash' + k)
      });
    }
  }

  function updateHud(force) {
    var game = App.game;
    var els = App._hudEls;
    if (!game || !els || App.state === 'title') return;
    App.hudT -= 1 / 60;
    if (!force && App.hudT > 0) return;
    App.hudT = 0.09;

    if (els.timer) els.timer.textContent = U.formatTime(game.time);
    if (els.level) els.level.textContent = String(game.level);
    var pct = Math.min(100, (game.xp / game.xpNeedNow) * 100);
    if (els.xpFill) els.xpFill.style.width = pct + '%';
    if (els.xpGhost) els.xpGhost.style.width = pct + '%';
    if (els.xpText) els.xpText.textContent = Math.floor(game.xp) + ' / ' + game.xpNeedNow;
    if (els.kills) els.kills.textContent = String(game.kills);

    // 玩家卡
    for (var i = 0; i < game.players.length; i++) {
      var p = game.players[i];
      var h = els.players[i];
      if (!h) continue;
      var down = !p.alive;
      if (h.card) h.card.classList.toggle('is-down', down);
      var hpPct = U.clamp(p.hp / p.maxHp, 0, 1) * 100;
      if (h.hpFill) h.hpFill.style.width = hpPct + '%';
      if (h.hpBar) h.hpBar.classList.toggle('shielded', p.shield > 0);
      if (h.hpNum) {
        h.hpNum.textContent = down
          ? (p.downed
              ? (p.reviveT > 0 ? '救援 ' + Math.round(Math.min(1, p.reviveT / p.reviveR) * 100) + '%' : '等待救援')
              : '阵亡')
          : Math.ceil(p.hp) + ' / ' + Math.round(p.maxHp);
      }
      if (h.items) {
        var parts = [];
        var names = { cannon: '主炮', ap: '穿甲', he: '高爆', ricochet: '跳弹', wingman: '僚机', mines: '地雷', tesla: '电磁', napalm: '燃烧', shield: '护盾', repair: '维修', engine: '引擎', armor: '装甲', ammo: '弹药', scope: '瞄准', magnet: '磁力', crit: '暴击' };
        var shown = 0, extra = 0;
        for (var key in p.up) {
          if (!p.up.hasOwnProperty(key)) continue;
          if (!(p.up[key] > 0) || !names[key]) continue;
          if (shown < 4) {
            parts.push('<span>' + names[key] + ' <b>' + p.up[key] + '</b></span>');
            shown++;
          } else {
            extra++;
          }
        }
        if (extra > 0) parts.push('<span class="more">+' + extra + '</span>');
        h.items.innerHTML = parts.join('');
      }
      if (h.bombs) {
        var bhtml = '';
        for (var b = 0; b < 5; b++) {
          bhtml += '<span class="bomb-pip' + (b < p.bombs ? ' on' : '') + '"></span>';
        }
        h.bombs.innerHTML = bhtml;
      }
      if (h.dash) {
        var ready = U.clamp(1 - p.dashCd / 1.45, 0, 1) * 100;
        h.dash.style.width = ready + '%';
      }
    }

    // Boss
    if (els.bossBar) {
      if (game.boss && !game.boss.dead) {
        els.bossBar.classList.remove('hidden');
        var bp = U.clamp(game.boss.hp / game.boss.maxHp, 0, 1) * 100;
        if (els.bossFill) els.bossFill.style.width = bp + '%';
        if (els.bossName) els.bossName.textContent = game.boss.final ? '终焉要塞 · MK-II' : '重装坦克 · 铁壁';
        if (els.bossHp) els.bossHp.textContent = Math.max(0, Math.ceil(game.boss.hp)) + ' / ' + Math.round(game.boss.maxHp);
      } else {
        els.bossBar.classList.add('hidden');
      }
    }
  }

  // ===================================================================
  // 主循环
  // ===================================================================

  var STEP = 1 / 60;

  function handleMenus() {
    var nav = Input.nav;
    if (App.state === 'title') {
      if (nav.left) {
        if (App.mode !== 1) setMode(1);
      } else if (nav.right) {
        if (App.mode !== 2) setMode(2);
      }
      if (nav.confirm) {
        startRun();
      }
      return;
    }

    if (App.state === 'levelup') {
      if (nav.left) {
        App.selected = (App.selected + 2) % 3;
        paintCardSelection();
        Audio.sfx('ui');
      } else if (nav.right) {
        App.selected = (App.selected + 1) % 3;
        paintCardSelection();
        Audio.sfx('ui');
      } else if (nav.up || nav.down) {
        App.selected = (App.selected + 1) % 3;
        paintCardSelection();
        Audio.sfx('ui');
      }
      if (Input.just('Digit1') || Input.just('Numpad1')) chooseCard(0);
      else if (Input.just('Digit2') || Input.just('Numpad2')) chooseCard(1);
      else if (Input.just('Digit3') || Input.just('Numpad3')) chooseCard(2);
      else if (nav.confirm) chooseCard(App.selected);
      return;
    }

    if (App.state === 'paused') {
      if (nav.start || nav.back) { resumeGame(); return; }
      if (nav.up) { App.pauseIndex = (App.pauseIndex + 3) % 4; renderPauseMenu(); Audio.sfx('ui'); }
      if (nav.down) { App.pauseIndex = (App.pauseIndex + 1) % 4; renderPauseMenu(); Audio.sfx('ui'); }
      if (nav.confirm) activatePause(App.pauseIndex);
      if (Input.just('KeyM')) {
        Audio.unlock();
        Audio.toggleMute();
        renderPauseMenu();
      }
      return;
    }

    if (App.state === 'over' || App.state === 'win') {
      App.resultTimer -= STEP;
      if (nav.confirm && App.resultTimer <= 0) {
        retryRun();
      } else if (nav.back) {
        quitToTitle();
      }
      return;
    }

    if (App.state === 'playing') {
      if (nav.start) { pauseGame(); return; }
      if (Input.just('KeyM')) {
        Audio.unlock();
        Audio.toggleMute();
        toast(Audio.muted ? '已静音' : '声音已开启');
      }
    }
  }

  var lastTime = 0;
  var acc = 0;

  function frame(now) {
    if (!lastTime) lastTime = now;
    var dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;

    Input.poll();
    handleMenus();

    if (App.state === 'playing' && App.game) {
      App.game.baseScale = TS.Renderer.baseScale();
      acc += dt;
      var steps = 0;
      while (acc >= STEP && steps < 5) {
        App.game.update(STEP);
        acc -= STEP;
        steps++;
        if (App.state !== 'playing') { acc = 0; break; }
      }
      if (steps === 5) acc = 0;
    } else {
      acc = 0;
    }

    TS.Renderer.renderFrame(App.game, dt);
    updateHud(false);
    if (App.state === 'title') refreshPadsThrottled(dt);

    Input.endFrame();
    requestAnimationFrame(frame);
  }

  var padRefreshT = 0;
  function refreshPadsThrottled(dt) {
    padRefreshT -= dt;
    if (padRefreshT > 0) return;
    padRefreshT = 0.4;
    refreshPads();
  }

  // ===================================================================
  // 初始化
  // ===================================================================

  function bindClicks() {
    var modes = document.querySelectorAll('.mode');
    for (var i = 0; i < modes.length; i++) {
      modes[i].addEventListener('click', function () {
        setMode(Number(this.getAttribute('data-mode')));
      });
    }

    var pauseItems = document.querySelectorAll('#pauseMenu .menu-item');
    for (var j = 0; j < pauseItems.length; j++) {
      pauseItems[j].addEventListener('mouseenter', function () {
        var nodes = Array.prototype.slice.call(document.querySelectorAll('#pauseMenu .menu-item'));
        App.pauseIndex = nodes.indexOf(this);
        renderPauseMenu();
      });
      pauseItems[j].addEventListener('click', function () {
        var nodes = Array.prototype.slice.call(document.querySelectorAll('#pauseMenu .menu-item'));
        activatePause(nodes.indexOf(this));
      });
    }

    var retry = document.querySelector('.btn-primary');
    if (retry) retry.addEventListener('click', function () {
      if (App.state === 'over' || App.state === 'win') retryRun();
      else if (App.state === 'paused') resumeGame();
    });
    var startBtn = $('startBtn');
    if (startBtn) startBtn.addEventListener('click', function () {
      if (App.state === 'title') startRun();
    });
    var quit = document.querySelectorAll('.btn-quiet');
    for (var q = 0; q < quit.length; q++) {
      quit[q].addEventListener('click', function () { quitToTitle(); });
    }
  }

  function boot() {
    var canvas = $('game');
    TS.Renderer.init(canvas);
    var remembered = U.store.get('tank-survivors.mode', 1);
    App.mode = remembered === 2 ? 2 : 1;
    Input.init(function () { refreshPads(); });
    bindClicks();
    refreshTitle();
    showScreen('screen-title');
    setHudVisible(false);

    // 首次交互后播放一点点 UI 声音，提示音频已就绪
    window.addEventListener('keydown', function once() {
      Audio.unlock();
      window.removeEventListener('keydown', once);
    });

    // 开发用直达参数（不影响正常游玩）
    var q = new URLSearchParams(window.location.search);
    if (q.get('p') === '2') App.mode = 2;
    if (q.get('auto') === '1') {
      startRun();
      devSetup(q);
    }

    requestAnimationFrame(frame);
  }

  function devSetup(q) {
    var game = App.game;
    if (!game) return;
    var lvls = parseInt(q.get('lvl') || '0', 10);
    var defs = TS.UPGRADE_DEFS;
    for (var i = 0; i < lvls; i++) {
      var def = defs[i % defs.length];
      game.players.forEach(function (p) {
        p.up[def.id] = Math.min(def.max, (p.up[def.id] || 0) + 1);
        p.stats = game.calcStats(p);
        p.maxHp = p.stats.maxHp;
        p.hp = p.maxHp;
      });
    }
    if (lvls > 0) {
      game.level = 1 + lvls;
      game.xpNeedNow = game.xpNeed(game.level);
      game.xp = Math.floor(game.xpNeedNow * 0.45);
    }
    App.state = 'playing';
    hideScreens();
    if (q.get('t')) game.time = parseFloat(q.get('t'));
    var hp = parseFloat(q.get('hp') || '0');
    if (hp > 0) {
      game.players.forEach(function (p) { p.hp = Math.min(p.hp, hp); });
    }
    if (q.get('boss') === '1') game.time = Math.max(game.time, 240);
    if (q.get('cards') === '1') {
      game.addXp(game.xpNeedNow);
    }
    updateHud(true);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window.TS = window.TS || {});
