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
      if (e.target.closest('.pg-win, .pg-dock, .pg-dock-zone, .pg-menubar, .pg-dropdown, .pg-modal-veil, a, button, input, textarea, label')) return;
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
    { id: 'myst',   prefix: 'myst',      label: 'myst cli',    glyph: 'package', mount: mountMyst },
    { id: 'files',  prefix: 'sf',        label: 'files',       glyph: 'folder', mount: mountFiles },
    { id: 'notes',  prefix: 'nt',        label: 'notes',       glyph: 'notebook-pen', mount: mountNotes }
  ];

  function mountEditor(div) { div.classList.add('pg-app'); return window.SageEditor ? new window.SageEditor(div) : null; }
  function mountRepl(div)   {
    div.classList.add('pg-app');
    return window.SageREPL ? new window.SageREPL(div, { onFirefly: function () { fire({ count: 4 }); } }) : null;
  }
  function mountMyst(div)   { div.classList.add('pg-app'); return window.MystTerminal ? new window.MystTerminal(div) : null; }
  function mountFiles(div)  { div.classList.add('pg-app'); return window.SageFiles ? new window.SageFiles(div) : null; }
  function mountNotes(div)  { div.classList.add('pg-app'); return window.SageNotes ? new window.SageNotes(div) : null; }

  function appById(id) { for (var i = 0; i < APPS.length; i++) if (APPS[i].id === id) return APPS[i]; }
  function inst(id) { return WINS[id] && WINS[id].inst; }

  // (re)mount an app's content and wire its chrome + lights
  function buildApp(app) {
    var win = WINS[app.id];
    win.inst = app.mount(win.contentEl);
    win.contentEl.classList.add('pg-app');
    wireChrome(app);
  }

  var focusedId = 'editor';
  function focusWin(app) {
    var win = WINS[app.id];
    ztop += 1;
    win.el.style.zIndex = ztop;
    focusedId = app.id;
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
    if (win.inst && typeof win.inst.destroy === 'function') {
      try { win.inst.destroy(); } catch (e) {}   // release listeners/timers
    }
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
    revealDockBriefly();
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
      win.el.classList.add('is-max');
      // fill the workspace edge-to-edge (the dock auto-hides, so no need to reserve room)
      win.el.style.left = '0px';
      win.el.style.top = '0px';
      win.el.style.width = wsEl.clientWidth + 'px';
      win.el.style.height = wsEl.clientHeight + 'px';
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
  var dockHideTimer = null;
  function dockZone() { return document.getElementById('pg-dock-zone'); }
  function revealDock() { var z = dockZone(); if (z) z.classList.add('revealed'); }
  function hideDock()   { var z = dockZone(); if (z) z.classList.remove('revealed'); }
  function scheduleHideDock(ms) {
    clearTimeout(dockHideTimer);
    dockHideTimer = setTimeout(hideDock, ms || 650);
  }
  function revealDockBriefly() { revealDock(); scheduleHideDock(1600); }
  function startDock() {
    var dock = document.getElementById('pg-dock');
    // reveal when the pointer nears the bottom edge
    window.addEventListener('pointermove', function (e) {
      if (e.clientY >= window.innerHeight - 60) { clearTimeout(dockHideTimer); revealDock(); }
      else if (dockZone() && dockZone().classList.contains('revealed') && !dock.matches(':hover')) { scheduleHideDock(); }
    }, { passive: true });
    if (dock) {
      dock.addEventListener('pointerenter', function () { clearTimeout(dockHideTimer); revealDock(); });
      dock.addEventListener('pointerleave', function () { scheduleHideDock(); });
    }
  }

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
      var win = WINS[app.id];
      if (win.maxed) {  // keep a maximised window filling the workspace on resize
        var wsEl = document.getElementById('pg-workspace');
        win.el.style.left = '0px';
        win.el.style.top = '0px';
        win.el.style.width = wsEl.clientWidth + 'px';
        win.el.style.height = wsEl.clientHeight + 'px';
        return;
      }
      if (win.userMoved) return;
      var p = pos[app.id];
      if (!p) return;   // apps without a default slot (e.g. Files) manage their own rect
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

  /* ===================================================================
     5. Menu-bar actions — the logic behind File / Edit / View / Run / …
     =================================================================== */
  function focusApp(id) { var a = appById(id); if (WINS[id].min) restore(a); else focusWin(a); }
  function restoreApp(id) { var a = appById(id); if (WINS[id].min) restore(a); }

  // ---- File ----
  function download(name, text) {
    var blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 120);
  }
  function syncEditor() {
    var ed = inst('editor');
    if (ed && ed.textarea) ed.fileContents[ed.currentFile] = ed.textarea.value;
    return ed;
  }
  function currentName() { var ed = inst('editor'); return (ed && ed.currentFile) || 'sketch.sage'; }
  // ⌘S writes the current buffer into the shared virtual filesystem (not a download).
  function saveCurrent() {
    var ed = syncEditor(); if (!ed) return;
    if (window.SageVFS && typeof ed._saveToVFS === 'function') {
      ed._saveToVFS(false);
      revealDockBriefly(); fire({ count: 4 });
      return;
    }
    // no filesystem available → fall back to a real file download
    downloadCurrent();
  }
  // File ▸ Download — pull the current file out as a real file on disk.
  function downloadCurrent() {
    var ed = syncEditor(); if (!ed) return;
    var name = currentName();
    download(name, ed.fileContents[name] || '');
    revealDockBriefly(); fire({ count: 4 });
  }
  function saveAs() {
    var ed = syncEditor(); if (!ed) return;
    var suggested = currentName();
    var name = window.prompt('Save a copy in /project as…', suggested);
    if (!name) return;
    if (!/\.\w+$/.test(name)) name += '.sage';
    var content = ed.fileContents[currentName()] || '';
    // write a copy into the VFS project dir and open it in the editor
    if (window.SageVFS && typeof ed.openInEditor === 'function') {
      var path = window.SageVFS.join(window.SageVFS.PROJECT || '/project', name);
      try {
        window.SageVFS.write(path, content);
        ed.openInEditor(path);
        focusApp('editor'); fire({ count: 4 });
        return;
      } catch (e) { /* fall through to download */ }
    }
    download(name, content);
  }
  function saveAll() {
    var ed = syncEditor(); if (!ed) return;
    Object.keys(ed.fileContents).forEach(function (name, i) {
      setTimeout(function () { download(name, ed.fileContents[name] || ''); }, i * 180);
    });
  }
  function addEditorTab(name, content) {
    var ed = inst('editor'); if (!ed) return;
    // de-dupe name
    name = ed._uniqueName ? ed._uniqueName(name) : name;
    ed.fileContents[name] = content != null ? content : '';
    if (ed._makeTab && ed.tabsEl) {
      var tab = ed._makeTab(name);
      var addBtn = ed.tabsEl.querySelector('.se-tab-add');
      ed.tabsEl.insertBefore(tab, addBtn || null);
    }
    ed._openFile(name);
    restoreApp('editor'); focusApp('editor');
  }
  function newSketch() {
    var ed = inst('editor');
    var name = (ed && ed._newUntitledName) ? ed._newUntitledName() : 'untitled-1.sage';
    addEditorTab(name,
      '# a fresh sage sketch  \u2726\n\nproc main():\n    println("hello, sage")\n\nmain()\n');
  }
  function openFromDisk() {
    var input = document.createElement('input');
    input.type = 'file'; input.accept = '.sage,.txt,text/plain';
    input.addEventListener('change', function () {
      var f = input.files && input.files[0]; if (!f) return;
      var rd = new FileReader();
      rd.onload = function () { addEditorTab(f.name, String(rd.result)); fire({ count: 5 }); };
      rd.readAsText(f);
    });
    input.click();
  }

  // ---- Edit ----
  function editExec(cmd) {
    var ed = inst('editor'); if (!ed || !ed.textarea) return;
    ed.textarea.focus();
    try { document.execCommand(cmd); } catch (e) {}
    if (ed._render) ed._render();
    if (ed._updateStatus) ed._updateStatus();
    if (ed._onInput) ed._onInput();
  }
  function selectAllEditor() { var ed = inst('editor'); if (ed && ed.textarea) { ed.textarea.focus(); ed.textarea.select(); } }
  function formatEditor() { var ed = inst('editor'); if (ed && ed._fmt) { ed._fmt(); focusApp('editor'); } }
  function clearOutput() {
    var ed = inst('editor');
    if (ed && ed.outputInner) { ed.outputInner.innerHTML = ''; ed.outputEl.classList.remove('open'); }
  }

  // ---- View ----
  function resetLayout() {
    APPS.forEach(function (a) {
      var w = WINS[a.id];
      if (w.maxed) toggleMax(a, true);
      if (w.min) restore(a);
      w.userMoved = false;
    });
    layout();
    focusApp('editor');
  }
  var firefliesOn = true;
  function toggleFireflies() {
    var c = document.getElementById('firefly-canvas'); if (!c) return;
    firefliesOn = !firefliesOn;
    c.style.transition = 'opacity .4s var(--ease-out)';
    c.style.opacity = firefliesOn ? '' : '0';
  }

  // ---- Run ----
  function runEditor() { var ed = inst('editor'); if (ed && ed._run) { restoreApp('editor'); focusApp('editor'); ed._run(); fire({ count: 5 }); } }

  // ---- Window ----
  function bringAllFront() { APPS.forEach(function (a) { if (WINS[a.id].min) restore(a); }); focusApp('editor'); }

  // ---- Help / modals ----
  function closeModal() { var v = document.querySelector('.pg-modal-veil'); if (v) v.remove(); }
  function openModal(html) {
    closeModal();
    var veil = document.createElement('div');
    veil.className = 'pg-modal-veil';
    veil.innerHTML = '<div class="pg-modal" role="dialog" aria-modal="true">' + html + '</div>';
    veil.addEventListener('click', function (e) { if (e.target === veil) closeModal(); });
    veil.querySelectorAll('.pg-modal-close').forEach(function (b) { b.addEventListener('click', closeModal); });
    document.body.appendChild(veil);
  }
  function showShortcuts() {
    var rows = [
      ['Run file', '\u2318 \u21B5'], ['Save file', '\u2318 S'], ['Save as\u2026', '\u21E7 \u2318 S'],
      ['Open file\u2026', '\u2318 O'], ['New sketch', '\u2318 N'], ['Format code', '\u21E7 \u2325 F'],
      ['Minimize window', '\u2318 M'], ['Stir fireflies', 'type \u201cfirefly\u201d']
    ].map(function (r) { return '<div class="row"><span>' + r[0] + '</span><span class="k">' + r[1] + '</span></div>'; }).join('');
    openModal(
      '<h3><span class="glyph">\u2726</span> Keyboard Shortcuts</h3>' +
      '<p class="sub">The playground speaks fluent macOS. \u2318 is Ctrl on Windows &amp; Linux.</p>' +
      rows +
      '<button class="pg-modal-close">Got it</button>'
    );
  }
  function showAbout() {
    openModal(
      '<h3><span class="glyph">\u2726</span> Sage Playground</h3>' +
      '<p class="sub">A little desktop in the firefly dark.</p>' +
      '<p>Three real Sage tools sharing one screen \u2014 a live <strong>editor</strong>, an interactive <strong>REPL</strong>, and the <strong>Myst</strong> package CLI \u2014 floating as glass windows you can drag, stack, and maximize.</p>' +
      '<p>The traffic lights work: <span class="k">red</span> resets an app fresh, <span class="k">yellow</span> tucks it to the dock, <span class="k">green</span> fills the screen. Click the dark to stir the fireflies.</p>' +
      '<button class="pg-modal-close">Lovely</button>'
    );
  }

  /* ---- menu definitions --------------------------------------------- */
  var MENUS = [
    { name: 'File', items: [
      { label: 'New Sketch', kbd: '\u2318N', act: newSketch },
      { label: 'Open\u2026', kbd: '\u2318O', act: openFromDisk },
      { sep: true },
      { label: 'Save', kbd: '\u2318S', act: saveCurrent },
      { label: 'Save As\u2026', kbd: '\u21E7\u2318S', act: saveAs },
      { sep: true },
      { label: 'Download File', act: downloadCurrent },
      { label: 'Download All Files', act: saveAll }
    ] },
    { name: 'Edit', items: [
      { label: 'Undo', kbd: '\u2318Z', act: function () { editExec('undo'); } },
      { label: 'Redo', kbd: '\u21E7\u2318Z', act: function () { editExec('redo'); } },
      { sep: true },
      { label: 'Select All', kbd: '\u2318A', act: selectAllEditor },
      { label: 'Format Code', kbd: '\u21E7\u2325F', act: formatEditor },
      { sep: true },
      { label: 'Clear Output', act: clearOutput }
    ] },
    { name: 'View', items: [
      { label: 'Reset Window Layout', act: resetLayout },
      { sep: true },
      { label: 'Focus Editor', act: function () { focusApp('editor'); } },
      { label: 'Focus REPL', act: function () { focusApp('repl'); } },
      { label: 'Focus Myst CLI', act: function () { focusApp('myst'); } },
      { label: 'Focus Files', act: function () { focusApp('files'); } },
      { label: 'Focus Notes', act: function () { focusApp('notes'); } },
      { sep: true },
      { label: 'Stir the Fireflies', act: function () { fire({ count: 14 }); } },
      { label: 'Toggle Fireflies', act: toggleFireflies }
    ] },
    { name: 'Run', items: [
      { label: 'Run File', kbd: '\u2318\u21B5', act: runEditor },
      { label: 'Format & Run', act: function () { formatEditor(); runEditor(); } },
      { sep: true },
      { label: 'Clear Output', act: clearOutput },
      { label: 'Restart REPL', act: function () { resetApp(appById('repl')); focusApp('repl'); } }
    ] },
    { name: 'Window', items: [
      { label: 'Minimize', kbd: '\u2318M', act: function () { minimise(appById(focusedId)); } },
      { label: 'Zoom / Maximize', act: function () { toggleMax(appById(focusedId)); } },
      { label: 'Reset This App', act: function () { resetApp(appById(focusedId)); } },
      { sep: true },
      { label: 'Bring All to Front', act: bringAllFront }
    ] },
    { name: 'Help', items: [
      { label: 'Keyboard Shortcuts', act: showShortcuts },
      { label: 'About Sage Playground', act: showAbout },
      { sep: true },
      { label: 'Release a Firefly \u2726', act: function () { fire({ count: 8 }); } }
    ] }
  ];

  var openMenu = null;
  function closeMenus() {
    if (!openMenu) return;
    openMenu.btn.classList.remove('open');
    openMenu.dd.remove();
    openMenu = null;
  }
  function openMenuAt(menu, btn) {
    closeMenus();
    var dd = document.createElement('div');
    dd.className = 'pg-dropdown';
    menu.items.forEach(function (it) {
      if (it.sep) { var s = document.createElement('div'); s.className = 'pg-dd-sep'; dd.appendChild(s); return; }
      var row = document.createElement('button');
      row.className = 'pg-dd-item'; row.type = 'button';
      row.innerHTML = '<span class="pg-dd-label">' + it.label + '</span>' +
        (it.kbd ? '<span class="pg-dd-kbd">' + it.kbd + '</span>' : '');
      row.addEventListener('click', function (e) {
        e.stopPropagation(); closeMenus();
        try { it.act && it.act(); } catch (err) { console.warn('menu action failed', err); }
      });
      dd.appendChild(row);
    });
    document.body.appendChild(dd);
    var r = btn.getBoundingClientRect();
    var left = Math.min(r.left, window.innerWidth - dd.offsetWidth - 8);
    dd.style.left = Math.max(6, left) + 'px';
    dd.style.top = (r.bottom + 4) + 'px';
    btn.classList.add('open');
    openMenu = { menu: menu, btn: btn, dd: dd };
  }
  function buildMenus() {
    var host = document.getElementById('pg-menus');
    if (!host) return;
    host.innerHTML = '';
    MENUS.forEach(function (menu, idx) {
      var btn = document.createElement('button');
      btn.className = 'pg-menu' + (idx === 0 ? ' is-strong' : '');
      btn.type = 'button';
      btn.textContent = menu.name;
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        if (openMenu && openMenu.menu === menu) closeMenus();
        else openMenuAt(menu, btn);
      });
      btn.addEventListener('pointerenter', function () {
        if (openMenu && openMenu.menu !== menu) openMenuAt(menu, btn);
      });
      host.appendChild(btn);
    });
    document.addEventListener('click', closeMenus);
    window.addEventListener('blur', closeMenus);
    window.addEventListener('keydown', function (e) { if (e.key === 'Escape') { closeMenus(); closeModal(); } });
  }

  /* ---- global keyboard shortcuts ------------------------------------ */
  function startShortcuts() {
    window.addEventListener('keydown', function (e) {
      var cmd = e.metaKey || e.ctrlKey;
      if (!cmd) return;
      var k = (e.key || '').toLowerCase();
      if (k === 's') { e.preventDefault(); e.shiftKey ? saveAs() : saveCurrent(); }
      else if (k === 'o') { e.preventDefault(); openFromDisk(); }
      else if (k === 'n') { e.preventDefault(); newSketch(); }
      else if (k === 'm') { e.preventDefault(); minimise(appById(focusedId)); }
      else if (k === 'enter') {
        // editor's textarea handles its own ⌘↵; only step in elsewhere
        if (e.target && e.target.classList && e.target.classList.contains('se-textarea')) return;
        e.preventDefault(); runEditor();
      }
    });
  }

  /* ---- boot ---------------------------------------------------------- */
  function initWindows() {
    var wsEl = document.getElementById('pg-workspace');
    APPS.forEach(function (app) {
      var el = document.createElement('div');
      el.className = 'pg-win pg-win-' + app.id;
      el.dataset.app = app.id;
      var content = document.createElement('div');
      // ids must match what the components expect
      if (app.id === 'repl') content.id = 'sage-repl';
      else if (app.id === 'editor') content.id = 'sage-editor';
      else if (app.id === 'files') content.id = 'sage-files';
      else if (app.id === 'notes') content.id = 'sage-notes';
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
    // The Files window starts tucked into the dock so the default 3-pane layout
    // stays clean — give it a sensible centred restore size first.
    (function setupFiles() {
      var fw = WINS.files; if (!fw) return;
      var W = wsEl.clientWidth, H = wsEl.clientHeight;
      var fwW = Math.min(620, W - 40), fwH = Math.min(460, H - 60);
      fw.el.style.left = Math.max(20, Math.round((W - fwW) / 2)) + 'px';
      fw.el.style.top = Math.max(20, Math.round((H - fwH) / 2)) + 'px';
      fw.el.style.width = fwW + 'px';
      fw.el.style.height = fwH + 'px';
      fw.userMoved = true;               // it manages its own rect from here
      // Apply the minimised state instantly — suppress the transition so the
      // boot-time hide doesn't depend on an animation frame completing.
      fw.el.style.transition = 'none';
      fw.el.classList.add('is-min');
      fw.min = true;
      void fw.el.offsetHeight;           // commit the no-transition frame
      fw.el.style.transition = '';       // later restore still animates
      setDock('files', 'min', true);
    })();
    // Notes also starts closed (tucked into the dock) so the default desktop
    // stays the three coding panes; open it from the dock when you want it.
    (function setupNotes() {
      var nw = WINS.notes; if (!nw) return;
      var W = wsEl.clientWidth, H = wsEl.clientHeight;
      var nwW = Math.min(680, W - 40), nwH = Math.min(500, H - 60);
      nw.el.style.left = Math.max(20, Math.round((W - nwW) / 2)) + 'px';
      nw.el.style.top = Math.max(20, Math.round((H - nwH) / 2)) + 'px';
      nw.el.style.width = nwW + 'px';
      nw.el.style.height = nwH + 'px';
      nw.userMoved = true;
      nw.el.style.transition = 'none';
      nw.el.classList.add('is-min');
      nw.min = true;
      void nw.el.offsetHeight;
      nw.el.style.transition = '';
      setDock('notes', 'min', true);
    })();
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
    if (window.sageFilesInjectCSS) window.sageFilesInjectCSS();
    if (window.sageNotesInjectCSS) window.sageNotesInjectCSS();
    // cross-app bridge — the file browser opens files in the editor through this.
    window.SagePlayground = {
      openInEditor: function (path) {
        var ed = inst('editor');
        if (WINS.editor && WINS.editor.min) restore(appById('editor'));
        focusApp('editor');
        if (ed && typeof ed.openInEditor === 'function') ed.openInEditor(path);
      },
      focusApp: focusApp,
      fire: fire
    };
    startFireflies();
    startCharms();
    startClock();
    buildMenus();
    buildDock();
    startDock();
    startShortcuts();
    initWindows();
    drawIcons();
    // first interaction fades the hint; it also fades on its own after a bit
    document.addEventListener('pointerdown', fadeHint, { once: true });
    setTimeout(fadeHint, 8000);
    // greet the user with the dock, then let it tuck away
    setTimeout(revealDockBriefly, 700);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
