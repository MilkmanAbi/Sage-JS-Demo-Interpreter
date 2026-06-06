/*!
 * sage-vfs.js — Sage Playground virtual filesystem (in-RAM, all JS)
 *
 * One shared singleton: window.SageVFS
 * Every app (editor, repl, myst, files) reads & writes the same tree, so a file
 * saved in the editor shows up in the browser, Myst installs land where the
 * interpreter looks for them, and so on.
 *
 * Layout the playground expects:
 *   /                       root
 *   /project                the working directory (CWD)
 *   /project/main.sage      starter file
 *   /project/myst.toml      manifest (written by Myst)
 *   /project/myst.lock      lockfile (written by Myst)
 *   /project/myst_libs/     installed packages (one dir each)
 *   /project/.myst/state.json   machine-readable Myst state (shared across terminals)
 *
 * Storage is flat: a map of normalised-path -> node. Directories are nodes too.
 * Persists to localStorage (debounced) so a student's work survives a reload.
 */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'sage-playground-vfs-v1';
  var PROJECT = '/project';

  // ── path helpers ──────────────────────────────────────────────────────────
  function normalize(p) {
    if (!p || p === '/') return '/';
    // collapse slashes, strip trailing slash, resolve . and ..
    var parts = String(p).split('/');
    var out = [];
    for (var i = 0; i < parts.length; i++) {
      var seg = parts[i];
      if (seg === '' || seg === '.') continue;
      if (seg === '..') { out.pop(); continue; }
      out.push(seg);
    }
    return '/' + out.join('/');
  }
  function parentOf(p) {
    p = normalize(p);
    if (p === '/') return '/';
    var i = p.lastIndexOf('/');
    return i <= 0 ? '/' : p.slice(0, i);
  }
  function baseName(p) {
    p = normalize(p);
    if (p === '/') return '/';
    return p.slice(p.lastIndexOf('/') + 1);
  }
  function join() {
    var parts = Array.prototype.slice.call(arguments);
    return normalize(parts.join('/'));
  }

  // ── the filesystem ─────────────────────────────────────────────────────────
  function VFS() {
    this.nodes = Object.create(null);   // path -> {type:'dir'|'file', content, mtime}
    this.listeners = [];
    this._saveTimer = null;
    if (!this._load()) this._seed();
  }

  VFS.prototype.PROJECT = PROJECT;

  // -- internal --------------------------------------------------------------
  VFS.prototype._touch = function () {
    this._scheduleSave();
    this._emit();
  };
  VFS.prototype._emit = function () {
    for (var i = 0; i < this.listeners.length; i++) {
      try { this.listeners[i](); } catch (e) {}
    }
  };
  VFS.prototype.on = function (cb) {
    this.listeners.push(cb);
    var self = this;
    return function off() {
      var i = self.listeners.indexOf(cb);
      if (i >= 0) self.listeners.splice(i, 1);
    };
  };

  VFS.prototype._scheduleSave = function () {
    var self = this;
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(function () { self._save(); }, 350);
  };
  VFS.prototype._save = function () {
    try {
      if (global.localStorage)
        global.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.nodes));
    } catch (e) { /* storage full or unavailable — stay in RAM */ }
  };
  VFS.prototype._load = function () {
    try {
      if (!global.localStorage) return false;
      var raw = global.localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return false;
      this.nodes = parsed;
      // ensure the essential dirs exist even if storage was partial
      this._ensureDir('/');
      this._ensureDir(PROJECT);
      return true;
    } catch (e) { return false; }
  };

  VFS.prototype._ensureDir = function (path) {
    path = normalize(path);
    if (path === '/') { if (!this.nodes['/']) this.nodes['/'] = { type: 'dir', mtime: Date.now() }; return; }
    var segs = path.split('/').filter(Boolean);
    var cur = '';
    this.nodes['/'] = this.nodes['/'] || { type: 'dir', mtime: Date.now() };
    for (var i = 0; i < segs.length; i++) {
      cur += '/' + segs[i];
      if (!this.nodes[cur]) this.nodes[cur] = { type: 'dir', mtime: Date.now() };
      else if (this.nodes[cur].type !== 'dir') throw new Error('not a directory: ' + cur);
    }
  };

  VFS.prototype._seed = function () {
    this.nodes = Object.create(null);
    this._ensureDir('/');
    this._ensureDir(PROJECT);
    this._ensureDir(PROJECT + '/myst_libs');
    this.nodes[PROJECT + '/main.sage'] = {
      type: 'file',
      mtime: Date.now(),
      content:
        '# welcome to the Sage Playground  \u2726\n' +
        '#\n' +
        '# this file lives in a real (in-browser) filesystem.\n' +
        '# the editor saves here, the file browser shows it,\n' +
        '# and Myst installs packages into ./myst_libs/.\n' +
        '#\n' +
        '# try, in the Myst window:\n' +
        '#     myst init my-project\n' +
        '#     myst add sage-numpy\n' +
        '# then come back here and run:\n' +
        '\n' +
        'proc main():\n' +
        '    let nums = [4, 8, 15, 16, 23, 42]\n' +
        '    var total = 0\n' +
        '    for n in nums:\n' +
        '        total = total + n\n' +
        '    println("the numbers sum to " + str(total))\n' +
        '\n' +
        'main()\n'
    };
    this.nodes[PROJECT + '/README.md'] = {
      type: 'file',
      mtime: Date.now(),
      content:
        '# my-project\n\n' +
        'A Sage project living in the playground filesystem.\n\n' +
        'Run the editor file with the green Run button, explore packages\n' +
        'with Myst, and browse everything in the Files window.\n'
    };
    this._save();
  };

  // -- public API ------------------------------------------------------------
  VFS.prototype.exists = function (path) {
    return !!this.nodes[normalize(path)];
  };
  VFS.prototype.isDir = function (path) {
    var n = this.nodes[normalize(path)];
    return !!n && n.type === 'dir';
  };
  VFS.prototype.isFile = function (path) {
    var n = this.nodes[normalize(path)];
    return !!n && n.type === 'file';
  };
  VFS.prototype.stat = function (path) {
    var n = this.nodes[normalize(path)];
    if (!n) return null;
    return {
      path: normalize(path),
      name: baseName(path),
      type: n.type,
      mtime: n.mtime || 0,
      size: n.type === 'file' ? (n.content ? n.content.length : 0) : 0
    };
  };

  VFS.prototype.read = function (path) {
    var n = this.nodes[normalize(path)];
    if (!n) return null;
    if (n.type !== 'file') return null;
    return n.content == null ? '' : n.content;
  };

  VFS.prototype.write = function (path, content) {
    path = normalize(path);
    if (path === '/') throw new Error('cannot write to root');
    var parent = parentOf(path);
    this._ensureDir(parent);
    var existing = this.nodes[path];
    if (existing && existing.type === 'dir') throw new Error('is a directory: ' + path);
    this.nodes[path] = { type: 'file', content: content == null ? '' : String(content), mtime: Date.now() };
    this._touch();
    return path;
  };

  VFS.prototype.mkdir = function (path) {
    path = normalize(path);
    if (this.nodes[path] && this.nodes[path].type === 'file')
      throw new Error('file exists: ' + path);
    this._ensureDir(path);
    this._touch();
    return path;
  };

  VFS.prototype.rm = function (path) {
    path = normalize(path);
    if (path === '/' || path === PROJECT) throw new Error('cannot remove protected path: ' + path);
    if (!this.nodes[path]) return false;
    // remove the node and anything beneath it
    var prefix = path + '/';
    var keys = Object.keys(this.nodes);
    for (var i = 0; i < keys.length; i++) {
      if (keys[i] === path || keys[i].indexOf(prefix) === 0) delete this.nodes[keys[i]];
    }
    this._touch();
    return true;
  };

  VFS.prototype.move = function (from, to) {
    from = normalize(from); to = normalize(to);
    if (!this.nodes[from]) throw new Error('no such path: ' + from);
    if (from === '/' || from === PROJECT) throw new Error('cannot move protected path');
    this._ensureDir(parentOf(to));
    var prefix = from + '/';
    var keys = Object.keys(this.nodes);
    var moved = {};
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (k === from) { moved[to] = this.nodes[k]; }
      else if (k.indexOf(prefix) === 0) { moved[to + k.slice(from.length)] = this.nodes[k]; }
    }
    for (var k2 in moved) {
      delete this.nodes[k2]; // in case of overlap
    }
    // delete originals
    for (var j = 0; j < keys.length; j++) {
      var kk = keys[j];
      if (kk === from || kk.indexOf(prefix) === 0) delete this.nodes[kk];
    }
    for (var dst in moved) this.nodes[dst] = moved[dst];
    this._touch();
    return to;
  };

  VFS.prototype.rename = function (path, newName) {
    return this.move(path, join(parentOf(path), newName));
  };

  VFS.prototype.ls = function (path) {
    path = normalize(path);
    if (!this.nodes[path]) return [];
    if (this.nodes[path].type !== 'dir') return [];
    var prefix = path === '/' ? '/' : path + '/';
    var out = [];
    var seen = Object.create(null);
    var keys = Object.keys(this.nodes);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (k === path) continue;
      if (k.indexOf(prefix) !== 0) continue;
      var rest = k.slice(prefix.length);
      var slash = rest.indexOf('/');
      var name = slash === -1 ? rest : rest.slice(0, slash);
      if (!name || seen[name]) continue;
      seen[name] = true;
      var childPath = prefix === '/' ? '/' + name : prefix + name;
      var node = this.nodes[childPath];
      out.push({
        name: name,
        path: childPath,
        type: node ? node.type : 'dir',
        size: (node && node.type === 'file' && node.content) ? node.content.length : 0,
        mtime: (node && node.mtime) || 0
      });
    }
    out.sort(function (a, b) {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return out;
  };

  // recursive nested tree (useful for debugging / export)
  VFS.prototype.tree = function (path) {
    path = normalize(path || '/');
    var self = this;
    function build(p) {
      var node = self.nodes[p];
      if (!node) return null;
      if (node.type === 'file') return { name: baseName(p), path: p, type: 'file', size: node.content ? node.content.length : 0 };
      var children = self.ls(p).map(function (c) { return build(c.path); }).filter(Boolean);
      return { name: p === '/' ? '/' : baseName(p), path: p, type: 'dir', children: children };
    }
    return build(path);
  };

  // count helpers for the file-browser status bar
  VFS.prototype.countUnder = function (path) {
    path = normalize(path);
    var prefix = path === '/' ? '/' : path + '/';
    var files = 0, dirs = 0, bytes = 0;
    var keys = Object.keys(this.nodes);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (k === path) continue;
      if (k.indexOf(prefix) !== 0) continue;
      var n = this.nodes[k];
      if (n.type === 'file') { files++; bytes += n.content ? n.content.length : 0; }
      else dirs++;
    }
    return { files: files, dirs: dirs, bytes: bytes };
  };

  // wipe everything and re-seed (used by a "reset filesystem" action)
  VFS.prototype.reset = function () {
    this._seed();
    this._touch();
  };

  // expose path utils on the instance for convenience
  VFS.prototype.normalize = normalize;
  VFS.prototype.parentOf = parentOf;
  VFS.prototype.baseName = baseName;
  VFS.prototype.join = join;

  // ── tiny TOML emitter (enough for myst.toml readability) ────────────────────
  // Not a full TOML implementation — Myst keeps the canonical state in JSON.
  function emitToml(obj) {
    var lines = [];
    function val(v) {
      if (typeof v === 'string') return '"' + v.replace(/"/g, '\\"') + '"';
      if (typeof v === 'boolean') return v ? 'true' : 'false';
      if (Array.isArray(v)) return '[' + v.map(val).join(', ') + ']';
      return String(v);
    }
    function section(name, tbl) {
      lines.push('[' + name + ']');
      for (var k in tbl) {
        if (tbl[k] && typeof tbl[k] === 'object' && !Array.isArray(tbl[k])) continue;
        lines.push(k + ' = ' + val(tbl[k]));
      }
      lines.push('');
    }
    for (var key in obj) {
      if (obj[key] && typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
        section(key, obj[key]);
      }
    }
    return lines.join('\n');
  }

  // ── singleton ───────────────────────────────────────────────────────────────
  var instance = new VFS();
  instance.emitToml = emitToml;

  global.SageVFS = instance;
  global.SageVFS_class = VFS;   // for tests

})(typeof window !== 'undefined' ? window : globalThis);
