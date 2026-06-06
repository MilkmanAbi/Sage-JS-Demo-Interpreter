/*!
 * Myst CLI — Browser Emulator
 * A self-contained JavaScript emulator of the Myst package manager terminal.
 *
 * Usage:
 *   1. Add <div id="myst-cli"></div> to your HTML.
 *   2. Include: <script src="myst-cli.js"></script>
 *   Done.
 *
 * Emulates: init, add, install, remove, update, list, status, scan,
 *           health, duplicates, graph, lock, search, version, help.
 */
(function(global) {
  'use strict';

  const MYST_VER  = '0.4.0';
  const PROMPT    = 'myst❯ ';

  // ── Live package source (real fetch) ───────────────────────────────────────
  // These packages are fetched for real from GitHub and copied into the VFS,
  // then go through the Sage interpreter when imported.
  const GH = {
    owner:  'MilkmanAbi',
    repo:   'Sage-Playground',
    branch: 'main',
    root:   'Examples-Myst'
  };
  const GITHUB_PACKAGES = [
    'sage-numpy', 'sage-requests', 'sage-redis',
    'sage-pandas', 'sage-torch', 'sage-sandbox-demo'
  ];
  // used only if the GitHub contents API is unavailable (offline / rate-limited)
  const FALLBACK_FILES = ['myst.toml', 'README.md', 'src/lib.sage', 'examples/main.sage'];

  function vfs() { return global.SageVFS || null; }
  const PROJECT = '/project';

  // ── Fake package registry ─────────────────────────────────────────────────
  // Each entry: { desc, versions: { ver: { deps:[], size_kb, health, notes, changelog } } }
  const REGISTRY = {
    'sage-http': {
      desc: 'HTTP client and server for Sage',
      stars: 4.8,
      category: 'networking',
      versions: {
        '1.0.0': { deps:['sage-io@1.0.0','sage-json@0.8.0','sage-net@0.4.0'], size_kb:38, health:'B', notes:'outdated' },
        '1.1.0': { deps:['sage-io@1.0.0','sage-json@0.8.1','sage-net@0.5.0'], size_kb:40, health:'A', notes:'' },
        '1.2.0': { deps:['sage-io@1.2.0','sage-json@0.9.0','sage-net@0.5.0'], size_kb:42, health:'A', notes:'',
          changelog: ['1.2.0: add multipart upload support; fix keep-alive on TLS connections',
                      '1.1.0: streaming response body; add request timeout option'] },
      },
      latest: '1.2.0',
    },
    'sage-json': {
      desc: 'Fast JSON parser and serialiser',
      stars: 4.9,
      category: 'data',
      versions: {
        '0.8.0': { deps:[], size_kb:14, health:'C', notes:'outdated; no security disclosures' },
        '0.8.1': { deps:[], size_kb:15, health:'B', notes:'no security disclosures' },
        '0.9.0': { deps:[], size_kb:17, health:'A', notes:'',
          changelog: ['0.9.0: SIMD-accelerated number parsing; streaming parse API',
                      '0.8.1: fix panic on deeply nested objects (>512 depth)'] },
      },
      latest: '0.9.0',
    },
    'sage-io': {
      desc: 'File and stream I/O utilities',
      stars: 4.7,
      category: 'io',
      versions: {
        '1.0.0': { deps:[], size_kb:29, health:'B', notes:'1.2.0 available' },
        '1.1.0': { deps:[], size_kb:31, health:'B', notes:'1.2.0 available' },
        '1.2.0': { deps:[], size_kb:33, health:'A', notes:'',
          changelog: ['1.2.0: fix large-file read truncation past 2 GB; add async read support',
                      '1.1.0: performance: buffered writes; new write_all() proc'] },
      },
      latest: '1.2.0',
    },
    'sage-net': {
      desc: 'Low-level TCP/UDP networking primitives',
      stars: 4.6,
      category: 'networking',
      versions: {
        '0.4.0': { deps:[], size_kb:24, health:'B', notes:'0.5.0 available' },
        '0.5.0': { deps:[], size_kb:27, health:'A', notes:'',
          changelog: ['0.5.0: add IPv6 support; fix socket leak on connection timeout'] },
      },
      latest: '0.5.0',
    },
    'sage-crypto': {
      desc: 'Cryptographic primitives — AES, SHA, Ed25519',
      stars: 4.5,
      category: 'security',
      versions: {
        '1.0.0': { deps:[], size_kb:61, health:'A', notes:'' },
        '1.1.0': { deps:[], size_kb:64, health:'A', notes:'',
          changelog: ['1.1.0: add ChaCha20-Poly1305; constant-time compare for all digests'] },
      },
      latest: '1.1.0',
    },
    'sage-test': {
      desc: 'Unit testing and assertion framework',
      stars: 4.7,
      category: 'dev',
      versions: {
        '0.4.0': { deps:['sage-io@1.0.0'], size_kb:19, health:'B', notes:'0.5.0 available' },
        '0.5.0': { deps:['sage-io@1.2.0'], size_kb:21, health:'A', notes:'',
          changelog: ['0.5.0: parallel test runner; XML/JSON report output; snapshot testing'] },
      },
      latest: '0.5.0',
    },
    'sage-cli': {
      desc: 'Command-line argument parsing and help generation',
      stars: 4.4,
      category: 'utils',
      versions: {
        '0.2.0': { deps:[], size_kb:11, health:'C', notes:'0.3.0 available; no changelog' },
        '0.3.0': { deps:[], size_kb:13, health:'A', notes:'',
          changelog: ['0.3.0: subcommand support; auto-generated shell completions'] },
      },
      latest: '0.3.0',
    },
    'sagebox': {
      desc: 'Cross-platform UI toolkit for desktop apps',
      stars: 3.9,
      category: 'ui',
      versions: {
        '0.1.0': { deps:['sage-io@1.0.0','sage-config@0.6.0'], size_kb:124, health:'C', notes:'experimental; no security disclosures' },
        '0.2.0': { deps:['sage-io@1.2.0','sage-config@0.7.0'], size_kb:138, health:'B', notes:'experimental',
          changelog: ['0.2.0: add dark mode; fix crash on hi-DPI resize; native file picker'] },
      },
      latest: '0.2.0',
    },
    'sage-regex': {
      desc: 'Regular expression engine with Sage-native API',
      stars: 4.3,
      category: 'utils',
      versions: {
        '1.0.0': { deps:[], size_kb:44, health:'A', notes:'' },
        '1.1.0': { deps:[], size_kb:47, health:'A', notes:'',
          changelog: ['1.1.0: PCRE2 backend option; named capture groups; compile caching'] },
      },
      latest: '1.1.0',
    },
    'sage-log': {
      desc: 'Structured logging — levels, sinks, formatters',
      stars: 4.5,
      category: 'utils',
      versions: {
        '0.3.0': { deps:['sage-datetime@0.4.0'], size_kb:16, health:'B', notes:'0.4.0 available' },
        '0.4.0': { deps:['sage-datetime@0.5.0'], size_kb:18, health:'A', notes:'',
          changelog: ['0.4.0: JSON log output; async sink support; sampling by level'] },
      },
      latest: '0.4.0',
    },
    'sage-config': {
      desc: 'TOML/JSON/ENV configuration file parsing',
      stars: 4.3,
      category: 'utils',
      versions: {
        '0.6.0': { deps:['sage-json@0.8.0'], size_kb:20, health:'C', notes:'0.7.0 available' },
        '0.7.0': { deps:['sage-json@0.9.0'], size_kb:22, health:'A', notes:'',
          changelog: ['0.7.0: hot-reload support; schema validation; dotenv integration'] },
      },
      latest: '0.7.0',
    },
    'sage-ws': {
      desc: 'WebSocket server and client',
      stars: 4.1,
      category: 'networking',
      versions: {
        '0.2.0': { deps:['sage-net@0.4.0','sage-io@1.0.0'], size_kb:33, health:'D', notes:'SECURITY: CVE-2025-3812 — frame masking bypass (CVSS 7.1)' },
        '0.3.0': { deps:['sage-net@0.5.0','sage-io@1.2.0'], size_kb:36, health:'A', notes:'',
          changelog: ['0.3.0: SECURITY: fix CVE-2025-3812 frame masking bypass; add per-message deflate'] },
      },
      latest: '0.3.0',
    },
    'sage-orm': {
      desc: 'Object-relational mapper for Sage structs',
      stars: 3.7,
      category: 'database',
      versions: {
        '0.1.0': { deps:['sage-sqlite@0.6.0','sage-config@0.7.0'], size_kb:57, health:'C', notes:'experimental; no changelog' },
      },
      latest: '0.1.0',
    },
    'sage-sqlite': {
      desc: 'SQLite bindings — prepared statements, transactions',
      stars: 4.2,
      category: 'database',
      versions: {
        '0.5.0': { deps:['sage-io@1.0.0'], size_kb:88, health:'C', notes:'0.6.0 available' },
        '0.6.0': { deps:['sage-io@1.2.0'], size_kb:92, health:'A', notes:'',
          changelog: ['0.6.0: WAL mode by default; bulk insert API; fix NULL handling in aggregates'] },
      },
      latest: '0.6.0',
    },
    'sage-cache': {
      desc: 'In-memory and disk caching with TTL',
      stars: 4.2,
      category: 'utils',
      versions: {
        '0.5.0': { deps:['sage-datetime@0.4.0'], size_kb:22, health:'B', notes:'0.6.0 available' },
        '0.6.0': { deps:['sage-datetime@0.5.0'], size_kb:24, health:'A', notes:'',
          changelog: ['0.6.0: LRU eviction; Redis backend stub; distributed invalidation hooks'] },
      },
      latest: '0.6.0',
    },
    'sage-uuid': {
      desc: 'UUID v4 and v7 generation',
      stars: 4.8,
      category: 'utils',
      versions: {
        '1.0.0': { deps:[], size_kb:5, health:'A', notes:'' },
      },
      latest: '1.0.0',
    },
    'sage-compress': {
      desc: 'zlib, gzip, zstd compression and decompression',
      stars: 4.4,
      category: 'io',
      versions: {
        '0.7.0': { deps:['sage-io@1.0.0'], size_kb:71, health:'B', notes:'0.8.0 available' },
        '0.8.0': { deps:['sage-io@1.2.0'], size_kb:75, health:'A', notes:'',
          changelog: ['0.8.0: add zstd backend; streaming compress API; level 0–22 for zstd'] },
      },
      latest: '0.8.0',
    },
    'sage-datetime': {
      desc: 'Date, time, timezone and duration types',
      stars: 4.6,
      category: 'utils',
      versions: {
        '0.4.0': { deps:[], size_kb:28, health:'B', notes:'0.5.0 available' },
        '0.5.0': { deps:[], size_kb:31, health:'A', notes:'',
          changelog: ['0.5.0: IANA timezone database bundled; RFC 3339 serialisation; duration arithmetic'] },
      },
      latest: '0.5.0',
    },
    'lilybox-core': {
      desc: 'LilyBox sandbox runtime — proc isolation and resource caps',
      stars: 4.3,
      category: 'security',
      versions: {
        '0.2.0': { deps:['sage-io@1.0.0','sage-crypto@1.0.0'], size_kb:102, health:'B', notes:'0.3.0 available' },
        '0.3.0': { deps:['sage-io@1.2.0','sage-crypto@1.1.0'], size_kb:108, health:'A', notes:'',
          changelog: ['0.3.0: network isolation support; memory cap enforcement; signed manifests'] },
      },
      latest: '0.3.0',
    },
    'sage-env': {
      desc: 'Environment variable loading with .env file support',
      stars: 4.5,
      category: 'utils',
      versions: {
        '0.3.0': { deps:[], size_kb:7, health:'A', notes:'' },
      },
      latest: '0.3.0',
    },
  };

  // ── State ─────────────────────────────────────────────────────────────────
  function makeState() {
    return {
      initialized: false,
      projectName: '',
      projectVersion: '1.0.0',
      projectDesc: '',
      // Direct deps declared in myst.toml: { pkg: version }
      manifest: {},
      // All installed packages (direct + transitive): { pkg: { version, size_kb, transitive } }
      installed: {},
      // Lockfile: { pkg: { version, hash } }
      lockfile: {},
      // Pending remove confirmation
      pendingRemove: null,
      // Simulated source imports (for scan) — set randomly on init
      sourceImports: [],
    };
  }

  // ── VFS-backed state (shared across terminals + the file browser) ──────────
  const STATE_PATH = PROJECT + '/.myst/state.json';

  function loadState() {
    const fs = vfs();
    if (fs && fs.isFile(STATE_PATH)) {
      try {
        const s = JSON.parse(fs.read(STATE_PATH));
        if (s && typeof s === 'object') {
          const base = makeState();
          for (const k in base) if (!(k in s)) s[k] = base[k];
          return s;
        }
      } catch (e) { /* fall through */ }
    }
    return makeState();
  }

  function saveState(state) {
    const fs = vfs();
    if (!fs) return;
    try {
      fs.write(STATE_PATH, JSON.stringify(state, null, 2));
      if (state.initialized) {
        fs.write(PROJECT + '/myst.toml', renderManifestToml(state));
        fs.write(PROJECT + '/myst.lock', renderLockToml(state));
        if (!fs.exists(PROJECT + '/myst_libs')) fs.mkdir(PROJECT + '/myst_libs');
      }
    } catch (e) { /* stay in RAM */ }
  }

  function renderManifestToml(state) {
    const lines = ['[package]',
      'name    = "' + state.projectName + '"',
      'version = "' + state.projectVersion + '"'];
    if (state.projectDesc) lines.push('description = "' + state.projectDesc + '"');
    lines.push('', '[dependencies]');
    Object.keys(state.manifest).sort().forEach(k => lines.push(k + ' = "' + state.manifest[k] + '"'));
    lines.push('');
    return lines.join('\n');
  }
  function renderLockToml(state) {
    const lines = ['# myst.lock — generated; do not edit by hand', ''];
    Object.keys(state.lockfile).sort().forEach(k => {
      const e = state.lockfile[k];
      lines.push('[[package]]', 'name    = "' + k + '"', 'version = "' + e.version + '"',
                 'hash    = "sha256:' + e.hash + '"');
      if (e.source) lines.push('source  = "' + e.source + '"');
      lines.push('');
    });
    return lines.join('\n');
  }

  function parseTomlField(toml, field) {
    const m = toml.match(new RegExp('^\\s*' + field + '\\s*=\\s*"([^"]*)"', 'm'));
    return m ? m[1] : null;
  }
  function parseTomlDeps(toml) {
    const deps = {};
    const block = toml.split(/^\[dependencies\]\s*$/m)[1];
    if (!block) return deps;
    const stop = block.search(/^\[/m);
    const body = stop === -1 ? block : block.slice(0, stop);
    const re = /^\s*([a-zA-Z0-9_-]+)\s*=\s*"([^"]*)"/gm;
    let m;
    while ((m = re.exec(body))) deps[m[1]] = m[2];
    return deps;
  }

  function instMeta(state, name) {
    const inst = state.installed[name] || {};
    const ver  = inst.version;
    const reg  = REGISTRY[name] && REGISTRY[name].versions[ver];
    return {
      version: ver,
      size_kb: inst.size_kb != null ? inst.size_kb : (reg ? reg.size_kb : 0),
      health:  inst.health || (reg ? reg.health : 'A'),
      notes:   (inst.notes != null && inst.notes !== '') ? inst.notes : (reg ? reg.notes : ''),
      desc:    inst.desc || (REGISTRY[name] ? REGISTRY[name].desc : ''),
      deps:    inst.deps || (reg ? reg.deps : []),
      transitive: !!inst.transitive,
      source:  inst.source || 'registry',
      latest:  REGISTRY[name] ? REGISTRY[name].latest : ver,
    };
  }

  // ── GitHub fetch ───────────────────────────────────────────────────────────
  async function ghListFiles(pkgPath) {
    const api = 'https://api.github.com/repos/' + GH.owner + '/' + GH.repo +
                '/contents/' + pkgPath + '?ref=' + GH.branch;
    const res = await fetch(api, { headers: { 'Accept': 'application/vnd.github+json' } });
    if (!res.ok) throw new Error('contents API ' + res.status);
    const items = await res.json();
    if (!Array.isArray(items)) throw new Error('unexpected contents response');
    let files = [];
    for (const it of items) {
      if (it.type === 'dir') files = files.concat(await ghListFiles(it.path));
      else if (it.type === 'file') files.push({ path: it.path, url: it.download_url });
    }
    return files;
  }

  async function ghFetchPackage(pkg, onProgress) {
    const pkgPath = GH.root + '/' + pkg;
    let manifest;
    try {
      manifest = await ghListFiles(pkgPath);
    } catch (e) {
      manifest = FALLBACK_FILES.map(rel => ({
        path: pkgPath + '/' + rel,
        url: 'https://raw.githubusercontent.com/' + GH.owner + '/' + GH.repo +
             '/' + GH.branch + '/' + pkgPath + '/' + rel
      }));
    }
    const out = [];
    for (const f of manifest) {
      try {
        const r = await fetch(f.url);
        if (!r.ok) continue;
        const text = await r.text();
        out.push({ rel: f.path.slice(pkgPath.length + 1), text });
        if (onProgress) onProgress(f.path.slice(pkgPath.length + 1));
      } catch (e) { /* skip */ }
    }
    if (!out.length) throw new Error('no files fetched for ' + pkg);
    return out;
  }

  // ── Resolver ─────────────────────────────────────────────────────────────
  function parseVer(v) {
    // parse "pkg@version" or "pkg" → { name, version }
    const at = v.indexOf('@');
    if (at === -1) return { name: v, version: null };
    return { name: v.slice(0, at), version: v.slice(at + 1) };
  }

  function resolveLatest(pkgName, requestedVer) {
    const entry = REGISTRY[pkgName];
    if (!entry) return null;
    if (requestedVer) {
      // explicit version requested — must exist; never silently fall back
      return entry.versions[requestedVer] ? requestedVer : null;
    }
    return entry.latest;
  }

  // Resolve a package + all its transitive deps
  // Returns: Map of { pkgName -> version } or null if conflict
  function resolveAll(roots, existingInstalled) {
    const resolved = new Map();
    const queue = [...roots];
    const visited = new Set();

    // Seed with already-installed versions for conflict detection
    for (const [k, v] of Object.entries(existingInstalled || {})) {
      resolved.set(k, v.version);
    }

    while (queue.length > 0) {
      const { name, version: reqVer } = parseVer(queue.shift());
      if (visited.has(name)) continue;
      visited.add(name);

      const entry = REGISTRY[name];
      if (!entry) return { error: `package '${name}' not found in registry` };

      const ver = resolveLatest(name, reqVer);
      if (!ver) return { error: `version '${reqVer}' of '${name}' not found` };

      const existingVer = resolved.get(name);
      if (existingVer && existingVer !== ver) {
        // Conflict — keep already-resolved version (simpler constraint: accept existing)
      } else {
        resolved.set(name, ver);
      }

      const verData = entry.versions[resolved.get(name)];
      for (const dep of verData.deps) {
        const { name: dname } = parseVer(dep);
        if (!visited.has(dname)) queue.push(dep);
      }
    }

    return { resolved };
  }

  // ── Pad helper ────────────────────────────────────────────────────────────
  function pad(s, n) { return String(s).padEnd(n); }
  function padL(s, n) { return String(s).padStart(n); }
  function sha256stub(name, ver) {
    // deterministic fake hash
    let h = 0;
    for (const c of (name+ver)) h = (Math.imul(31, h) + c.charCodeAt(0)) >>> 0;
    return h.toString(16).padStart(8,'0') + '…';
  }
  function fmtSize(kb) {
    if (kb >= 1024) return (kb/1024).toFixed(1)+' MB';
    return kb+' KB';
  }
  function gradeColor(g) {
    return ({A:'grade-a',B:'grade-b',C:'grade-c',D:'grade-d',F:'grade-f'})[g]||'grade-f';
  }

  // ── Command handlers ──────────────────────────────────────────────────────
  function cmdHelp(state, args, out) {
    out('');
    out('  Myst  '+MYST_VER+'  — Sage Package Manager', 'title');
    out('  ──────────────────────────────────────────────────');
    out('  usage:  myst <command> [options]');
    out('');
    out('  commands:');
    out('    init   [name]           initialise a new project');
    out('    add    <pkg[@ver]> …    add one or more dependencies');
    out('    install                 install all declared dependencies');
    out('    remove <pkg>            remove a package');
    out('    update [pkg]            update to latest compatible version');
    out('    list                    list installed packages');
    out('    status                  show project status');
    out('    scan                    scan source for import mismatches');
    out('    health                  grade each package A–F');
    out('    duplicates              find duplicate or conflicting packages');
    out('    graph [--dot] [--json]  show dependency tree');
    out('    lock                    regenerate lockfile');
    out('    search <query>          search the package registry');
    out('    version                 show Myst version');
    out('    help                    this message');
    out('');
    out('  flags:');
    out('    --dev      add as dev dependency');
    out('    --prune    also remove orphaned transitives on remove');
    out('');
  }

  function cmdVersion(state, args, out) {
    out('  myst  '+MYST_VER+'  (Sage Package Manager)');
  }

  function cmdInit(state, args, out) {
    const name = args.find(a=>!a.startsWith('-')) || 'my-project';
    if (state.initialized) {
      out('  -- already initialised as \'' + state.projectName + '\'', 'warn');
      out('     run \'myst status\' to check project state', 'dim');
      return;
    }
    state.initialized = true;
    state.projectName = name;
    state.manifest = {};
    state.installed = {};
    state.lockfile = {};
    state.sourceImports = [];

    // scaffold the project in the shared filesystem
    const fs = vfs();
    if (fs) {
      if (!fs.exists(PROJECT + '/myst_libs')) fs.mkdir(PROJECT + '/myst_libs');
    }

    out('');
    out('  initialising   ' + name + '  ─── myst ' + MYST_VER, 'title');
    out('');
    out('    created   myst.toml', 'ok');
    out('    created   myst.lock', 'ok');
    out('    created   myst_libs/', 'ok');
    out('');
    out('  project ' + name + ' ready  ·  run \'myst add <pkg>\' to get started', 'dim');
    out('  tip: try  myst add sage-numpy  (fetched live from GitHub)', 'dim');
    out('');
  }

  // GitHub-backed install: fetch real files into the VFS, then go through
  // the interpreter on import.
  async function cmdAddGithub(state, pkg, isDev, out) {
    const fs = vfs();
    if (!fs) { out('  -- filesystem unavailable', 'error'); return; }
    if (state.installed[pkg]) { out('  already installed: ' + pkg, 'ok'); out(''); return; }

    out('  resolving   ' + pkg + '  ─── github:' + GH.owner + '/' + GH.repo, 'section');
    out('  fetching    ' + GH.root + '/' + pkg + ' …', 'dim');
    out('');

    let files;
    try {
      files = await ghFetchPackage(pkg, rel => out('    ↓  ' + rel, 'plan-add'));
    } catch (e) {
      out('  -- fetch failed: ' + (e && e.message ? e.message : e), 'error');
      out('     check your connection, or that the repo path exists:', 'dim');
      out('     github.com/' + GH.owner + '/' + GH.repo + '/tree/' + GH.branch + '/' + GH.root + '/' + pkg, 'dim');
      out('');
      return;
    }

    // write everything into the project's myst_libs
    const base = PROJECT + '/myst_libs/' + pkg;
    let bytes = 0;
    let manifestToml = '';
    for (const f of files) {
      fs.write(base + '/' + f.rel, f.text);
      bytes += f.text.length;
      if (f.rel === 'myst.toml') manifestToml = f.text;
    }

    const version = parseTomlField(manifestToml, 'version') || '0.1.0';
    const declaredDeps = parseTomlDeps(manifestToml);
    const sizeKb = Math.max(1, Math.round(bytes / 1024));

    state.manifest[pkg] = version;
    state.installed[pkg] = {
      version, size_kb: sizeKb, transitive: false, source: 'github',
      health: 'A', notes: '', desc: parseTomlField(manifestToml, 'description') || '',
      deps: Object.keys(declaredDeps).map(d => d + '@' + declaredDeps[d]),
      dev: !!isDev
    };
    state.lockfile[pkg] = { version, hash: sha256stub(pkg, version), source: 'github' };

    out('');
    out('  copied      ' + files.length + ' files into myst_libs/' + pkg + '  (' + fmtSize(sizeKb) + ')', 'ok');
    out('  installed   ' + pkg + '@' + version + '  ·  lockfile updated', 'ok');
    const depNames = Object.keys(declaredDeps);
    if (depNames.length) {
      out('  declares    ' + depNames.join(', '), 'dim');
      out('              (resolved on demand by the interpreter)', 'dim');
    }
    out('  import it:   import ' + pkg + ' as ' + pkg.replace(/^sage-/, '').replace(/-/g, '_'), 'dim');
    out('');
  }

  async function cmdAdd(state, args, out) {
    if (!state.initialized) { out('  -- no project found. run \'myst init\' first', 'error'); return; }
    const pkgArgs = args.filter(a => !a.startsWith('-'));
    const isDev   = args.includes('--dev');
    if (pkgArgs.length === 0) { out('  -- usage: myst add <pkg[@version]> [--dev]', 'error'); return; }

    // split into github-backed (real fetch) and registry (emulated)
    const ghPkgs  = [];
    const regPkgs = [];
    for (const p of pkgArgs) {
      const { name } = parseVer(p);
      if (GITHUB_PACKAGES.indexOf(name) !== -1) ghPkgs.push(name);
      else regPkgs.push(p);
    }

    // real fetches first (sequential so output reads cleanly)
    for (const g of ghPkgs) {
      out('');
      await cmdAddGithub(state, g, isDev, out);
    }

    if (regPkgs.length === 0) return;

    out('');
    // Resolve all requested registry packages
    const { resolved, error } = resolveAll(regPkgs, state.installed);
    if (error) { out('  -- error: ' + error, 'error'); out(''); return; }

    const toInstall = [];
    for (const [name, ver] of resolved.entries()) {
      if (!state.installed[name] && REGISTRY[name]) {
        const isDirect = regPkgs.some(p => parseVer(p).name === name);
        toInstall.push({ name, ver, isDirect });
      }
    }

    if (toInstall.length === 0) {
      out('  already up to date  ·  nothing to install', 'ok');
      out('');
      return;
    }

    const labelW = Math.max(...toInstall.map(p=>p.name.length)) + 2;
    const verW   = Math.max(...toInstall.map(p=>p.ver.length)) + 2;
    out('  plan', 'section');
    for (const { name, ver, isDirect } of toInstall) {
      const verData = REGISTRY[name].versions[ver];
      const tag    = isDirect ? '' : '  (transitive)';
      out('    + ' + pad(name, labelW) + pad(ver, verW) + fmtSize(verData.size_kb).padEnd(10) + tag, 'plan-add');
    }
    out('');

    const totalKB = toInstall.reduce((s,p)=>s+REGISTRY[p.name].versions[p.ver].size_kb, 0);
    out('  fetching  ' + toInstall.length + ' package' + (toInstall.length>1?'s':'') + '  (' + fmtSize(totalKB) + ')', 'section');
    out('');

    const installOrder = [];
    const added = new Set();
    function addWithDeps(name) {
      if (added.has(name)) return;
      const ver = resolved.get(name);
      const verData = REGISTRY[name].versions[ver];
      for (const dep of verData.deps) addWithDeps(parseVer(dep).name);
      added.add(name);
      if (toInstall.some(p=>p.name===name)) installOrder.push(name);
    }
    for (const { name } of toInstall) addWithDeps(name);

    for (const name of installOrder) out('    ✓  ' + pad(name, labelW) + resolved.get(name), 'ok');
    out('');

    // commit + write a metadata-only package folder so it shows in the browser
    const fs = vfs();
    for (const { name, ver, isDirect } of toInstall) {
      const verData = REGISTRY[name].versions[ver];
      state.installed[name] = {
        version: ver, size_kb: verData.size_kb, transitive: !isDirect,
        source: 'registry', health: verData.health, notes: verData.notes,
        desc: REGISTRY[name].desc, deps: verData.deps
      };
      state.lockfile[name] = { version: ver, hash: sha256stub(name, ver) };
      if (isDirect) { state.manifest[name] = ver; if (isDev) state.installed[name].dev = true; }
      if (fs) {
        const base = PROJECT + '/myst_libs/' + name;
        fs.write(base + '/myst.toml',
          '[package]\nname = "' + name + '"\nversion = "' + ver + '"\n' +
          'description = "' + REGISTRY[name].desc + '"\n\n' +
          '# registry package — metadata only in the playground.\n' +
          '# (source is fetched on a real Sage install)\n');
      }
    }

    out('  installed  ' + toInstall.length + ' package' + (toInstall.length>1?'s':'') +
        '  ·  ' + fmtSize(totalKB) + '  ·  lockfile updated', 'ok');
    for (const { name, ver } of toInstall) {
      const h = REGISTRY[name].versions[ver].health;
      const n = REGISTRY[name].versions[ver].notes;
      if (h === 'D' || h === 'F') out('  -- warn: ' + name + '@' + ver + '  grade ' + h + ' — ' + n, 'warn');
    }
    out('');
  }

  function cmdInstall(state, args, out) {
    if (!state.initialized) { out('  -- no project found. run \'myst init\' first', 'error'); return; }
    if (Object.keys(state.manifest).length === 0) {
      out('  nothing declared in myst.toml  ·  run \'myst add <pkg>\' first', 'dim');
      return;
    }

    out('');
    const roots = Object.entries(state.manifest).map(([k,v])=>k+'@'+v);
    const { resolved, error } = resolveAll(roots, {});
    if (error) { out('  -- ' + error, 'error'); out(''); return; }

    const toInstall = [];
    for (const [name, ver] of resolved.entries()) {
      const isDirect = name in state.manifest;
      toInstall.push({ name, ver, isDirect });
    }

    const alreadyDone = toInstall.every(p => state.installed[p.name]?.version === p.ver);
    if (alreadyDone) {
      out('  ✓  all packages already installed  (' + toInstall.length + ' total)', 'ok');
      out('');
      return;
    }

    const labelW = Math.max(...toInstall.map(p=>p.name.length)) + 2;
    out('  installing  ' + toInstall.length + ' package' + (toInstall.length>1?'s':''), 'section');
    out('');

    for (const { name, ver } of toInstall) {
      const verData = REGISTRY[name].versions[ver];
      state.installed[name] = { version: ver, size_kb: verData.size_kb, transitive: !(name in state.manifest) };
      state.lockfile[name]  = { version: ver, hash: sha256stub(name, ver) };
      out('    ✓  ' + pad(name, labelW) + ver, 'ok');
    }
    out('');
    const totalKB = toInstall.reduce((s,p)=>s+REGISTRY[p.name].versions[p.ver].size_kb,0);
    out('  done  ·  ' + toInstall.length + ' packages  ·  ' + fmtSize(totalKB), 'ok');
    out('');
  }

  function cmdRemove(state, args, out) {
    if (!state.initialized) { out('  -- no project found. run \'myst init\' first', 'error'); return; }
    const pkgName = args.find(a=>!a.startsWith('-'));
    const prune   = args.includes('--prune');
    if (!pkgName) { out('  -- usage: myst remove <pkg> [--prune]', 'error'); return; }
    if (!state.manifest[pkgName]) {
      out('  -- \'' + pkgName + '\' not found in manifest', 'error');
      const sug = Object.keys(state.manifest).find(k=>k.includes(pkgName)||pkgName.includes(k));
      if (sug) out('     did you mean \'' + sug + '\'?', 'dim');
      return;
    }

    out('');
    out('  removing  ' + pkgName + '  ' + state.manifest[pkgName], 'warn');
    out('');

    // Find orphans — transitive deps only used by the removed package
    const removedDeps = [];
    const verData = REGISTRY[pkgName]?.versions[state.manifest[pkgName]];
    if (verData) {
      for (const dep of verData.deps) {
        const { name: dname } = parseVer(dep);
        // Check if any OTHER manifest package also needs this dep
        const stillNeeded = Object.entries(state.manifest)
          .filter(([k]) => k !== pkgName)
          .some(([k,v]) => {
            const vd = REGISTRY[k]?.versions[v];
            return vd?.deps?.some(d => parseVer(d).name === dname);
          });
        if (!stillNeeded && state.installed[dname]) removedDeps.push(dname);
      }
    }

    if (removedDeps.length > 0 && !prune) {
      const labelW = Math.max(...removedDeps.map(n=>n.length)) + 2;
      out('  orphaned transitive dependencies', 'section');
      for (const dep of removedDeps) {
        const { version, size_kb } = state.installed[dep] || {};
        out('    ─  ' + pad(dep, labelW) + (version||'?') + '   (' + fmtSize(size_kb||0) + ')  no longer needed', 'plan-rem');
      }
      out('');
      // Store pending confirmation
      state.pendingRemove = { pkgName, orphans: removedDeps };
      out('  also remove ' + removedDeps.length + ' orphaned package' + (removedDeps.length>1?'s':'') + '? [y/n]', 'prompt');
      return;
    }

    // Do the remove immediately
    _doRemove(state, pkgName, prune ? removedDeps : [], out);
  }

  function _doRemove(state, pkgName, orphans, out) {
    const fs = vfs();
    const removeFiles = (n) => { if (fs) { const p = PROJECT + '/myst_libs/' + n; if (fs.exists(p)) fs.rm(p); } };
    delete state.manifest[pkgName];
    delete state.installed[pkgName];
    delete state.lockfile[pkgName];
    removeFiles(pkgName);
    for (const dep of orphans) {
      delete state.installed[dep];
      delete state.lockfile[dep];
      removeFiles(dep);
    }
    const total = 1 + orphans.length;
    out('  removed  ' + total + ' package' + (total>1?'s':'') + '  ·  files deleted  ·  lockfile updated', 'ok');
    out('');
  }

  function cmdUpdate(state, args, out) {
    if (!state.initialized) { out('  -- no project found. run \'myst init\' first', 'error'); return; }
    if (Object.keys(state.installed).length === 0) {
      out('  nothing installed  ·  run \'myst install\' first', 'dim');
      return;
    }

    const target = args.find(a=>!a.startsWith('-'));
    const toCheck = target ? [target] : Object.keys(state.installed);

    out('');
    out('  checking for updates…', 'dim');
    out('');

    const updates = [];
    for (const name of toCheck) {
      if (!state.installed[name]) {
        out('  -- \'' + name + '\' is not installed', 'error');
        continue;
      }
      const cur = state.installed[name].version;
      const latest = REGISTRY[name]?.latest;
      if (latest && latest !== cur) updates.push({ name, cur, latest });
    }

    if (updates.length === 0) {
      out('  ✓  all packages up to date', 'ok');
      out('');
      return;
    }

    const labelW = Math.max(...updates.map(u=>u.name.length)) + 2;
    for (const { name, cur, latest } of updates) {
      out('  ' + pad(name, labelW) + cur + '  →  ' + latest, 'update');
      const changelog = REGISTRY[name].versions[latest].changelog;
      if (changelog) {
        for (const line of changelog) {
          out('    ' + line, 'dim');
        }
      }
      out('');
    }

    if (!target) {
      out('  ' + updates.length + ' package' + (updates.length>1?'s':'') +
          ' to update  ·  run \'myst update <pkg>\' to update one', 'dim');
    } else {
      // Auto-update the specific package
      const { name, latest } = updates[0];
      const verData = REGISTRY[name].versions[latest];
      state.installed[name] = { ...state.installed[name], version: latest, size_kb: verData.size_kb };
      state.lockfile[name]  = { version: latest, hash: sha256stub(name, latest) };
      if (state.manifest[name]) state.manifest[name] = latest;
      out('  updated  ' + name + '  →  ' + latest + '  ·  lockfile updated', 'ok');
    }
    out('');
  }

  function cmdList(state, args, out) {
    if (!state.initialized) { out('  -- no project found. run \'myst init\' first', 'error'); return; }
    const pkgs = Object.entries(state.installed);
    if (pkgs.length === 0) {
      out('  no packages installed  ·  run \'myst add <pkg>\'', 'dim');
      return;
    }
    out('');
    out('  packages  (' + pkgs.length + ' installed)', 'section');
    out('');

    const labelW = Math.max(...pkgs.map(([n])=>n.length)) + 2;
    const verW   = Math.max(...pkgs.map(([,p])=>p.version.length)) + 2;
    let totalKB  = 0;

    for (const [name, pkg] of pkgs.sort(([a],[b])=>a.localeCompare(b))) {
      const latest  = REGISTRY[name]?.latest;
      const outdated = latest && latest !== pkg.version;
      const tag     = pkg.transitive ? '  (transitive)' : (pkg.dev ? '  (dev)' : '');
      const upd     = outdated ? '  ⚠ '+latest+' available' : '  ✓';
      totalKB += pkg.size_kb;
      out('    ' + pad(name, labelW) + pad(pkg.version, verW) + pad(fmtSize(pkg.size_kb), 10) + upd + tag,
          outdated ? 'list-outdated' : 'ok');
    }

    out('');
    out('  total  ' + pkgs.length + ' packages  ·  ' + fmtSize(totalKB), 'dim');
    out('');
  }

  function cmdStatus(state, args, out) {
    if (!state.initialized) { out('  -- no project found. run \'myst init\' first', 'error'); return; }
    out('');
    out('  project   ' + state.projectName + '  ' + state.projectVersion, 'title');
    out('');

    const installed = Object.entries(state.installed);
    const direct    = installed.filter(([k])=>k in state.manifest).length;
    const trans     = installed.length - direct;
    out('  manifest  ' + direct + ' direct  ·  ' + trans + ' transitive  (' + installed.length + ' total)');

    const inSync = Object.keys(state.lockfile).length === installed.length;
    out('  lockfile  ' + (inSync ? '✓ in sync' : '⚠ stale — run \'myst lock\'') + '  (' + Object.keys(state.lockfile).length + ' locked)',
        inSync ? 'ok' : 'warn');

    // Compute project grade
    const grades = installed.map(([n,p])=>REGISTRY[n]?.versions[p.version]?.health||'A');
    const worstGrade = grades.sort().reverse()[0] || 'A';
    out('  health    ' + worstGrade, gradeColor(worstGrade));
    out('');
  }

  function cmdHealth(state, args, out) {
    if (!state.initialized) { out('  -- no project found. run \'myst init\' first', 'error'); return; }
    const pkgs = Object.entries(state.installed);
    if (pkgs.length === 0) { out('  no packages installed', 'dim'); return; }

    out('');
    out('  package health', 'section');
    out('');

    const labelW = Math.max(...pkgs.map(([n])=>n.length)) + 2;
    const verW   = Math.max(...pkgs.map(([,p])=>p.version.length)) + 2;
    const counts = {A:0,B:0,C:0,D:0,F:0};

    for (const [name, pkg] of pkgs.sort(([a],[b])=>a.localeCompare(b))) {
      const meta    = instMeta(state, name);
      const grade   = meta.health || 'A';
      const notes   = meta.notes || (meta.source === 'github' ? 'fetched live · fresh' : 'all clear');
      counts[grade] = (counts[grade]||0) + 1;
      out('    ' + pad(name, labelW) + pad(pkg.version, verW) + '  ' + grade + '   ─── ' + notes,
          gradeColor(grade));
    }

    out('');
    const worstGrade = Object.entries(counts).filter(([,c])=>c>0).sort(([a],[b])=>a>b?1:-1).pop()?.[0]||'A';
    const issues = pkgs.filter(([n])=>{const g=instMeta(state,n).health;return g&&g!=='A';}).length;
    out('  project grade: ' + worstGrade + (issues>0?'  ·  '+issues+' package'+(issues>1?'s':'')+ ' with issues':'  ·  all packages healthy'), gradeColor(worstGrade));
    out('');
  }

  function cmdScan(state, args, out) {
    if (!state.initialized) { out('  -- no project found. run \'myst init\' first', 'error'); return; }
    out('');
    out('  scanning source files…', 'dim');
    out('');

    // Simulate: source files "import" a subset of installed packages + possibly extras
    const installed = Object.keys(state.installed);

    // Determine "used in source": all direct deps are used, some transitives may not be
    // Add a fake "missing" import sometimes (sage-log if not installed)
    const issues = [];

    // Check for anything in manifest but "not found in source"
    // Simulated: if project has > 3 packages, one might be "unused"
    if (installed.length >= 4) {
      const unusedCandidates = Object.keys(state.manifest)
        .filter(k => !['sage-http','sage-json','sage-io','sage-net'].includes(k));
      if (unusedCandidates.length > 0 && installed.length >= 5) {
        const unused = unusedCandidates[0];
        issues.push({ type:'UNUSED', pkg: unused, file: null });
      }
    }

    // Check: is something in sourceImports not in manifest?
    for (const imp of state.sourceImports) {
      if (!state.manifest[imp] && !state.installed[imp]) {
        issues.push({ type:'MISSING', pkg: imp, file: 'src/main.sage:' + (Math.floor(Math.random()*40)+5) });
      }
    }

    if (issues.length === 0) {
      const total = installed.length;
      out('  ✓  no issues found  (' + total + ' declared · ' + total + ' used)', 'ok');
    } else {
      const labelW = 10;
      for (const issue of issues) {
        if (issue.type === 'MISSING') {
          out('  MISSING   ' + pad(issue.pkg, 20) + 'imported at ' + issue.file + ' but not declared', 'warn');
        } else {
          out('  UNUSED    ' + pad(issue.pkg, 20) + 'declared but no imports found in source', 'dim');
        }
      }
      out('');
      const missing = issues.filter(i=>i.type==='MISSING');
      if (missing.length > 0)
        out('  ' + issues.length + ' issue' + (issues.length>1?'s':'') +
            '  ·  run \'myst add ' + missing.map(i=>i.pkg).join(' ') + '\' to fix', 'dim');
    }
    out('');
  }

  function cmdDuplicates(state, args, out) {
    if (!state.initialized) { out('  -- no project found. run \'myst init\' first', 'error'); return; }
    const installed = Object.entries(state.installed);
    if (installed.length === 0) { out('  no packages installed', 'dim'); return; }

    out('');

    // Detect version conflicts in full resolution
    const roots = Object.entries(state.manifest).map(([k,v])=>k+'@'+v);
    const versionSeen = {};  // pkgName -> [version, requiredBy]
    const conflicts = [];

    for (const [dirPkg, dirVer] of Object.entries(state.manifest)) {
      const verData = REGISTRY[dirPkg]?.versions[dirVer];
      if (!verData) continue;
      for (const dep of verData.deps) {
        const { name, version } = parseVer(dep);
        if (!versionSeen[name]) versionSeen[name] = [];
        versionSeen[name].push({ version, requiredBy: dirPkg+'@'+dirVer });
      }
    }
    for (const [name, refs] of Object.entries(versionSeen)) {
      const unique = [...new Set(refs.map(r=>r.version))];
      if (unique.length > 1) {
        conflicts.push({ name, refs });
      }
    }

    // Detect same-category duplicates
    const byCategory = {};
    for (const [name] of installed) {
      const cat = REGISTRY[name]?.category;
      if (cat) {
        if (!byCategory[cat]) byCategory[cat] = [];
        byCategory[cat].push(name);
      }
    }
    const catDups = Object.entries(byCategory).filter(([,pkgs])=>pkgs.length>1);

    let found = false;

    if (conflicts.length > 0) {
      found = true;
      out('  version conflicts', 'section');
      for (const { name, refs } of conflicts) {
        out('');
        out('    ' + name, 'warn');
        for (const { version, requiredBy } of refs) {
          out('      ' + version + '  ─── required by ' + requiredBy, 'dim');
        }
      }
      out('');
    }

    if (catDups.length > 0) {
      found = true;
      out('  category duplicates', 'section');
      for (const [cat, pkgs] of catDups) {
        out('    ' + cat + ':  ' + pkgs.join(', '), 'dim');
      }
      out('');
    }

    if (!found) {
      out('  ✓  no duplicates found', 'ok');
      out('');
    }
  }

  function cmdGraph(state, args, out) {
    if (!state.initialized) { out('  -- no project found. run \'myst init\' first', 'error'); return; }
    const installed = Object.entries(state.installed);
    if (installed.length === 0) { out('  no packages installed', 'dim'); return; }

    const isDot  = args.includes('--dot');
    const isJson = args.includes('--json');

    out('');

    if (isDot) {
      out('  digraph "' + state.projectName + '" {', 'code');
      out('    rankdir=LR;', 'code');
      out('    node [shape=box, fontname="monospace"];', 'code');
      for (const [name, pkg] of installed) {
        const deps = instMeta(state, name).deps || [];
        for (const dep of deps) {
          const { name: dname } = parseVer(dep);
          if (state.installed[dname]) {
            out('    "' + name + '" -> "' + dname + '";', 'code');
          }
        }
      }
      out('  }', 'code');
      out('');
      return;
    }

    if (isJson) {
      const nodes = installed.map(([n,p])=>({name:n,version:p.version}));
      const edges = [];
      for (const [name, pkg] of installed) {
        const deps = instMeta(state, name).deps || [];
        for (const dep of deps) {
          const { name: dname } = parseVer(dep);
          if (state.installed[dname]) edges.push({ from:name, to:dname });
        }
      }
      out('  ' + JSON.stringify({project:state.projectName, nodes, edges}, null, 2).split('\n').join('\n  '), 'code');
      out('');
      return;
    }

    // ASCII tree
    const directDeps = Object.keys(state.manifest);
    out('  ' + state.projectName + '  ' + state.projectVersion);

    function renderTree(pkgName, version, prefix, isLast, visited) {
      if (visited.has(pkgName)) {
        out(prefix + (isLast?'└──':'├──') + ' ' + pkgName + ' ' + version + ' (*)');
        return;
      }
      visited.add(pkgName);
      out(prefix + (isLast?'└──':'├──') + ' ' + pkgName + ' ' + version);
      const deps = (instMeta(state, pkgName).deps || []).filter(d=>state.installed[parseVer(d).name]);
      const childPrefix = prefix + (isLast ? '    ' : '│   ');
      deps.forEach((dep, i) => {
        const { name: dname } = parseVer(dep);
        const dver = state.installed[dname]?.version || '?';
        renderTree(dname, dver, childPrefix, i===deps.length-1, new Set(visited));
      });
    }

    directDeps.forEach((dep, i) => {
      const ver = state.installed[dep]?.version || state.manifest[dep];
      renderTree(dep, ver, '  ', i===directDeps.length-1, new Set());
    });
    out('');
    out('  (* = already shown; cycle broken)', 'dim');
    out('');
  }

  function cmdLock(state, args, out) {
    if (!state.initialized) { out('  -- no project found. run \'myst init\' first', 'error'); return; }
    const installed = Object.entries(state.installed);
    if (installed.length === 0) { out('  nothing installed  ·  lockfile is empty', 'dim'); return; }

    out('');
    out('  regenerating lockfile…', 'dim');
    out('');

    const labelW = Math.max(...installed.map(([n])=>n.length)) + 2;
    const verW   = Math.max(...installed.map(([,p])=>p.version.length)) + 2;

    state.lockfile = {};
    for (const [name, pkg] of installed.sort(([a],[b])=>a.localeCompare(b))) {
      const hash = sha256stub(name, pkg.version);
      state.lockfile[name] = { version: pkg.version, hash };
      out('    ' + pad(name, labelW) + pad(pkg.version, verW) + 'sha256:' + hash);
    }
    out('');
    out('  locked  ' + installed.length + ' packages  ·  myst.lock', 'ok');
    out('');
  }

  // descriptions for the live GitHub packages (shown in search)
  const GITHUB_PKG_INFO = {
    'sage-numpy':       { desc: 'NumPy bindings via Python FFI',          stars: 4.9, category: 'science' },
    'sage-requests':    { desc: 'HTTP client via libcurl C FFI',          stars: 4.8, category: 'networking' },
    'sage-redis':       { desc: 'Redis client via hiredis C FFI',         stars: 4.6, category: 'database' },
    'sage-pandas':      { desc: 'pandas DataFrames via Python FFI',        stars: 4.7, category: 'science' },
    'sage-torch':       { desc: 'PyTorch tensors + autograd via Python FFI', stars: 4.8, category: 'science' },
    'sage-sandbox-demo':{ desc: 'LilyBox sandboxing patterns',            stars: 4.5, category: 'security' },
  };

  function cmdSearch(state, args, out) {
    const query = args.find(a=>!a.startsWith('-'))?.toLowerCase() || '';
    if (!query) { out('  -- usage: myst search <query>', 'error'); return; }

    // registry packages
    const results = Object.entries(REGISTRY).filter(([name, entry]) =>
      name.toLowerCase().includes(query) ||
      entry.desc.toLowerCase().includes(query) ||
      (entry.category||'').toLowerCase().includes(query)
    ).map(([name, entry]) => [name, { desc: entry.desc, stars: entry.stars, latest: entry.latest, live: false }]);

    // live GitHub packages
    GITHUB_PACKAGES.forEach(name => {
      const info = GITHUB_PKG_INFO[name] || { desc: '', stars: 4.5 };
      if (name.toLowerCase().includes(query) ||
          info.desc.toLowerCase().includes(query) ||
          (info.category||'').toLowerCase().includes(query)) {
        results.push([name, { desc: info.desc, stars: info.stars, latest: 'github', live: true }]);
      }
    });

    out('');
    if (results.length === 0) {
      out('  no results for "' + query + '"', 'dim');
      out('');
      return;
    }

    out('  results for "' + query + '"  (' + results.length + ' package' + (results.length>1?'s':'') + ')', 'section');
    out('');

    const labelW = Math.max(...results.map(([n])=>n.length)) + 2;
    const verW   = 9;
    for (const [name, entry] of results.sort(([,a],[,b])=>b.stars-a.stars)) {
      const installed  = state.installed[name];
      const tag = installed ? '  ✓ installed' : (entry.live ? '  ⬇ live' : '');
      const star = '★ ' + entry.stars.toFixed(1);
      out('    ' + pad(name, labelW) + pad(entry.latest, verW) + pad(entry.desc, 44) + star + tag,
          installed ? 'ok' : (entry.live ? 'plan-add' : ''));
    }
    out('');
  }

  // ── Command dispatcher ────────────────────────────────────────────────────
  async function dispatch(state, input, out) {
    const trimmed = input.trim();
    if (!trimmed) return;

    // Handle pending y/n confirmation for remove
    if (state.pendingRemove) {
      const ans = trimmed.toLowerCase();
      const { pkgName, orphans } = state.pendingRemove;
      state.pendingRemove = null;
      if (ans === 'y' || ans === 'yes') _doRemove(state, pkgName, orphans, out);
      else _doRemove(state, pkgName, [], out);
      return;
    }

    const normalised = trimmed.replace(/^myst\s+/, '');
    const parts = normalised.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [];
    const cmd = parts[0]?.toLowerCase() || '';
    const args = parts.slice(1).map(a => a.replace(/^['"]|['"]$/g,''));

    switch(cmd) {
      case 'help': case '-h': case '--help': case '': cmdHelp(state, args, out); break;
      case 'version': case '-v': case '-V': case '--version': cmdVersion(state, args, out); break;
      case 'init':       cmdInit(state, args, out); break;
      case 'add':        await cmdAdd(state, args, out); break;
      case 'install': case 'i': cmdInstall(state, args, out); break;
      case 'remove': case 'rm': cmdRemove(state, args, out); break;
      case 'update':     cmdUpdate(state, args, out); break;
      case 'list': case 'ls':  cmdList(state, args, out); break;
      case 'status':     cmdStatus(state, args, out); break;
      case 'health':     cmdHealth(state, args, out); break;
      case 'scan':       cmdScan(state, args, out); break;
      case 'duplicates': case 'dup': cmdDuplicates(state, args, out); break;
      case 'graph':      cmdGraph(state, args, out); break;
      case 'tree':       cmdTree(state, args, out); break;
      case 'lock':       cmdLock(state, args, out); break;
      case 'search':     cmdSearch(state, args, out); break;
      case 'clear':      out('\x1b[2J'); break; // handled by UI
      default:
        out('  -- unknown command \'' + cmd + '\'  ·  run \'myst help\'', 'error');
        const CMDS = ['init','add','install','remove','update','list','status','health','scan','duplicates','graph','tree','lock','search','version','help'];
        let best = null, bestD = 4;
        for (const c of CMDS) {
          const d = levenshtein(cmd, c);
          if (d < bestD) { bestD = d; best = c; }
        }
        if (best) out('     did you mean \'myst ' + best + '\'?', 'dim');
    }
  }

  // Show the project's filesystem tree (a playground-only convenience).
  function cmdTree(state, args, out) {
    const fs = vfs();
    if (!fs) { out('  -- filesystem unavailable', 'error'); return; }
    out('');
    out('  ' + PROJECT, 'section');
    function walk(path, prefix) {
      const items = fs.ls(path);
      items.forEach((it, i) => {
        const last = i === items.length - 1;
        const branch = last ? '└── ' : '├── ';
        out('  ' + prefix + branch + it.name + (it.type === 'dir' ? '/' : ''),
            it.type === 'dir' ? 'plan-add' : 'default');
        if (it.type === 'dir') walk(it.path, prefix + (last ? '    ' : '│   '));
      });
    }
    walk(PROJECT, '');
    out('');
  }

  function levenshtein(a, b) {
    const m=a.length, n=b.length;
    const dp=Array.from({length:m+1},(_,i)=>[i,...Array(n).fill(0)]);
    for(let j=0;j<=n;j++) dp[0][j]=j;
    for(let i=1;i<=m;i++) for(let j=1;j<=n;j++)
      dp[i][j]=a[i-1]===b[j-1]?dp[i-1][j-1]:1+Math.min(dp[i-1][j],dp[i][j-1],dp[i-1][j-1]);
    return dp[m][n];
  }

  // ── CSS ───────────────────────────────────────────────────────────────────
  function injectCSS() {
    const css = `
    .myst-wrap {
      font-family: 'JetBrains Mono','Fira Mono','Cascadia Code','Consolas',monospace;
      background: #181520;
      border: 1px solid #312840;
      border-radius: 12px;
      overflow: hidden;
      width: 100%;
      max-width: 860px;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      box-shadow: 0 8px 40px rgba(0,0,0,0.5);
    }
    .myst-chrome {
      background: #211c2e;
      padding: 11px 16px;
      display: flex;
      align-items: center;
      gap: 7px;
      border-bottom: 1px solid #312840;
      flex-shrink: 0;
      user-select: none;
    }
    .myst-dot { width:12px; height:12px; border-radius:50%; }
    .myst-dot-r { background:#ff5f57; }
    .myst-dot-y { background:#ffbd2e; }
    .myst-dot-g { background:#28c840; }
    .myst-chrome-title { margin-left:8px; font-size:11px; color:#6b5a88; letter-spacing:.05em; }
    .myst-chrome-proj  { margin-left:auto; font-size:11px; color:#8a70a8; }
    .myst-output {
      padding: 14px 20px 8px;
      overflow-y: auto;
      flex: 1;
      min-height: 280px;
      max-height: 540px;
      font-size: 13px;
      line-height: 1.7;
      color: #c0b8d8;
      scroll-behavior: smooth;
    }
    .myst-output::-webkit-scrollbar { width:5px; }
    .myst-output::-webkit-scrollbar-track { background:transparent; }
    .myst-output::-webkit-scrollbar-thumb { background:#312840; border-radius:4px; }
    .myst-line { white-space:pre-wrap; word-break:break-word; margin:0; }
    .myst-line-input    { color:#8880a8; }
    .myst-line-default  { color:#c0b8d8; }
    .myst-line-title    { color:#d8b0f0; font-weight:600; }
    .myst-line-section  { color:#a890c8; }
    .myst-line-ok       { color:#90e0a8; }
    .myst-line-warn     { color:#f0c060; }
    .myst-line-error    { color:#f08080; }
    .myst-line-dim      { color:#5a4870; }
    .myst-line-plan-add { color:#80d0f0; }
    .myst-line-plan-rem { color:#f08890; }
    .myst-line-update   { color:#a8d8ff; }
    .myst-line-prompt   { color:#f0c060; }
    .myst-line-code     { color:#b0e8c0; }
    .myst-line-grade-a  { color:#60e880; }
    .myst-line-grade-b  { color:#a8d840; }
    .myst-line-grade-c  { color:#f0c060; }
    .myst-line-grade-d  { color:#f09040; }
    .myst-line-grade-f  { color:#f05050; }
    .myst-line-list-outdated { color:#f0c060; }
    .myst-input-row {
      display:flex; align-items:flex-start;
      padding:8px 20px 14px;
      border-top:1px solid #221830;
      gap:8px;
      flex-shrink:0;
    }
    .myst-prompt-label {
      color:#9870c0; font-size:13px; padding-top:2px;
      flex-shrink:0; user-select:none; min-width:68px;
    }
    .myst-input {
      flex:1; background:transparent; border:none; outline:none;
      color:#e0d8f8; font-size:13px; font-family:inherit;
      resize:none; line-height:1.7; caret-color:#a880d0; padding:0;
    }
    .myst-input::placeholder { color:#3d2855; }
    `;
    const tag = document.createElement('style');
    tag.textContent = css;
    document.head.appendChild(tag);
  }

  // ── Terminal UI ───────────────────────────────────────────────────────────
  class MystTerminal {
    constructor(container) {
      this.container = container;
      this.vfs     = global.SageVFS || null;
      this.state   = loadState();          // shared across terminals + file browser
      this.history = [];
      this.histIdx = -1;
      this.busy    = false;
      this._build();
      this._welcome();
      // refresh the project label from the (possibly pre-existing) state
      this._updateProjLabel();
    }

    _build() {
      this.container.innerHTML = '';
      this.container.className = 'myst-wrap';

      this.chromeEl = document.createElement('div');
      this.chromeEl.className = 'myst-chrome';
      this.chromeEl.innerHTML = `
        <span class="myst-dot myst-dot-r"></span>
        <span class="myst-dot myst-dot-y"></span>
        <span class="myst-dot myst-dot-g"></span>
        <span class="myst-chrome-title">myst  ${MYST_VER}  — Sage Package Manager</span>
        <span class="myst-chrome-proj" id="myst-proj-label">no project</span>
      `;

      this.outputEl = document.createElement('div');
      this.outputEl.className = 'myst-output';
      this.outputEl.setAttribute('aria-live','polite');

      const inputRow = document.createElement('div');
      inputRow.className = 'myst-input-row';

      this.promptEl = document.createElement('span');
      this.promptEl.className = 'myst-prompt-label';
      this.promptEl.textContent = PROMPT;

      this.inputEl = document.createElement('textarea');
      this.inputEl.className = 'myst-input';
      this.inputEl.setAttribute('rows','1');
      this.inputEl.setAttribute('placeholder','myst <command> …');
      this.inputEl.setAttribute('autocomplete','off');
      this.inputEl.setAttribute('autocorrect','off');
      this.inputEl.setAttribute('autocapitalize','off');
      this.inputEl.setAttribute('spellcheck','false');

      inputRow.appendChild(this.promptEl);
      inputRow.appendChild(this.inputEl);
      this.container.appendChild(this.chromeEl);
      this.container.appendChild(this.outputEl);
      this.container.appendChild(inputRow);

      this.inputEl.addEventListener('keydown', e => this._onKey(e));
      this.inputEl.addEventListener('input',   () => this._autoResize());
    }

    _autoResize() {
      this.inputEl.style.height = 'auto';
      this.inputEl.style.height = this.inputEl.scrollHeight + 'px';
    }

    _onKey(e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this._submit(this.inputEl.value); return; }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (this.histIdx < this.history.length-1) {
          this.histIdx++;
          this.inputEl.value = this.history[this.history.length-1-this.histIdx];
          this._autoResize();
        }
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (this.histIdx > 0) { this.histIdx--; this.inputEl.value = this.history[this.history.length-1-this.histIdx]; }
        else { this.histIdx=-1; this.inputEl.value=''; }
        this._autoResize();
        return;
      }
      if (e.key === 'l' && e.ctrlKey) { e.preventDefault(); this._clear(); }
      if (e.key === 'Tab') { e.preventDefault(); this._tabComplete(); }
    }

    _tabComplete() {
      const val = this.inputEl.value;
      const parts = val.trim().split(/\s+/);
      const CMDS = ['init','add','install','remove','update','list','status','health','scan','duplicates','graph','tree','lock','search','version','help'];
      if (parts.length <= 1) {
        // Complete command name
        const prefix = (parts[0]||'').replace(/^myst\s*/,'');
        const matches = CMDS.filter(c=>c.startsWith(prefix));
        if (matches.length === 1) {
          this.inputEl.value = 'myst ' + matches[0] + ' ';
          this._autoResize();
        } else if (matches.length > 1) {
          this._line('  ' + matches.join('   '), 'dim');
        }
        return;
      }
      // Complete package name for add/remove/update
      const cmd = parts[0].replace(/^myst\s*/,'');
      if (['add','search'].includes(cmd)) {
        const prefix = parts[parts.length-1];
        const pool = Object.keys(REGISTRY).concat(GITHUB_PACKAGES);
        const matches = pool.filter(p=>p.startsWith(prefix));
        if (matches.length === 1) {
          parts[parts.length-1] = matches[0];
          this.inputEl.value = parts.join(' ') + ' ';
          this._autoResize();
        } else if (matches.length > 1) {
          this._line('  ' + matches.slice(0,8).join('   '), 'dim');
        }
      }
      if (['remove','update'].includes(cmd)) {
        const prefix = parts[parts.length-1];
        const pool = cmd==='remove' ? Object.keys(this.state.manifest) : Object.keys(this.state.installed);
        const matches = pool.filter(p=>p.startsWith(prefix));
        if (matches.length === 1) {
          parts[parts.length-1] = matches[0];
          this.inputEl.value = parts.join(' ') + ' ';
          this._autoResize();
        } else if (matches.length > 1) {
          this._line('  ' + matches.join('   '), 'dim');
        }
      }
    }

    async _submit(raw) {
      if (this.busy) return;                 // ignore input mid-fetch
      const line = raw.trim();
      this.inputEl.value = '';
      this._autoResize();
      this.histIdx = -1;

      if (line) {
        this._line(PROMPT + line, 'input');
        this.history.push(line);
      }

      // CLEAR command
      if (line === 'clear' || line === 'myst clear') { this._clear(); return; }

      // pick up any changes other terminals / the file browser made
      this.state = loadState();

      const out = (text, kind='default') => {
        if (text === '\x1b[2J') { this._clear(); return; }
        this._line(text, kind);
      };

      // commands that hit the network (add/install) run async with a spinner
      const needsNetwork = /^(?:myst\s+)?(?:add|install|i)\b/.test(line);
      if (needsNetwork) this._setBusy(true);

      try {
        await dispatch(this.state, line, out);
      } catch (e) {
        this._line('  -- internal error: ' + (e && e.message ? e.message : e), 'error');
      } finally {
        if (needsNetwork) this._setBusy(false);
      }

      // persist the (possibly mutated) state back to the shared filesystem
      saveState(this.state);
      this._updateProjLabel();
    }

    _setBusy(on) {
      this.busy = on;
      if (this.inputEl) {
        this.inputEl.disabled = on;
        this.inputEl.placeholder = on ? 'working… (fetching from GitHub)' : 'myst <command> …';
      }
      if (this.container) this.container.classList.toggle('myst-busy', on);
      if (on) this._line('  ⟳ working…', 'dim');
      else if (this.inputEl) this.inputEl.focus();
    }

    _updateProjLabel() {
      const projLabel = this.container.querySelector('#myst-proj-label');
      if (projLabel) {
        projLabel.textContent = this.state.initialized
          ? '~/' + this.state.projectName
          : 'no project';
      }
    }

    _clear() {
      this.outputEl.innerHTML = '';
    }

    _line(text, kind='default') {
      // Split on real newlines (for JSON output etc.)
      for (const chunk of text.split('\n')) {
        const div = document.createElement('div');
        div.className = 'myst-line myst-line-' + kind;
        div.textContent = chunk;
        this.outputEl.appendChild(div);
      }
      this.outputEl.scrollTop = this.outputEl.scrollHeight;
    }

    _welcome() {
      const lines = [
        '',
        '  Myst  ' + MYST_VER + '  — Sage Package Manager',
        '  ────────────────────────────────────────────────',
        '  Type myst commands to manage Sage packages.',
        '  Tab completes commands and package names.',
        '  ↑ / ↓  navigate history  ·  Ctrl+L  clear',
        '',
        '  quick start:',
        '    myst init myapp',
        '    myst add sage-numpy',
        '    myst list',
        '    myst health',
        '',
        '  myst help  for the full command reference',
        '',
      ];
      lines.forEach(l => this._line(l, 'dim'));
    }
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  function init() {
    injectCSS();
    const target = document.getElementById('myst-cli');
    if (!target) {
      const div = document.createElement('div');
      div.id = 'myst-cli';
      document.body.appendChild(div);
      new MystTerminal(div);
      return;
    }
    new MystTerminal(target);
  }

  // Expose for the playground window-manager to (re)mount on reset.
  global.MystTerminal = MystTerminal;
  global.mystInjectCSS = injectCSS;

  if (!global.__SAGE_NO_AUTOINIT) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  }

})(window);
