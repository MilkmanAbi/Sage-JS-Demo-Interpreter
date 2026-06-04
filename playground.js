/* =========================================================================
   Sage Playground — the OS shell.
   A tiny window manager over three real apps (editor / repl / myst), the
   same firefly swarm as the main site, and the little keyboard charms.
   Traffic lights are wired per the brief:
     red  → reset (rebuild the app fresh, never closes)
     yellow → minimise (genie to the dock, state-free rebuild on restore? no —
              minimise PRESERVES state; only red resets)
     green → maximise (fill the workspace; click again to restore)
   ========================================================================= */
(function () {
  'use strict';
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function fire(detail) {
    if (reduceMotion) return;
    window.dispatchEvent(new CustomEvent('sage:firefly', { detail: detail || {} }));
  }

  /* ===================================================================
     1. Lucide + clock
     =================================================================== */
  function drawIcons() {
    if (window.lucide && typeof window.lucide.createIcons === 'function') window.lucide.createIcons();
  }

  function startClock() {
    var el = document.getElementById('pg-clock');
    if (!el) return;
    var days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    function tick() {
      var d = new Date();
      var h = d.getHours(), m = d.getMinutes();
      var ap = h < 12 ? 'AM' : 'PM';
      var hh = h % 12; if (hh === 0) hh = 12;
      var mm = m < 10 ? '0' + m : m;
      el.textContent = days[d.getDay()] + '  ' + hh + ':' + mm + ' ' + ap;
    }
    tick();
    setInterval(tick, 1000 * 20);
  }

  /* ===================================================================
     2. Firefly canvas — lifted from the main site, unchanged in spirit.
     =================================================================== */
  function startFireflies() {
    var canvas = document.getElementById('firefly-canvas');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var W = 0, H = 0;
    var flies = [];
    var pointer = { x: 0, y: 0, active: false };

    var PALETTE = [
      [255, 236, 188], [255, 226, 160], [255, 244, 214],
      [255, 236, 188], [255, 226, 160],
      [196, 169, 228], [156, 196, 232], [168, 216, 188], [230, 169, 204]
    ];
    function count() {
      if (window.innerWidth < 480) return 22;
      if (window.innerWidth < 768) return 34;
      return 52;
    }
    function Fly(init) { this.reset(init); }
    Fly.prototype.reset = function (init) {
      this.x = Math.random() * W;
      this.y = init ? H * (1 - Math.pow(Math.random(), 1.7)) : H + 20 + Math.random() * 40;
      this.vy = -(0.20 + Math.random() * 0.5);
      this.vx = (Math.random() - 0.5) * 0.16;
      this.phase = Math.random() * Math.PI * 2;
      this.driftF = 0.008 + Math.random() * 0.018;
      this.driftA = 0.5 + Math.random() * 1.4;
      this.size = 1.1 + Math.random() * 2.2;
      this.glow = this.size * (7 + Math.random() * 9);
      this.baseOp = 0.4 + Math.random() * 0.55;
      this.opacity = 0;
      this.blinkP = Math.random() * Math.PI * 2;
      this.blinkS = 0.02 + Math.random() * 0.05;
      this.life = 0; this.curious = 0; this.flash = 0;
      var c = PALETTE[(Math.random() * PALETTE.length) | 0];
      this.r = c[0]; this.g = c[1]; this.b = c[2];
    };
    Fly.prototype.update = function () {
      this.life++;
      var fadeIn = Math.min(1, this.life / 55);
      var yr = this.y / H;
      var heightFade = Math.pow(Math.max(0, Math.min(1, yr * 1.12)), 0.9);
      var blink = 0.6 + 0.4 * Math.sin(this.blinkP + this.life * this.blinkS);
      this.opacity = this.baseOp * fadeIn * heightFade * blink;
      if (pointer.active) {
        var pdx = pointer.x - this.x, pdy = pointer.y - this.y;
        var pd = Math.sqrt(pdx * pdx + pdy * pdy);
        var R = 150;
        if (pd < R) {
          var k = 1 - pd / R;
          this.x += (pdx / (pd || 1)) * k * 0.55;
          this.y += (pdy / (pd || 1)) * k * 0.55;
          if (k > this.curious) this.curious = k;
        }
      }
      if (this.curious > 0.001) {
        this.opacity = Math.min(1, this.opacity * (1 + this.curious * 1.1));
        this.curious *= 0.93;
      }
      if (this.flash > 0.001) {
        this.opacity = Math.min(1, this.opacity + this.flash * 0.7);
        this.flash *= 0.95;
      }
      this.x += this.vx + Math.sin(this.phase + this.life * this.driftF) * this.driftA * 0.1;
      this.y += this.vy;
      if (this.y < -30) this.reset(false);
    };
    Fly.prototype.draw = function () {
      if (!(this.opacity > 0.01)) return;   // also catches NaN
      var x = this.x, y = this.y, r = this.r, g = this.g, b = this.b, op = this.opacity;
      var og = ctx.createRadialGradient(x, y, 0, x, y, this.glow);
      og.addColorStop(0, 'rgba(' + r + ',' + g + ',' + b + ',' + (op * 0.6) + ')');
      og.addColorStop(0.45, 'rgba(' + r + ',' + g + ',' + b + ',' + (op * 0.16) + ')');
      og.addColorStop(1, 'rgba(' + r + ',' + g + ',' + b + ',0)');
      ctx.beginPath(); ctx.arc(x, y, this.glow, 0, Math.PI * 2); ctx.fillStyle = og; ctx.fill();
      var cg = ctx.createRadialGradient(x, y, 0, x, y, this.size * 2);
      cg.addColorStop(0, 'rgba(255,250,240,' + Math.min(1, op * 1.5) + ')');
      cg.addColorStop(0.5, 'rgba(' + r + ',' + g + ',' + b + ',' + op + ')');
      cg.addColorStop(1, 'rgba(' + r + ',' + g + ',' + b + ',0)');
      ctx.beginPath(); ctx.arc(x, y, this.size * 2, 0, Math.PI * 2); ctx.fillStyle = cg; ctx.fill();
    };
    function resize() {
      W = window.innerWidth || 1; H = window.innerHeight || 1;
      canvas.width = W * dpr; canvas.height = H * dpr;
      canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      flies = [];
      var n = count();
      for (var i = 0; i < n; i++) flies.push(new Fly(true));
    }
    var raf = null;
    function loop() {
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'lighter';
      for (var i = 0; i < flies.length; i++) { flies[i].update(); flies[i].draw(); }
      ctx.globalCompositeOperation = 'source-over';
      raf = window.requestAnimationFrame(loop);
    }
    function drawStatic() {
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'lighter';
      for (var i = 0; i < flies.length; i++) { flies[i].opacity = flies[i].baseOp * 0.85; flies[i].draw(); }
      ctx.globalCompositeOperation = 'source-over';
    }
    window.addEventListener('pointermove', function (e) {
      pointer.x = e.clientX; pointer.y = e.clientY; pointer.active = true;
    }, { passive: true });
    window.addEventListener('pointerout', function (e) { if (!e.relatedTarget) pointer.active = false; });
    window.addEventListener('blur', function () { pointer.active = false; });
    function pickDim(n) { return flies.slice().sort(function (a, b) { return a.opacity - b.opacity; }).slice(0, n); }
    function release(opts) {
      opts = opts || {};
      var n = Math.min(opts.count || 6, flies.length);
      pickDim(n).forEach(function (f) {
        if (opts.x != null) {
          f.x = opts.x + (Math.random() - 0.5) * 26; f.y = opts.y + (Math.random() - 0.5) * 18;
          f.vy = -(0.5 + Math.random() * 0.7); f.vx = (Math.random() - 0.5) * 0.6;
          f.size = 1.5 + Math.random() * 1.6; f.flash = 1.1;
        } else {
          f.x = Math.random() * W; f.y = H * 0.62 + Math.random() * H * 0.38;
          f.vy = -(0.4 + Math.random() * 0.7); f.vx = (Math.random() - 0.5) * 0.5;
          f.size = 1.5 + Math.random() * 1.6; f.flash = 1.1;
        }
        f.glow = f.size * (9 + Math.random() * 8);
        f.life = 60; f.baseOp = 0.8 + Math.random() * 0.2; f.curious = 0;
      });
      if (reduceMotion) drawStatic();
    }
    window.addEventListener('sage:firefly', function (e) { release(e.detail || {}); });
    resize();
    var rt = null;
    window.addEventListener('resize', function () {
      clearTimeout(rt);
      rt = setTimeout(function () {
        if (raf) window.cancelAnimationFrame(raf);
        resize();
        if (reduceMotion) drawStatic(); else loop();
      }, 180);
    }, { passive: true });
    if (reduceMotion) drawStatic(); else loop();
    // re-measure once the iframe has settled (innerHeight can be 0 on first paint)
    window.addEventListener('load', function () {
      if (window.innerHeight && window.innerHeight !== H) {
        if (raf) window.cancelAnimationFrame(raf);
        resize();
        if (reduceMotion) drawStatic(); else loop();
      }
    });
  }

  /* ===================================================================
     3. Charms — click empty desktop to release a firefly, type sage words.
     =================================================================== */
  function startCharms() {
    document.addEventListener('click', function (e) {
      if (reduceMotion) return;
      if (e.target.closest('.pg-win, .pg-dock, .pg-menubar, a, button, input, textarea, label')) return;
      if (window.getSelection && String(window.getSelection())) return;
      fire({ x: e.clientX, y: e.clientY, count: 3 });
    });
    var seq = '';
    window.addEventListener('keydown', function (e) {
      var t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (!e.key || e.key.length !== 1) return;
      seq = (seq + e.key.toLowerCase()).slice(-10);
      if (/firefly$/.test(seq)) fire({ count: 12 });
      else if (/sage$/.test(seq)) fire({ count: 6 });
    });
  }

  /* ===================================================================
     4. Window manager
     =================================================================== */
  var ZBASE = 60, ztop = ZBASE;
  var WINS = {};   // id -> state

  var APPS = [
    { id: 'editor', prefix: 'se',        label: 'sage editor', glyph: 'code', mount: mountEditor },
    { id: 'repl',   prefix: 'sage-repl', label: 'sage repl',   glyph: 'terminal', mount: mountRepl },
    { id: 'myst',   prefix: 'myst',      label: 'myst cli',    glyph: 'package', mount: mountMyst }
  ];

  function mountEditor(div) { if (window.SageEditor) new window.SageEditor(div); div.classList.add('pg-app'); }
  function mountRepl(div)   {
    if (window.SageREPL) new window.SageREPL(div, { onFirefly: function () { fire({ count: 4 }); } });
    div.classList.add('pg-app');
  }
  function mountMyst(div)   { if (window.MystTerminal) new window.MystTerminal(div); div.classList.add('pg-app'); }

  function appById(id) { for (var i = 0; i < APPS.length; i++) if (APPS[i].id === id) return APPS[i]; }

  // (re)mount an app's content and wire its chrome + lights
  function buildApp(app) {
    var win = WINS[app.id];
    var div = win.contentEl;
    app.mount(div);
    wireChrome(app);
  }

  function focusWin(app) {
    var win = WINS[app.id];
    ztop += 1;
    win.el.style.zIndex = ztop;
    Object.keys(WINS).forEach(function (k) { WINS[k].el.classList.toggle('is-focused', k === app.id); });
  }

  function wireChrome(app) {
    var win = WINS[app.id];
    var prefix = app.prefix;
    var chrome = win.contentEl.querySelector('.' + prefix + '-chrome');
    var rDot = win.contentEl.querySelector('.' + prefix + '-dot-r');
    var yDot = win.contentEl.querySelector('.' + prefix + '-dot-y');
    var gDot = win.contentEl.querySelector('.' + prefix + '-dot-g');

    if (rDot) rDot.addEventListener('click', function (e) { e.stopPropagation(); resetApp(app); });
    if (yDot) yDot.addEventListener('click', function (e) { e.stopPropagation(); minimise(app); });
    if (gDot) gDot.addEventListener('click', function (e) { e.stopPropagation(); toggleMax(app); });

    if (chrome) {
      chrome.addEventListener('pointerdown', function (e) {
        if (e.target.closest('.' + prefix + '-dot')) return;     // don't drag from a light
        if (win.maxed) return;                                    // no drag while maximised
        startDrag(app, e);
      });
      // double-click the title bar → maximise toggle (classic)
      chrome.addEventListener('dblclick', function (e) {
        if (e.target.closest('.' + prefix + '-dot')) return;
        toggleMax(app);
      });
    }
    // focus on any interaction inside
    win.el.addEventListener('pointerdown', function () { focusWin(app); }, true);
  }

  /* ---- drag ---------------------------------------------------------- */
  var drag = null;
  function startDrag(app, e) {
    var win = WINS[app.id];
    var ws = document.getElementById('pg-workspace').getBoundingClientRect();
    drag = {
      app: app,
      dx: e.clientX - win.el.offsetLeft,
      dy: e.clientY - win.el.offsetTop,
      ws: ws
    };
    win.el.classList.add('is-dragging');
    win.el.style.transition = 'none';
    focusWin(app);
    fadeHint();
    e.preventDefault();
  }
  window.addEventListener('pointermove', function (e) {
    if (!drag) return;
    var win = WINS[drag.app.id];
    var w = win.el.offsetWidth, h = win.el.offsetHeight;
    var maxL = drag.ws.width - 60, maxT = drag.ws.height - 40;
    var L = Math.max(-w + 120, Math.min(maxL, e.clientX - drag.dx));
    var T = Math.max(0, Math.min(maxT, e.clientY - drag.dy));
    win.el.style.left = L + 'px';
    win.el.style.top = T + 'px';
  }, { passive: false });
  window.addEventListener('pointerup', function () {
    if (!drag) return;
    var win = WINS[drag.app.id];
    win.el.classList.remove('is-dragging');
    win.el.style.transition = '';
    drag = null;
  });

  /* ---- traffic light actions ---------------------------------------- */
  function resetApp(app) {
    var win = WINS[app.id];
    // a soft shower of light from the window's title
    var r = win.el.getBoundingClientRect();
    fire({ x: r.left + 30, y: r.top + 14, count: 5 });
    win.contentEl.innerHTML = '';
    win.contentEl.removeAttribute('class');
    win.contentEl.removeAttribute('style');
    buildApp(app);          // fresh environment, fresh state
    if (win.maxed) { /* keep maximised frame */ }
    focusWin(app);
    flashReset(app);
  }
  function flashReset(app) {
    var win = WINS[app.id];
    win.el.animate(
      [{ filter: 'brightness(1.5)' }, { filter: 'brightness(1)' }],
      { duration: 420, easing: 'cubic-bezier(0.22,1,0.36,1)' }
    );
  }

  function minimise(app) {
    var win = WINS[app.id];
    if (win.maxed) toggleMax(app, true);
    win.el.classList.add('is-min');
    win.min = true;
    setDock(app.id, 'min', true);
    var r = win.el.getBoundingClientRect();
    fire({ x: r.left + r.width / 2, y: r.top + r.height / 2, count: 3 });
  }
  function restore(app) {
    var win = WINS[app.id];
    win.el.classList.remove('is-min');
    win.min = false;
    setDock(app.id, 'min', false);
    focusWin(app);
  }
  function toggleMax(app, silent) {
    var win = WINS[app.id];
    var wsEl = document.getElementById('pg-workspace');
    if (!win.maxed) {
      win.restoreRect = { left: win.el.style.left, top: win.el.style.top, width: win.el.style.width, height: win.el.style.height };
      var pad = 12;
      win.el.classList.add('is-max');
      win.el.style.left = pad + 'px';
      win.el.style.top = pad + 'px';
      win.el.style.width = (wsEl.clientWidth - pad * 2) + 'px';
      win.el.style.height = (wsEl.clientHeight - pad * 2 - 70) + 'px'; // leave dock room
      win.maxed = true;
      focusWin(app);
      if (!silent) { var r = win.el.getBoundingClientRect(); fire({ count: 5 }); }
    } else {
      win.el.classList.remove('is-max');
      var rr = win.restoreRect || {};
      win.el.style.left = rr.left || '40px';
      win.el.style.top = rr.top || '40px';
      win.el.style.width = rr.width || '440px';
      win.el.style.height = rr.height || '360px';
      win.maxed = false;
    }
  }

  /* ---- dock ---------------------------------------------------------- */
  function setDock(id, key, val) {
    var item = document.querySelector('.pg-dock-item[data-app="' + id + '"]');
    if (!item) return;
    if (key === 'min') item.classList.toggle('is-min', val);
  }
  function buildDock() {
    var dock = document.getElementById('pg-dock');
    if (!dock) return;
    APPS.forEach(function (app) {
      var item = document.createElement('button');
      item.className = 'pg-dock-item is-open app-' + app.id;
      item.dataset.app = app.id;
      item.type = 'button';
      item.innerHTML =
        '<span class="di-glyph"><i data-lucide="' + app.glyph + '"></i></span>' +
        '<span class="pg-dock-tip">' + app.label + '</span>' +
        '<span class="di-run"></span>';
      item.addEventListener('click', function () {
        var win = WINS[app.id];
        if (win.min) restore(app);
        else focusWin(app);
        var a = appById(app.id);
        // bounce
        item.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-12px)' }, { transform: 'translateY(0)' }],
          { duration: 420, easing: 'cubic-bezier(0.22,1,0.36,1)' });
      });
      dock.appendChild(item);
    });
  }

  /* ---- initial layout ----------------------------------------------- */
  function layout() {
    var wsEl = document.getElementById('pg-workspace');
    var W = wsEl.clientWidth, H = wsEl.clientHeight;
    var gap = 18, dockRoom = 78;
    var avail = H - dockRoom;
    var stacked = W < 900;

    var pos = {};
    if (stacked) {
      // narrow: stack editor over a short repl + myst row-ish (still floating)
      pos.editor = { left: gap, top: gap, w: W - gap * 2, h: Math.round(avail * 0.5) };
      var rh = Math.round((avail * 0.5 - gap) / 2);
      pos.repl = { left: gap, top: pos.editor.top + pos.editor.h + gap, w: W - gap * 2, h: rh };
      pos.myst = { left: gap, top: pos.repl.top + rh + gap, w: W - gap * 2, h: rh };
    } else {
      var editorW = Math.max(380, Math.min(760, Math.round(W * 0.55)));
      pos.editor = { left: gap, top: gap, w: editorW, h: avail - gap };
      var rightX = gap + editorW + gap;
      var rightW = Math.max(320, W - rightX - gap);
      var rh2 = Math.round((avail - gap * 2) / 2);
      pos.repl = { left: rightX, top: gap, w: rightW, h: rh2 };
      pos.myst = { left: rightX, top: gap + rh2 + gap, w: rightW, h: avail - gap - rh2 };
    }
    APPS.forEach(function (app) {
      var win = WINS[app.id]; if (win.maxed || win.userMoved) return;
      var p = pos[app.id];
      win.el.style.left = p.left + 'px';
      win.el.style.top = p.top + 'px';
      win.el.style.width = p.w + 'px';
      win.el.style.height = p.h + 'px';
    });
  }

  function fadeHint() {
    var h = document.getElementById('pg-hint');
    if (h) h.classList.add('gone');
  }

  /* ---- boot ---------------------------------------------------------- */
  function initWindows() {
    var wsEl = document.getElementById('pg-workspace');
    APPS.forEach(function (app) {
      var el = document.createElement('div');
      el.className = 'pg-win pg-win-' + app.id;
      el.dataset.app = app.id;
      var content = document.createElement('div');
      content.id = 'sage-' + (app.id === 'repl' ? 'repl' : app.id === 'editor' ? 'editor' : 'cli');
      // ids must match what the components expect
      if (app.id === 'repl') content.id = 'sage-repl';
      else if (app.id === 'editor') content.id = 'sage-editor';
      else content.id = 'myst-cli';
      el.appendChild(content);
      wsEl.appendChild(el);
      WINS[app.id] = { el: el, contentEl: content, min: false, maxed: false, userMoved: false };
    });
    // mark userMoved once a real drag happens, so resize doesn't yank windows back
    APPS.forEach(function (app) {
      WINS[app.id].el.addEventListener('pointerdown', function (e) {
        if (e.target.closest('.' + app.prefix + '-chrome') && !e.target.closest('.' + app.prefix + '-dot')) {
          WINS[app.id].userMoved = true;
        }
      });
    });

    APPS.forEach(buildApp);
    layout();
    drawIcons();
    focusWin(appById('editor'));

    var rt = null;
    window.addEventListener('resize', function () {
      clearTimeout(rt);
      rt = setTimeout(layout, 200);
    });
  }

  /* ===================================================================
     boot
     =================================================================== */
  function init() {
    // the components inject their own stylesheets inside their (guarded) init();
    // we drive them manually, so inject those styles up front, once.
    if (window.sageInjectCSS) window.sageInjectCSS();
    if (window.mystInjectCSS) window.mystInjectCSS();
    if (window.sageEditorInjectCSS) window.sageEditorInjectCSS();
    startFireflies();
    startCharms();
    startClock();
    buildDock();
    initWindows();
    drawIcons();
    // first interaction fades the hint; it also fades on its own after a bit
    document.addEventListener('pointerdown', fadeHint, { once: true });
    setTimeout(fadeHint, 8000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
