/*!
 * sage-files.js — Sage Playground file browser (Finder / Nautilus style)
 *
 * A simple graphical file manager over the shared in-RAM filesystem
 * (window.SageVFS). Browse directories, make folders & files, rename, delete,
 * and double-click a .sage file to open it in the editor.
 *
 * Drop-in for the playground window-manager:
 *   - constructor:  new SageFiles(containerEl)
 *   - exposes:      window.SageFiles, window.sageFilesInjectCSS
 *   - chrome prefix 'sf'  (sf-chrome, sf-dot-r/y/g) to match wireChrome()
 *   - content id    'sage-files'
 *
 * Cross-app bridge: opening a file calls window.SagePlayground.openInEditor(path)
 * when present; otherwise it dispatches a 'sage:open-file' CustomEvent.
 */
(function (global) {
  'use strict';

  var PROJECT = '/project';

  function vfs() { return global.SageVFS || null; }

  // ── file-type glyphs ─────────────────────────────────────────────────────
  function iconFor(item) {
    if (item.type === 'dir') {
      if (item.name === 'myst_libs') return 'library';
      if (item.name === '.myst')     return 'settings';
      if (item.name === 'src')       return 'folder-code';
      if (item.name === 'examples')  return 'folder-open';
      return 'folder';
    }
    var n = item.name.toLowerCase();
    if (n.endsWith('.sage') || n.endsWith('.sageh')) return 'file-code-2';
    if (n.endsWith('.toml'))  return 'settings-2';
    if (n.endsWith('.lock'))  return 'lock';
    if (n.endsWith('.md'))    return 'file-text';
    if (n.endsWith('.json'))  return 'braces';
    return 'file';
  }
  function kindClass(item) {
    if (item.type === 'dir') return 'sf-i-dir';
    var n = item.name.toLowerCase();
    if (n.endsWith('.sage') || n.endsWith('.sageh')) return 'sf-i-sage';
    if (n.endsWith('.toml') || n.endsWith('.lock'))  return 'sf-i-cfg';
    if (n.endsWith('.md'))   return 'sf-i-doc';
    if (n.endsWith('.json')) return 'sf-i-json';
    return 'sf-i-file';
  }
  function fmtSize(bytes) {
    if (!bytes) return '—';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ── the app ────────────────────────────────────────────────────────────────
  function SageFiles(container) {
    this.container = container;
    this.fs = vfs();
    this.cwd = PROJECT;
    this.history = [PROJECT];
    this.histIdx = 0;
    this.selected = null;
    this.view = 'grid';   // 'grid' | 'list'
    this._build();
    this._render();

    // live refresh whenever any app touches the filesystem
    var self = this;
    if (this.fs && this.fs.on) {
      this._offVfs = this.fs.on(function () { self._render(); });
    }
  }

  SageFiles.prototype._build = function () {
    var self = this;
    this.container.innerHTML = '';
    this.container.className = 'sf-host';

    // chrome (traffic lights handled by the playground via the sf- prefix)
    var chrome = document.createElement('div');
    chrome.className = 'sf-chrome';
    chrome.innerHTML =
      '<span class="sf-dot sf-dot-r" title="Close"></span>' +
      '<span class="sf-dot sf-dot-y" title="Minimise"></span>' +
      '<span class="sf-dot sf-dot-g" title="Full screen"></span>' +
      '<span class="sf-chrome-title">files</span>' +
      '<span class="sf-chrome-badge">VFS</span>';
    this.container.appendChild(chrome);

    // toolbar: nav + breadcrumb + actions
    var toolbar = document.createElement('div');
    toolbar.className = 'sf-toolbar';
    toolbar.innerHTML =
      '<button class="sf-nav sf-back"  title="Back">'    + '<i data-lucide="chevron-left"></i></button>' +
      '<button class="sf-nav sf-fwd"   title="Forward">' + '<i data-lucide="chevron-right"></i></button>' +
      '<button class="sf-nav sf-up"    title="Up">'      + '<i data-lucide="chevron-up"></i></button>' +
      '<div class="sf-crumbs" id="sf-crumbs"></div>' +
      '<div class="sf-actions">' +
        '<button class="sf-act sf-newfolder" title="New folder"><i data-lucide="folder-plus"></i></button>' +
        '<button class="sf-act sf-newfile"   title="New file"><i data-lucide="file-plus-2"></i></button>' +
        '<button class="sf-act sf-viewtoggle" title="Toggle view"><i data-lucide="layout-grid"></i></button>' +
        '<button class="sf-act sf-refresh"   title="Refresh"><i data-lucide="refresh-cw"></i></button>' +
      '</div>';
    this.container.appendChild(toolbar);

    // body: sidebar + main
    var body = document.createElement('div');
    body.className = 'sf-body';

    var side = document.createElement('div');
    side.className = 'sf-sidebar';
    side.innerHTML =
      '<div class="sf-side-h">Favorites</div>' +
      '<button class="sf-fav" data-path="' + PROJECT + '"><i data-lucide="home"></i><span>project</span></button>' +
      '<button class="sf-fav" data-path="' + PROJECT + '/myst_libs"><i data-lucide="library"></i><span>myst libs</span></button>' +
      '<div class="sf-side-h">System</div>' +
      '<button class="sf-fav" data-path="/"><i data-lucide="hard-drive"></i><span>root</span></button>';
    body.appendChild(side);

    var main = document.createElement('div');
    main.className = 'sf-main';
    main.id = 'sf-main';
    body.appendChild(main);
    this.mainEl = main;

    this.container.appendChild(body);

    // status bar
    var status = document.createElement('div');
    status.className = 'sf-status';
    status.id = 'sf-status';
    this.container.appendChild(status);

    // wire toolbar
    chrome.querySelector('.sf-chrome-title');
    toolbar.querySelector('.sf-back').addEventListener('click', function () { self._back(); });
    toolbar.querySelector('.sf-fwd').addEventListener('click', function () { self._forward(); });
    toolbar.querySelector('.sf-up').addEventListener('click', function () { self._up(); });
    toolbar.querySelector('.sf-newfolder').addEventListener('click', function () { self._newFolder(); });
    toolbar.querySelector('.sf-newfile').addEventListener('click', function () { self._newFile(); });
    toolbar.querySelector('.sf-viewtoggle').addEventListener('click', function () { self._toggleView(); });
    toolbar.querySelector('.sf-refresh').addEventListener('click', function () { self._render(); });

    // sidebar favorites
    side.querySelectorAll('.sf-fav').forEach(function (b) {
      b.addEventListener('click', function () { self._navigate(b.dataset.path); });
    });

    // clear selection + close context menu on background click
    main.addEventListener('click', function (e) {
      if (e.target === main || e.target.classList.contains('sf-grid') || e.target.classList.contains('sf-list')) {
        self.selected = null;
        self._renderSelection();
        self._closeMenu();
      }
    });
    main.addEventListener('contextmenu', function (e) {
      if (e.target === main || e.target.classList.contains('sf-grid') || e.target.classList.contains('sf-list')) {
        e.preventDefault();
        self._openMenu(e.clientX, e.clientY, null);
      }
    });

    if (global.lucide && global.lucide.createIcons) global.lucide.createIcons();
  };

  // ── navigation ─────────────────────────────────────────────────────────────
  SageFiles.prototype._navigate = function (path) {
    if (!this.fs) return;
    path = this.fs.normalize(path);
    if (!this.fs.isDir(path)) return;
    // truncate forward history
    this.history = this.history.slice(0, this.histIdx + 1);
    if (this.history[this.histIdx] !== path) {
      this.history.push(path);
      this.histIdx = this.history.length - 1;
    }
    this.cwd = path;
    this.selected = null;
    this._render();
  };
  SageFiles.prototype._back = function () {
    if (this.histIdx > 0) { this.histIdx--; this.cwd = this.history[this.histIdx]; this.selected = null; this._render(); }
  };
  SageFiles.prototype._forward = function () {
    if (this.histIdx < this.history.length - 1) { this.histIdx++; this.cwd = this.history[this.histIdx]; this.selected = null; this._render(); }
  };
  SageFiles.prototype._up = function () {
    if (!this.fs) return;
    var parent = this.fs.parentOf(this.cwd);
    if (parent !== this.cwd) this._navigate(parent);
  };

  // ── rendering ────────────────────────────────────────────────────────────
  SageFiles.prototype._render = function () {
    if (!this.fs) {
      this.mainEl.innerHTML = '<div class="sf-empty">filesystem unavailable</div>';
      return;
    }
    // if cwd vanished (e.g. removed), fall back to project
    if (!this.fs.isDir(this.cwd)) this.cwd = PROJECT;

    this._renderCrumbs();

    var items = this.fs.ls(this.cwd);
    var self = this;

    if (items.length === 0) {
      this.mainEl.innerHTML = '<div class="sf-empty"><i data-lucide="folder-open"></i><p>empty folder</p>'
        + '<button class="sf-empty-new">New file here</button></div>';
      var b = this.mainEl.querySelector('.sf-empty-new');
      if (b) b.addEventListener('click', function () { self._newFile(); });
    } else {
      var wrap = document.createElement('div');
      wrap.className = this.view === 'grid' ? 'sf-grid' : 'sf-list';

      items.forEach(function (item) {
        var cell = document.createElement('div');
        cell.className = 'sf-item ' + kindClass(item) + (self.selected === item.path ? ' is-sel' : '');
        cell.dataset.path = item.path;
        cell.dataset.type = item.type;

        if (self.view === 'grid') {
          cell.innerHTML =
            '<div class="sf-ic"><i data-lucide="' + iconFor(item) + '"></i></div>' +
            '<div class="sf-name">' + escapeHtml(item.name) + '</div>';
        } else {
          cell.innerHTML =
            '<div class="sf-ic"><i data-lucide="' + iconFor(item) + '"></i></div>' +
            '<div class="sf-name">' + escapeHtml(item.name) + '</div>' +
            '<div class="sf-meta">' + (item.type === 'dir' ? 'folder' : fmtSize(item.size)) + '</div>';
        }

        cell.addEventListener('click', function (e) {
          e.stopPropagation();
          self.selected = item.path;
          self._renderSelection();
          self._closeMenu();
        });
        cell.addEventListener('dblclick', function (e) {
          e.stopPropagation();
          self._activate(item);
        });
        cell.addEventListener('contextmenu', function (e) {
          e.preventDefault(); e.stopPropagation();
          self.selected = item.path;
          self._renderSelection();
          self._openMenu(e.clientX, e.clientY, item);
        });

        wrap.appendChild(cell);
      });

      this.mainEl.innerHTML = '';
      this.mainEl.appendChild(wrap);
    }

    // status bar
    var counts = this.fs.countUnder(this.cwd);
    var direct = items.length;
    var statusEl = this.container.querySelector('#sf-status');
    if (statusEl) {
      statusEl.innerHTML =
        '<span>' + direct + ' item' + (direct === 1 ? '' : 's') + '</span>' +
        '<span class="sf-status-path">' + escapeHtml(this.cwd) + '</span>' +
        '<span>' + counts.files + ' files · ' + fmtSize(counts.bytes) + '</span>';
    }

    // nav button states
    var back = this.container.querySelector('.sf-back');
    var fwd  = this.container.querySelector('.sf-fwd');
    if (back) back.disabled = this.histIdx <= 0;
    if (fwd)  fwd.disabled  = this.histIdx >= this.history.length - 1;

    if (global.lucide && global.lucide.createIcons) global.lucide.createIcons();
  };

  SageFiles.prototype._renderSelection = function () {
    var self = this;
    this.mainEl.querySelectorAll('.sf-item').forEach(function (el) {
      el.classList.toggle('is-sel', el.dataset.path === self.selected);
    });
  };

  SageFiles.prototype._renderCrumbs = function () {
    var el = this.container.querySelector('#sf-crumbs');
    if (!el) return;
    var self = this;
    var parts = this.cwd === '/' ? [] : this.cwd.split('/').filter(Boolean);
    var html = '<button class="sf-crumb" data-path="/">/</button>';
    var acc = '';
    parts.forEach(function (p, i) {
      acc += '/' + p;
      html += '<span class="sf-crumb-sep">›</span>';
      html += '<button class="sf-crumb' + (i === parts.length - 1 ? ' is-cur' : '') + '" data-path="' + acc + '">' + escapeHtml(p) + '</button>';
    });
    el.innerHTML = html;
    el.querySelectorAll('.sf-crumb').forEach(function (b) {
      b.addEventListener('click', function () { self._navigate(b.dataset.path); });
    });
  };

  // ── actions ─────────────────────────────────────────────────────────────
  SageFiles.prototype._activate = function (item) {
    if (item.type === 'dir') { this._navigate(item.path); return; }
    var n = item.name.toLowerCase();
    if (n.endsWith('.sage') || n.endsWith('.sageh') || n.endsWith('.toml') ||
        n.endsWith('.md') || n.endsWith('.lock') || n.endsWith('.json') || n.endsWith('.txt')) {
      this._openInEditor(item.path);
    } else {
      this._openInEditor(item.path);   // everything text in this world
    }
  };

  SageFiles.prototype._openInEditor = function (path) {
    if (global.SagePlayground && typeof global.SagePlayground.openInEditor === 'function') {
      global.SagePlayground.openInEditor(path);
    } else {
      global.dispatchEvent(new CustomEvent('sage:open-file', { detail: { path: path } }));
    }
  };

  SageFiles.prototype._toggleView = function () {
    this.view = this.view === 'grid' ? 'list' : 'grid';
    var btn = this.container.querySelector('.sf-viewtoggle i');
    if (btn) btn.setAttribute('data-lucide', this.view === 'grid' ? 'layout-grid' : 'list');
    this._render();
  };

  SageFiles.prototype._newFolder = function () {
    if (!this.fs) return;
    var name = this._prompt('New folder name:', 'untitled folder');
    if (!name) return;
    var path = this.fs.join(this.cwd, name);
    if (this.fs.exists(path)) { this._toast('already exists'); return; }
    try { this.fs.mkdir(path); this.selected = path; } catch (e) { this._toast(e.message); }
  };

  SageFiles.prototype._newFile = function () {
    if (!this.fs) return;
    var name = this._prompt('New file name:', 'untitled.sage');
    if (!name) return;
    if (!/\.\w+$/.test(name)) name += '.sage';
    var path = this.fs.join(this.cwd, name);
    if (this.fs.exists(path)) { this._toast('already exists'); return; }
    var seed = name.endsWith('.sage')
      ? '# ' + name + '\n\nproc main():\n    println("hello from ' + name + '")\n\nmain()\n'
      : '';
    try {
      this.fs.write(path, seed);
      this.selected = path;
      this._openInEditor(path);
    } catch (e) { this._toast(e.message); }
  };

  SageFiles.prototype._rename = function (item) {
    if (!this.fs) return;
    var name = this._prompt('Rename to:', item.name);
    if (!name || name === item.name) return;
    try { this.fs.rename(item.path, name); this.selected = this.fs.join(this.fs.parentOf(item.path), name); }
    catch (e) { this._toast(e.message); }
  };

  SageFiles.prototype._delete = function (item) {
    if (!this.fs) return;
    if (item.path === PROJECT || item.path === '/') { this._toast('cannot delete this'); return; }
    var ok = this._confirm('Delete "' + item.name + '"' + (item.type === 'dir' ? ' and everything inside it' : '') + '?');
    if (!ok) return;
    try { this.fs.rm(item.path); if (this.selected === item.path) this.selected = null; }
    catch (e) { this._toast(e.message); }
  };

  SageFiles.prototype._duplicate = function (item) {
    if (!this.fs || item.type !== 'file') return;
    var dot = item.name.lastIndexOf('.');
    var stem = dot === -1 ? item.name : item.name.slice(0, dot);
    var ext = dot === -1 ? '' : item.name.slice(dot);
    var i = 1, name;
    do { name = stem + '-copy' + (i > 1 ? i : '') + ext; i++; } while (this.fs.exists(this.fs.join(this.cwd, name)));
    this.fs.write(this.fs.join(this.cwd, name), this.fs.read(item.path) || '');
  };

  // ── context menu ─────────────────────────────────────────────────────────
  SageFiles.prototype._openMenu = function (x, y, item) {
    this._closeMenu();
    var self = this;
    var menu = document.createElement('div');
    menu.className = 'sf-menu';

    var rows = [];
    if (item) {
      if (item.type === 'dir') rows.push(['Open', 'folder-open', function () { self._navigate(item.path); }]);
      else rows.push(['Open in editor', 'file-code-2', function () { self._openInEditor(item.path); }]);
      rows.push(['Rename', 'pencil', function () { self._rename(item); }]);
      if (item.type === 'file') rows.push(['Duplicate', 'copy', function () { self._duplicate(item); }]);
      rows.push(['__sep__']);
      rows.push(['Delete', 'trash-2', function () { self._delete(item); }, 'danger']);
    } else {
      rows.push(['New folder', 'folder-plus', function () { self._newFolder(); }]);
      rows.push(['New file', 'file-plus-2', function () { self._newFile(); }]);
      rows.push(['__sep__']);
      rows.push(['Refresh', 'refresh-cw', function () { self._render(); }]);
    }

    rows.forEach(function (r) {
      if (r[0] === '__sep__') { var s = document.createElement('div'); s.className = 'sf-menu-sep'; menu.appendChild(s); return; }
      var b = document.createElement('button');
      b.className = 'sf-menu-item' + (r[3] === 'danger' ? ' is-danger' : '');
      b.innerHTML = '<i data-lucide="' + r[1] + '"></i><span>' + r[0] + '</span>';
      b.addEventListener('click', function (e) { e.stopPropagation(); self._closeMenu(); r[2](); });
      menu.appendChild(b);
    });

    document.body.appendChild(menu);
    var mw = menu.offsetWidth || 180, mh = menu.offsetHeight || 200;
    menu.style.left = Math.min(x, window.innerWidth - mw - 8) + 'px';
    menu.style.top = Math.min(y, window.innerHeight - mh - 8) + 'px';
    this._menu = menu;

    if (global.lucide && global.lucide.createIcons) global.lucide.createIcons();

    setTimeout(function () {
      document.addEventListener('click', self._menuCloser = function () { self._closeMenu(); });
      document.addEventListener('contextmenu', self._menuCloser);
    }, 0);
  };
  SageFiles.prototype._closeMenu = function () {
    if (this._menu) { this._menu.remove(); this._menu = null; }
    if (this._menuCloser) {
      document.removeEventListener('click', this._menuCloser);
      document.removeEventListener('contextmenu', this._menuCloser);
      this._menuCloser = null;
    }
  };

  // ── lightweight prompt / confirm / toast (the playground frowns on raw alerts) ──
  SageFiles.prototype._prompt = function (label, def) {
    var r = window.prompt(label, def || '');
    return r == null ? null : r.trim();
  };
  SageFiles.prototype._confirm = function (msg) {
    return window.confirm(msg);
  };
  SageFiles.prototype._toast = function (msg) {
    var t = document.createElement('div');
    t.className = 'sf-toast';
    t.textContent = msg;
    this.container.appendChild(t);
    setTimeout(function () { t.classList.add('gone'); }, 1600);
    setTimeout(function () { t.remove(); }, 2100);
  };

  SageFiles.prototype.destroy = function () {
    if (this._offVfs) this._offVfs();
    this._closeMenu();
  };

  // ── CSS ─────────────────────────────────────────────────────────────────────
  function injectCSS() {
    if (document.getElementById('sage-files-css')) return;
    var css = `
    .sf-host{
      --bg:#14111f; --bg-chrome:#1e1a2e; --bg-toolbar:#1a1628; --bg-side:#171320;
      --bg-status:#12101b; --border:#2a2240; --border-dim:#1e1a30;
      --text:#d8d0f0; --text-dim:#5a5070; --text-soft:#8878a8;
      --accent:#a068d8; --accent-soft:rgba(160,104,216,.16);
      --sage:#7ad0a8; --cfg:#e0b060; --doc:#6fb0e0; --json:#d88ab0;
      --dot-r:#ff5f57; --dot-y:#febc2e; --dot-g:#28c840;
      font-family:'Nunito','JetBrains Mono',system-ui,sans-serif;
      background:var(--bg); border:1px solid var(--border); border-radius:12px;
      overflow:hidden; display:flex; flex-direction:column;
      width:100%; height:100%; color:var(--text); user-select:none;
      box-shadow:0 20px 60px rgba(0,0,0,.55),0 2px 4px rgba(0,0,0,.4);
    }
    .sf-chrome{ background:var(--bg-chrome); padding:11px 14px 10px; display:flex;
      align-items:center; gap:7px; border-bottom:1px solid var(--border-dim); flex-shrink:0; }
    .sf-dot{ width:12px; height:12px; border-radius:50%; flex-shrink:0; }
    .sf-dot-r{ background:var(--dot-r);} .sf-dot-y{ background:var(--dot-y);} .sf-dot-g{ background:var(--dot-g);}
    .sf-chrome-title{ flex:1; text-align:center; font-size:12px; color:var(--text-dim);
      letter-spacing:.04em; pointer-events:none; font-family:'JetBrains Mono',monospace; }
    .sf-chrome-badge{ font-size:10px; color:var(--text-soft); background:var(--accent-soft);
      border:1px solid rgba(160,104,216,.2); border-radius:4px; padding:1px 7px; letter-spacing:.04em; }

    .sf-toolbar{ background:var(--bg-toolbar); display:flex; align-items:center; gap:6px;
      padding:7px 9px; border-bottom:1px solid var(--border-dim); flex-shrink:0; }
    .sf-nav,.sf-act{ background:transparent; border:1px solid transparent; color:var(--text-soft);
      width:28px; height:28px; border-radius:7px; display:flex; align-items:center; justify-content:center;
      cursor:pointer; transition:.15s; flex-shrink:0; }
    .sf-nav:hover,.sf-act:hover{ background:rgba(255,255,255,.05); color:var(--text); }
    .sf-nav:disabled{ opacity:.3; cursor:default; }
    .sf-nav i,.sf-act i{ width:16px; height:16px; }
    .sf-crumbs{ flex:1; display:flex; align-items:center; gap:2px; overflow-x:auto; padding:0 4px;
      scrollbar-width:none; min-width:0; }
    .sf-crumbs::-webkit-scrollbar{ display:none; }
    .sf-crumb{ background:transparent; border:none; color:var(--text-soft); cursor:pointer;
      font-size:12.5px; padding:3px 6px; border-radius:5px; white-space:nowrap;
      font-family:'JetBrains Mono',monospace; }
    .sf-crumb:hover{ background:rgba(255,255,255,.05); color:var(--text); }
    .sf-crumb.is-cur{ color:var(--accent); font-weight:600; }
    .sf-crumb-sep{ color:var(--text-dim); font-size:11px; flex-shrink:0; }
    .sf-actions{ display:flex; gap:3px; flex-shrink:0; }

    .sf-body{ flex:1; display:flex; min-height:0; }
    .sf-sidebar{ width:148px; background:var(--bg-side); border-right:1px solid var(--border-dim);
      padding:10px 8px; flex-shrink:0; overflow-y:auto; }
    .sf-side-h{ font-size:10px; text-transform:uppercase; letter-spacing:.1em; color:var(--text-dim);
      padding:8px 8px 5px; }
    .sf-fav{ width:100%; display:flex; align-items:center; gap:8px; background:transparent; border:none;
      color:var(--text-soft); padding:7px 9px; border-radius:7px; cursor:pointer; font-size:13px;
      text-align:left; transition:.12s; font-family:inherit; }
    .sf-fav:hover{ background:rgba(255,255,255,.05); color:var(--text); }
    .sf-fav i{ width:15px; height:15px; flex-shrink:0; color:var(--accent); }

    .sf-main{ flex:1; overflow-y:auto; padding:14px; min-width:0; }
    .sf-grid{ display:grid; grid-template-columns:repeat(auto-fill,minmax(92px,1fr)); gap:6px; }
    .sf-list{ display:flex; flex-direction:column; gap:1px; }

    .sf-item{ border-radius:9px; cursor:default; transition:.1s; border:1px solid transparent; }
    .sf-grid .sf-item{ display:flex; flex-direction:column; align-items:center; gap:7px; padding:14px 6px 10px; text-align:center; }
    .sf-list .sf-item{ display:flex; align-items:center; gap:11px; padding:8px 10px; }
    .sf-item:hover{ background:rgba(255,255,255,.04); }
    .sf-item.is-sel{ background:var(--accent-soft); border-color:rgba(160,104,216,.4); }
    .sf-ic{ display:flex; align-items:center; justify-content:center; }
    .sf-grid .sf-ic i{ width:34px; height:34px; }
    .sf-list .sf-ic i{ width:18px; height:18px; flex-shrink:0; }
    .sf-i-dir  .sf-ic i{ color:var(--accent); }
    .sf-i-sage .sf-ic i{ color:var(--sage); }
    .sf-i-cfg  .sf-ic i{ color:var(--cfg); }
    .sf-i-doc  .sf-ic i{ color:var(--doc); }
    .sf-i-json .sf-ic i{ color:var(--json); }
    .sf-i-file .sf-ic i{ color:var(--text-soft); }
    .sf-name{ font-size:12.5px; color:var(--text); word-break:break-word; line-height:1.25; }
    .sf-grid .sf-name{ max-width:100%; }
    .sf-list .sf-name{ flex:1; }
    .sf-meta{ font-size:11px; color:var(--text-dim); font-family:'JetBrains Mono',monospace; flex-shrink:0; }

    .sf-empty{ height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center;
      gap:10px; color:var(--text-dim); }
    .sf-empty i{ width:40px; height:40px; opacity:.5; }
    .sf-empty p{ margin:0; font-size:13px; }
    .sf-empty-new{ background:var(--accent-soft); border:1px solid rgba(160,104,216,.3); color:var(--text);
      padding:6px 14px; border-radius:8px; cursor:pointer; font-size:12.5px; font-family:inherit; }
    .sf-empty-new:hover{ background:rgba(160,104,216,.28); }

    .sf-status{ background:var(--bg-status); border-top:1px solid var(--border-dim); padding:6px 14px;
      display:flex; align-items:center; gap:14px; font-size:11px; color:var(--text-dim);
      font-family:'JetBrains Mono',monospace; flex-shrink:0; }
    .sf-status-path{ flex:1; text-align:center; color:var(--text-soft); overflow:hidden;
      text-overflow:ellipsis; white-space:nowrap; }

    .sf-menu{ position:fixed; z-index:9999; background:#1d1830; border:1px solid var(--border);
      border-radius:10px; padding:5px; min-width:172px; box-shadow:0 16px 44px rgba(0,0,0,.6);
      backdrop-filter:blur(8px); }
    .sf-menu-item{ width:100%; display:flex; align-items:center; gap:10px; background:transparent;
      border:none; color:var(--text); padding:8px 11px; border-radius:7px; cursor:pointer;
      font-size:13px; text-align:left; font-family:inherit; }
    .sf-menu-item:hover{ background:var(--accent-soft); }
    .sf-menu-item.is-danger{ color:#ff8080; }
    .sf-menu-item.is-danger:hover{ background:rgba(255,90,90,.14); }
    .sf-menu-item i{ width:15px; height:15px; flex-shrink:0; }
    .sf-menu-sep{ height:1px; background:var(--border-dim); margin:4px 6px; }

    .sf-toast{ position:absolute; bottom:42px; left:50%; transform:translateX(-50%);
      background:#241d38; border:1px solid var(--border); color:var(--text); padding:8px 16px;
      border-radius:9px; font-size:12.5px; box-shadow:0 10px 30px rgba(0,0,0,.5); transition:opacity .4s;
      z-index:50; }
    .sf-toast.gone{ opacity:0; }
    `;
    var style = document.createElement('style');
    style.id = 'sage-files-css';
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ── init ─────────────────────────────────────────────────────────────────────
  global.SageFiles = SageFiles;
  global.sageFilesInjectCSS = injectCSS;

  function init() {
    injectCSS();
    var target = document.getElementById('sage-files');
    if (!target) return;   // a host (playground) drives it
    new SageFiles(target);
  }
  if (!global.__SAGE_NO_AUTOINIT) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
  }

})(typeof window !== 'undefined' ? window : globalThis);
