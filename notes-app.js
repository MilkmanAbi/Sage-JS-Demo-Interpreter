/*!
 * notes-app.js — Sage Playground notebook
 *
 * A tiny notes app over the shared in-RAM filesystem (window.SageVFS). Notes
 * live as real Markdown files under /project/notes, so they show up in the
 * file browser and can be opened in the editor too. Write in Markdown, flip to
 * a rendered preview, title each note, save with ⌘S.
 *
 * Drop-in for the playground window-manager:
 *   - constructor:  new SageNotes(containerEl)
 *   - exposes:      window.SageNotes, window.sageNotesInjectCSS
 *   - chrome prefix 'nt'  (nt-chrome, nt-dot-r/y/g) to match wireChrome()
 *   - content id    'sage-notes'
 */
(function (global) {
  'use strict';

  var PROJECT   = '/project';
  var NOTES_DIR = '/project/notes';

  function vfs() { return global.SageVFS || null; }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // slugify a title into a filename stem
  function slugify(title) {
    var s = String(title || '').toLowerCase().trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return s || 'untitled';
  }

  // derive a display title: first '# ' heading, else first non-empty line, else filename
  function titleOf(name, content) {
    var lines = String(content || '').split('\n');
    for (var i = 0; i < lines.length; i++) {
      var ln = lines[i].trim();
      if (!ln) continue;
      var h = ln.match(/^#\s+(.*)$/);
      if (h) return h[1].trim();
      return ln.replace(/^#+\s*/, '').slice(0, 60);
    }
    return name.replace(/\.md$/i, '');
  }

  // ── a compact, safe-ish Markdown → HTML renderer (headings, bold, italic,
  //    inline + fenced code, lists, blockquotes, hr, links). Good enough for
  //    notes; not a spec-complete parser. ─────────────────────────────────────
  function renderMarkdown(src) {
    src = String(src == null ? '' : src);
    var lines = src.replace(/\r\n?/g, '\n').split('\n');
    var html = [];
    var i = 0;

    function inline(text) {
      var t = escapeHtml(text);
      // inline code first so its contents aren't further formatted
      t = t.replace(/`([^`]+)`/g, function (_, c) { return '<code>' + c + '</code>'; });
      // links [label](url)
      t = t.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (_, label, url) {
        return '<a href="' + url + '" target="_blank" rel="noopener">' + label + '</a>';
      });
      // bold then italic
      t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      t = t.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
      t = t.replace(/_([^_]+)_/g, '<em>$1</em>');
      return t;
    }

    while (i < lines.length) {
      var line = lines[i];

      // fenced code block
      var fence = line.match(/^```(.*)$/);
      if (fence) {
        var buf = [];
        i++;
        while (i < lines.length && !/^```/.test(lines[i])) { buf.push(lines[i]); i++; }
        i++; // closing fence
        html.push('<pre class="nt-code"><code>' + escapeHtml(buf.join('\n')) + '</code></pre>');
        continue;
      }

      // blank
      if (!line.trim()) { i++; continue; }

      // horizontal rule
      if (/^(\s*[-*_]){3,}\s*$/.test(line)) { html.push('<hr>'); i++; continue; }

      // heading
      var h = line.match(/^(#{1,6})\s+(.*)$/);
      if (h) {
        var lvl = h[1].length;
        html.push('<h' + lvl + '>' + inline(h[2].trim()) + '</h' + lvl + '>');
        i++;
        continue;
      }

      // blockquote
      if (/^>\s?/.test(line)) {
        var qbuf = [];
        while (i < lines.length && /^>\s?/.test(lines[i])) { qbuf.push(lines[i].replace(/^>\s?/, '')); i++; }
        html.push('<blockquote>' + inline(qbuf.join(' ')) + '</blockquote>');
        continue;
      }

      // unordered list
      if (/^\s*[-*+]\s+/.test(line)) {
        var ul = [];
        while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
          ul.push('<li>' + inline(lines[i].replace(/^\s*[-*+]\s+/, '')) + '</li>');
          i++;
        }
        html.push('<ul>' + ul.join('') + '</ul>');
        continue;
      }

      // ordered list
      if (/^\s*\d+\.\s+/.test(line)) {
        var ol = [];
        while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
          ol.push('<li>' + inline(lines[i].replace(/^\s*\d+\.\s+/, '')) + '</li>');
          i++;
        }
        html.push('<ol>' + ol.join('') + '</ol>');
        continue;
      }

      // paragraph (gather consecutive plain lines)
      var pbuf = [];
      while (i < lines.length && lines[i].trim() &&
             !/^(#{1,6}\s|>\s?|\s*[-*+]\s+|\s*\d+\.\s+|```|(\s*[-*_]){3,}\s*$)/.test(lines[i])) {
        pbuf.push(lines[i].trim());
        i++;
      }
      if (pbuf.length) html.push('<p>' + pbuf.map(inline).join('<br>') + '</p>');
    }

    return html.join('\n');
  }

  // the seeded welcome note — quick tips for the playground
  var WELCOME = [
    '# Welcome ✦ Quick tips',
    '',
    'A little scratchpad in the firefly dark. Write in **Markdown**, hit',
    '_Preview_ to render it, and **⌘S** to save — every note is a real `.md`',
    'file under `/project/notes`, so it shows up in **Files** too.',
    '',
    '## Myst — the package manager',
    '',
    'Type these into the **myst cli** window:',
    '',
    '- `myst add sage-numpy` — install a package (fetched live from GitHub)',
    '- `myst list` — see what is installed',
    '- `myst search redis` — find packages',
    '- `myst health` — audit the project',
    '- `myst remove <pkg>` — uninstall',
    '- press **Tab** to complete commands and package names',
    '',
    '## The text editor',
    '',
    '- **⌘↵** or the **▶ Run** button executes the current file',
    '- **⌘S** saves the buffer into the filesystem',
    '- **⇧⌥F** formats the code',
    '- click **+** on the tab bar to start a new sketch',
    '- output drops into the panel below the editor',
    '',
    '## The desktop',
    '',
    '- drag any title bar to move a window',
    '- the lights work: **red** resets, **yellow** hides to the dock, **green** fills the screen',
    '- the dock lives at the bottom edge — nudge the pointer down to reveal it',
    '- click the dark to stir the fireflies',
    '',
    '> Tip: make a new note with the **＋** button, give it a title, and start writing.',
    ''
  ].join('\n');

  // ── the app ──────────────────────────────────────────────────────────────
  function SageNotes(container) {
    this.container = container;
    this.fs = vfs();
    this.current = null;     // path of the open note
    this.mode = 'preview';   // 'edit' | 'preview'
    this._dirty = false;
    this._build();
    this._ensureSeed();
    this._refreshList();
    // open the first note (the welcome note, when freshly seeded)
    var names = this._noteFiles();
    if (names.length) this._open(names[0].path, 'preview');
    else this._renderMain();

    var self = this;
    if (this.fs && this.fs.on) {
      this._offVfs = this.fs.on(function () {
        // another app changed the FS — refresh the list but keep editing state
        self._refreshList();
      });
    }
  }

  SageNotes.prototype._build = function () {
    var self = this;
    this.container.innerHTML = '';
    this.container.className = 'nt-host';

    // chrome — traffic lights wired by the playground via the nt- prefix
    var chrome = document.createElement('div');
    chrome.className = 'nt-chrome';
    chrome.innerHTML =
      '<span class="nt-dot nt-dot-r" title="Close"></span>' +
      '<span class="nt-dot nt-dot-y" title="Minimise"></span>' +
      '<span class="nt-dot nt-dot-g" title="Full screen"></span>' +
      '<span class="nt-chrome-title">notes</span>' +
      '<span class="nt-chrome-badge">.md</span>';
    this.container.appendChild(chrome);

    // body: sidebar (list) + main (editor / preview)
    var body = document.createElement('div');
    body.className = 'nt-body';

    // sidebar
    var side = document.createElement('div');
    side.className = 'nt-sidebar';
    side.innerHTML =
      '<div class="nt-side-head">' +
        '<span>Notes</span>' +
        '<button class="nt-new" title="New note"><i data-lucide="plus"></i></button>' +
      '</div>' +
      '<div class="nt-list" id="nt-list"></div>';
    body.appendChild(side);
    this.listEl = side.querySelector('#nt-list');

    // main
    var main = document.createElement('div');
    main.className = 'nt-main';

    // toolbar
    var bar = document.createElement('div');
    bar.className = 'nt-bar';
    bar.innerHTML =
      '<input class="nt-title" type="text" placeholder="Untitled note" spellcheck="false" />' +
      '<div class="nt-bar-actions">' +
        '<div class="nt-seg">' +
          '<button class="nt-seg-btn nt-mode-edit" data-mode="edit"><i data-lucide="pencil"></i><span>Write</span></button>' +
          '<button class="nt-seg-btn nt-mode-preview" data-mode="preview"><i data-lucide="eye"></i><span>Preview</span></button>' +
        '</div>' +
        '<button class="nt-act nt-save" title="Save (⌘S)"><i data-lucide="save"></i></button>' +
        '<button class="nt-act nt-del" title="Delete note"><i data-lucide="trash-2"></i></button>' +
      '</div>';
    main.appendChild(bar);
    this.titleEl = bar.querySelector('.nt-title');

    // editor + preview panes
    var paneWrap = document.createElement('div');
    paneWrap.className = 'nt-pane';
    this.textEl = document.createElement('textarea');
    this.textEl.className = 'nt-text';
    this.textEl.setAttribute('placeholder', 'Write in Markdown…\n\n# A heading\n- a bullet\n**bold**  _italic_  `code`');
    this.textEl.setAttribute('spellcheck', 'false');
    this.previewEl = document.createElement('div');
    this.previewEl.className = 'nt-preview';
    paneWrap.appendChild(this.textEl);
    paneWrap.appendChild(this.previewEl);
    main.appendChild(paneWrap);

    // status
    var status = document.createElement('div');
    status.className = 'nt-status';
    status.innerHTML = '<span class="nt-status-path">—</span><span class="nt-status-state"></span>';
    main.appendChild(status);
    this.statusPathEl  = status.querySelector('.nt-status-path');
    this.statusStateEl = status.querySelector('.nt-status-state');

    body.appendChild(main);
    this.container.appendChild(body);
    this.mainEl = main;

    // ── wiring ──────────────────────────────────────────────────────────────
    side.querySelector('.nt-new').addEventListener('click', function () { self._newNote(); });
    bar.querySelectorAll('.nt-seg-btn').forEach(function (b) {
      b.addEventListener('click', function () { self._setMode(b.dataset.mode); });
    });
    bar.querySelector('.nt-save').addEventListener('click', function () { self._save(true); });
    bar.querySelector('.nt-del').addEventListener('click', function () { self._delete(); });

    this.titleEl.addEventListener('input', function () { self._markDirty(); });
    this.textEl.addEventListener('input', function () { self._markDirty(); });

    // ⌘S / Ctrl+S inside the note saves (don't let the OS shell download)
    var saveKey = function (e) {
      if ((e.metaKey || e.ctrlKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault(); e.stopPropagation();
        self._save(true);
      }
    };
    this.textEl.addEventListener('keydown', saveKey);
    this.titleEl.addEventListener('keydown', function (e) {
      saveKey(e);
      if (e.key === 'Enter') { e.preventDefault(); self.textEl.focus(); }
    });
    // Tab inserts two spaces in the body instead of leaving the field
    this.textEl.addEventListener('keydown', function (e) {
      if (e.key === 'Tab') {
        e.preventDefault();
        var s = this.selectionStart, en = this.selectionEnd;
        this.value = this.value.slice(0, s) + '  ' + this.value.slice(en);
        this.selectionStart = this.selectionEnd = s + 2;
        self._markDirty();
      }
    });

    if (global.lucide && global.lucide.createIcons) global.lucide.createIcons();
  };

  // ── filesystem helpers ─────────────────────────────────────────────────────
  SageNotes.prototype._ensureSeed = function () {
    if (!this.fs) return;
    if (!this.fs.isDir(NOTES_DIR)) {
      try { this.fs.mkdir(NOTES_DIR); } catch (e) {}
    }
    if (this._noteFiles().length === 0) {
      try { this.fs.write(this.fs.join(NOTES_DIR, 'welcome.md'), WELCOME); } catch (e) {}
    }
  };

  SageNotes.prototype._noteFiles = function () {
    if (!this.fs || !this.fs.isDir(NOTES_DIR)) return [];
    return this.fs.ls(NOTES_DIR)
      .filter(function (it) { return it.type === 'file' && /\.md$/i.test(it.name); })
      .map(function (it) {
        var content = self_read(it.path);
        return { path: it.path, name: it.name, title: titleOf(it.name, content) };
      });
    function self_read(p) { return (global.SageVFS && global.SageVFS.read(p)) || ''; }
  };

  // ── list rendering ─────────────────────────────────────────────────────────
  SageNotes.prototype._refreshList = function () {
    if (!this.listEl) return;
    var self = this;
    var notes = this._noteFiles();
    if (!notes.length) {
      this.listEl.innerHTML = '<div class="nt-list-empty">No notes yet.<br>Tap ＋ to start one.</div>';
      return;
    }
    this.listEl.innerHTML = '';
    notes.forEach(function (n) {
      var item = document.createElement('button');
      item.className = 'nt-list-item' + (n.path === self.current ? ' is-active' : '');
      item.dataset.path = n.path;
      var preview = self._snippet(n.path);
      item.innerHTML =
        '<i data-lucide="file-text"></i>' +
        '<span class="nt-li-text">' +
          '<span class="nt-li-title">' + escapeHtml(n.title) + '</span>' +
          '<span class="nt-li-sub">' + escapeHtml(preview) + '</span>' +
        '</span>';
      item.addEventListener('click', function () { self._open(n.path, self.mode); });
      self.listEl.appendChild(item);
    });
    if (global.lucide && global.lucide.createIcons) global.lucide.createIcons();
  };

  SageNotes.prototype._snippet = function (path) {
    var raw = (this.fs && this.fs.read(path)) || '';
    var lines = raw.split('\n');
    // skip the leading title heading, find first body line
    var seenTitle = false;
    for (var i = 0; i < lines.length; i++) {
      var ln = lines[i].trim();
      if (!ln) continue;
      if (!seenTitle && /^#\s+/.test(ln)) { seenTitle = true; continue; }
      return ln.replace(/^#+\s*/, '').replace(/[*_`>#-]/g, '').slice(0, 48) || '…';
    }
    return 'Empty note';
  };

  // ── open / save / new / delete ──────────────────────────────────────────────
  SageNotes.prototype._open = function (path, mode) {
    // persist the note we're leaving
    if (this.current && this.current !== path) this._save(false);
    if (!this.fs) return;
    var content = this.fs.read(path);
    if (content == null) { this._refreshList(); return; }
    this.current = path;
    var t = titleOf(this.fs.baseName(path), content);
    this.titleEl.value = t;
    // strip a leading "# Title" line from the editable body so the title field owns it
    this.textEl.value = this._stripTitle(content, t);
    this._dirty = false;
    this._setMode(mode || this.mode);
    this.statusPathEl.textContent = path;
    this._setState('saved');
    this._refreshList();
  };

  // remove a leading "# <title>" line that matches the title field
  SageNotes.prototype._stripTitle = function (content, title) {
    var lines = content.split('\n');
    for (var i = 0; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      var h = lines[i].match(/^#\s+(.*)$/);
      if (h && h[1].trim() === title) {
        var rest = lines.slice(i + 1);
        while (rest.length && !rest[0].trim()) rest.shift();
        return rest.join('\n');
      }
      break;
    }
    return content;
  };

  // reassemble the full markdown document from title + body
  SageNotes.prototype._compose = function () {
    var title = (this.titleEl.value || '').trim() || 'Untitled note';
    var body = this.textEl.value.replace(/^\n+/, '');
    return '# ' + title + '\n\n' + body + (body.endsWith('\n') ? '' : '\n');
  };

  SageNotes.prototype._save = function (announce) {
    if (!this.fs || !this.current) return;
    var content = this._compose();
    var title = (this.titleEl.value || '').trim() || 'Untitled note';
    var desiredName = slugify(title) + '.md';
    var dir = this.fs.parentOf(this.current);
    var desiredPath = this.fs.join(dir, desiredName);

    // rename the file to track the title (keep it unique)
    if (desiredPath !== this.current) {
      if (this.fs.exists(desiredPath)) {
        var stem = slugify(title), k = 2;
        do { desiredName = stem + '-' + k + '.md'; desiredPath = this.fs.join(dir, desiredName); k++; }
        while (this.fs.exists(desiredPath) && desiredPath !== this.current);
      }
      try {
        this.fs.write(desiredPath, content);
        if (this.fs.exists(this.current)) this.fs.rm(this.current);
        this.current = desiredPath;
      } catch (e) { this.fs.write(this.current, content); }
    } else {
      this.fs.write(this.current, content);
    }

    this._dirty = false;
    this.statusPathEl.textContent = this.current;
    this._setState('saved');
    this._refreshList();
    if (this.previewEl && this.mode === 'preview') this._renderPreview();
    if (announce && global.SagePlayground && global.SagePlayground.fire) {
      global.SagePlayground.fire({ count: 3 });
    }
  };

  SageNotes.prototype._newNote = function () {
    if (!this.fs) return;
    this._save(false);
    if (!this.fs.isDir(NOTES_DIR)) { try { this.fs.mkdir(NOTES_DIR); } catch (e) {} }
    var stem = 'untitled', name = stem + '.md', k = 2;
    while (this.fs.exists(this.fs.join(NOTES_DIR, name))) { name = stem + '-' + k + '.md'; k++; }
    var path = this.fs.join(NOTES_DIR, name);
    this.fs.write(path, '# Untitled note\n\n');
    this._open(path, 'edit');
    this.titleEl.focus();
    this.titleEl.select();
  };

  SageNotes.prototype._delete = function () {
    if (!this.fs || !this.current) return;
    var t = titleOf(this.fs.baseName(this.current), this.fs.read(this.current));
    if (!window.confirm('Delete "' + t + '"?')) return;
    try { this.fs.rm(this.current); } catch (e) {}
    this.current = null;
    var names = this._noteFiles();
    if (names.length) this._open(names[0].path, this.mode);
    else { this.titleEl.value = ''; this.textEl.value = ''; this.statusPathEl.textContent = '—'; this._renderMain(); }
    this._refreshList();
  };

  // ── mode + render ─────────────────────────────────────────────────────────
  SageNotes.prototype._setMode = function (mode) {
    this.mode = mode === 'edit' ? 'edit' : 'preview';
    this.container.classList.toggle('nt-mode-is-edit', this.mode === 'edit');
    this.container.classList.toggle('nt-mode-is-preview', this.mode === 'preview');
    var bar = this.container.querySelector('.nt-bar');
    if (bar) bar.querySelectorAll('.nt-seg-btn').forEach(function (b) {
      b.classList.toggle('is-on', b.dataset.mode === mode);
    });
    if (this.mode === 'preview') this._renderPreview();
    else setTimeout(function (el) { return function () { el.focus(); }; }(this.textEl), 0);
  };

  SageNotes.prototype._renderPreview = function () {
    if (!this.previewEl) return;
    var doc = this._compose();
    this.previewEl.innerHTML = renderMarkdown(doc);
  };

  SageNotes.prototype._renderMain = function () {
    // empty-state when there is no open note
    if (!this.current) {
      this.previewEl.innerHTML = '<div class="nt-empty"><i data-lucide="notebook-pen"></i>' +
        '<p>No note open.</p><button class="nt-empty-new">New note</button></div>';
      var b = this.previewEl.querySelector('.nt-empty-new');
      var self = this;
      if (b) b.addEventListener('click', function () { self._newNote(); });
      this._setMode('preview');
      if (global.lucide && global.lucide.createIcons) global.lucide.createIcons();
    }
  };

  SageNotes.prototype._markDirty = function () {
    this._dirty = true;
    this._setState('unsaved');
    // keep the preview live while writing in split-second feedback
    if (this.mode === 'preview') this._renderPreview();
  };

  SageNotes.prototype._setState = function (s) {
    if (!this.statusStateEl) return;
    if (s === 'saved') { this.statusStateEl.textContent = 'saved ✦'; this.statusStateEl.className = 'nt-status-state is-saved'; }
    else { this.statusStateEl.textContent = 'unsaved'; this.statusStateEl.className = 'nt-status-state is-unsaved'; }
  };

  SageNotes.prototype.destroy = function () {
    try { this._save(false); } catch (e) {}
    if (this._offVfs) this._offVfs();
  };

  // ── CSS ─────────────────────────────────────────────────────────────────────
  function injectCSS() {
    if (document.getElementById('sage-notes-css')) return;
    var css = `
    .nt-host{
      --bg:#14111f; --bg-chrome:#1e1a2e; --bg-bar:#1a1628; --bg-side:#171320;
      --bg-status:#12101b; --bg-text:#120f1b; --border:#2a2240; --border-dim:#1e1a30;
      --text:#d8d0f0; --text-dim:#5a5070; --text-soft:#8878a8;
      --accent:#a068d8; --accent-soft:rgba(160,104,216,.16);
      --firefly:#ffe2a0; --sage:#7ad0a8;
      --dot-r:#ff5f57; --dot-y:#febc2e; --dot-g:#28c840;
      font-family:'Nunito','JetBrains Mono',system-ui,sans-serif;
      background:var(--bg); border:1px solid var(--border); border-radius:12px;
      overflow:hidden; display:flex; flex-direction:column;
      width:100%; height:100%; color:var(--text);
      box-shadow:0 20px 60px rgba(0,0,0,.55),0 2px 4px rgba(0,0,0,.4);
    }
    .nt-chrome{ background:var(--bg-chrome); padding:11px 14px 10px; display:flex;
      align-items:center; gap:7px; border-bottom:1px solid var(--border-dim); flex-shrink:0;
      user-select:none; }
    .nt-dot{ width:12px; height:12px; border-radius:50%; flex-shrink:0; }
    .nt-dot-r{ background:var(--dot-r);} .nt-dot-y{ background:var(--dot-y);} .nt-dot-g{ background:var(--dot-g);}
    .nt-chrome-title{ flex:1; text-align:center; font-size:12px; color:var(--text-dim);
      letter-spacing:.04em; pointer-events:none; font-family:'JetBrains Mono',monospace; }
    .nt-chrome-badge{ font-size:10px; color:var(--text-soft); background:var(--accent-soft);
      border:1px solid rgba(160,104,216,.2); border-radius:4px; padding:1px 7px; letter-spacing:.04em;
      font-family:'JetBrains Mono',monospace; }

    .nt-body{ flex:1; display:flex; min-height:0; }

    /* sidebar */
    .nt-sidebar{ width:188px; background:var(--bg-side); border-right:1px solid var(--border-dim);
      display:flex; flex-direction:column; flex-shrink:0; min-height:0; }
    .nt-side-head{ display:flex; align-items:center; justify-content:space-between;
      padding:11px 10px 8px 14px; font-size:10px; text-transform:uppercase; letter-spacing:.12em;
      color:var(--text-dim); flex-shrink:0; }
    .nt-new{ background:transparent; border:1px solid transparent; color:var(--text-soft);
      width:26px; height:26px; border-radius:7px; display:flex; align-items:center; justify-content:center;
      cursor:pointer; transition:.15s; }
    .nt-new:hover{ background:var(--accent-soft); color:var(--text); }
    .nt-new i{ width:16px; height:16px; }
    .nt-list{ flex:1; overflow-y:auto; padding:3px 7px 10px; min-height:0; scrollbar-width:thin; }
    .nt-list::-webkit-scrollbar{ width:5px; } .nt-list::-webkit-scrollbar-thumb{ background:var(--border); border-radius:4px; }
    .nt-list-item{ width:100%; display:flex; align-items:flex-start; gap:9px; background:transparent;
      border:1px solid transparent; color:var(--text-soft); padding:9px 10px; border-radius:9px;
      cursor:pointer; text-align:left; transition:.12s; margin-bottom:2px; font-family:inherit; }
    .nt-list-item:hover{ background:rgba(255,255,255,.04); color:var(--text); }
    .nt-list-item.is-active{ background:var(--accent-soft); border-color:rgba(160,104,216,.36); color:var(--text); }
    .nt-list-item i{ width:15px; height:15px; flex-shrink:0; margin-top:2px; color:var(--accent); }
    .nt-li-text{ display:flex; flex-direction:column; gap:2px; min-width:0; }
    .nt-li-title{ font-size:13px; font-weight:700; color:var(--text); white-space:nowrap;
      overflow:hidden; text-overflow:ellipsis; }
    .nt-li-sub{ font-size:11px; color:var(--text-dim); white-space:nowrap; overflow:hidden;
      text-overflow:ellipsis; }
    .nt-list-empty{ color:var(--text-dim); font-size:12.5px; line-height:1.6; text-align:center;
      padding:26px 14px; }

    /* main */
    .nt-main{ flex:1; display:flex; flex-direction:column; min-width:0; min-height:0; }
    .nt-bar{ display:flex; align-items:center; gap:10px; padding:9px 12px; background:var(--bg-bar);
      border-bottom:1px solid var(--border-dim); flex-shrink:0; }
    .nt-title{ flex:1; min-width:0; background:transparent; border:none; outline:none; color:var(--text);
      font-family:'Nunito',sans-serif; font-size:15.5px; font-weight:800; letter-spacing:-.01em; padding:4px 2px; }
    .nt-title::placeholder{ color:var(--text-dim); font-weight:600; }
    .nt-bar-actions{ display:flex; align-items:center; gap:7px; flex-shrink:0; }
    .nt-seg{ display:flex; background:rgba(0,0,0,.22); border:1px solid var(--border-dim); border-radius:9px;
      padding:2px; gap:2px; }
    .nt-seg-btn{ display:flex; align-items:center; gap:5px; background:transparent; border:none;
      color:var(--text-soft); padding:5px 10px; border-radius:7px; cursor:pointer; font-family:inherit;
      font-size:12px; font-weight:700; transition:.13s; }
    .nt-seg-btn i{ width:13px; height:13px; }
    .nt-seg-btn:hover{ color:var(--text); }
    .nt-seg-btn.is-on{ background:var(--accent-soft); color:#e6d4ff; box-shadow:inset 0 0 0 1px rgba(160,104,216,.34); }
    .nt-act{ background:transparent; border:1px solid transparent; color:var(--text-soft);
      width:30px; height:30px; border-radius:8px; display:flex; align-items:center; justify-content:center;
      cursor:pointer; transition:.14s; }
    .nt-act:hover{ background:rgba(255,255,255,.05); color:var(--text); }
    .nt-act.nt-del:hover{ background:rgba(255,90,90,.14); color:#ff8f8f; }
    .nt-act i{ width:16px; height:16px; }

    .nt-pane{ flex:1; min-height:0; position:relative; }
    .nt-text{ position:absolute; inset:0; width:100%; height:100%; resize:none; border:none; outline:none;
      background:var(--bg-text); color:#e0d8f8; padding:20px 24px; box-sizing:border-box;
      font-family:'JetBrains Mono','Fira Mono',monospace; font-size:13.5px; line-height:1.75;
      caret-color:var(--accent); display:none; }
    .nt-text::placeholder{ color:var(--text-dim); }
    .nt-preview{ position:absolute; inset:0; overflow-y:auto; padding:22px 30px 36px; display:none;
      box-sizing:border-box; }
    .nt-host.nt-mode-is-edit .nt-text{ display:block; }
    .nt-host.nt-mode-is-preview .nt-preview{ display:block; }
    .nt-preview::-webkit-scrollbar{ width:6px; } .nt-preview::-webkit-scrollbar-thumb{ background:var(--border); border-radius:4px; }

    /* rendered markdown */
    .nt-preview h1,.nt-preview h2,.nt-preview h3,.nt-preview h4{ font-family:'Nunito',sans-serif;
      color:#efe8ff; line-height:1.25; margin:1.3em 0 .5em; font-weight:800; letter-spacing:-.01em; }
    .nt-preview h1:first-child{ margin-top:0; }
    .nt-preview h1{ font-size:25px; } .nt-preview h2{ font-size:19px; color:#e2d4f6; }
    .nt-preview h3{ font-size:15.5px; } .nt-preview h4{ font-size:14px; color:var(--text-soft); }
    .nt-preview p{ font-size:14px; line-height:1.78; color:#ccc2e6; margin:.65em 0; }
    .nt-preview ul,.nt-preview ol{ margin:.55em 0 .9em; padding-left:1.4em; }
    .nt-preview li{ font-size:14px; line-height:1.7; color:#ccc2e6; margin:.22em 0; }
    .nt-preview ul li::marker{ color:var(--firefly); }
    .nt-preview ol li::marker{ color:var(--accent); font-weight:700; }
    .nt-preview a{ color:#9cc4e8; text-decoration:none; border-bottom:1px solid rgba(156,196,232,.35); }
    .nt-preview a:hover{ border-bottom-color:#9cc4e8; }
    .nt-preview strong{ color:#f2ecff; font-weight:800; }
    .nt-preview em{ color:#e8dcf8; }
    .nt-preview code{ font-family:'JetBrains Mono',monospace; font-size:.86em; color:var(--sage);
      background:rgba(122,208,168,.1); border:1px solid rgba(122,208,168,.16); border-radius:5px; padding:1px 6px; }
    .nt-preview pre.nt-code{ background:var(--bg-text); border:1px solid var(--border-dim); border-radius:10px;
      padding:14px 16px; overflow-x:auto; margin:.9em 0; }
    .nt-preview pre.nt-code code{ background:none; border:none; padding:0; color:#cfe6d6; font-size:12.5px; line-height:1.7; }
    .nt-preview blockquote{ margin:.9em 0; padding:8px 16px; border-left:3px solid var(--accent);
      background:linear-gradient(100deg,rgba(160,104,216,.1),rgba(160,104,216,.02));
      border-radius:0 9px 9px 0; color:#d4c8ec; font-size:13.5px; font-style:italic; }
    .nt-preview blockquote p{ margin:0; }
    .nt-preview hr{ border:none; border-top:1px solid var(--border); margin:1.4em 0; }

    .nt-empty{ height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center;
      gap:12px; color:var(--text-dim); }
    .nt-empty i{ width:42px; height:42px; opacity:.5; }
    .nt-empty p{ margin:0; font-size:13.5px; }
    .nt-empty-new{ background:var(--accent-soft); border:1px solid rgba(160,104,216,.3); color:var(--text);
      padding:7px 16px; border-radius:9px; cursor:pointer; font-size:13px; font-family:inherit; font-weight:700; }
    .nt-empty-new:hover{ background:rgba(160,104,216,.28); }

    .nt-status{ background:var(--bg-status); border-top:1px solid var(--border-dim); padding:6px 14px;
      display:flex; align-items:center; gap:14px; font-size:11px; color:var(--text-dim);
      font-family:'JetBrains Mono',monospace; flex-shrink:0; }
    .nt-status-path{ flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--text-soft); }
    .nt-status-state.is-saved{ color:var(--sage); } .nt-status-state.is-unsaved{ color:var(--firefly); }
    `;
    var style = document.createElement('style');
    style.id = 'sage-notes-css';
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ── init ─────────────────────────────────────────────────────────────────────
  global.SageNotes = SageNotes;
  global.sageNotesInjectCSS = injectCSS;

  function init() {
    injectCSS();
    var target = document.getElementById('sage-notes');
    if (!target) return;   // a host (playground) drives it
    new SageNotes(target);
  }
  if (!global.__SAGE_NO_AUTOINIT) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
  }

})(typeof window !== 'undefined' ? window : globalThis);
