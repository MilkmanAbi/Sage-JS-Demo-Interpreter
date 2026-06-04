/*!
 * Sage Editor — Browser IDE
 * A self-contained macOS-style code editor for Sage.
 *
 * Attach:  <div id="sage-editor"></div>
 *          <script src="sage-editor.js"></script>
 *
 * Features: syntax highlighting · auto-indent · bracket/quote close ·
 *           smart Tab/Shift-Tab · Ctrl+/ comment toggle · Ctrl+D duplicate
 *           line · multiple example files · line numbers · status bar
 */
(function(global) {
  'use strict';

  // ── Sample files ──────────────────────────────────────────────────────────
  const FILES = {
    'hello.sage': `# Sage  ✦  hello world

proc greet(name: str) -> str:
    return "hello, " + name + " ✦"

let names = ["sage", "world", "myst"]

for name in names:
    println(greet(name))
`,

    'fibonacci.sage': `# infinite fibonacci generator

proc fibonacci():
    var a = 0
    var b = 1
    while true:
        yield a
        let next = a + b
        a = b
        b = next

let fib = fibonacci()

println("first 15 fibonacci numbers:")

var out = ""
for i in range(0, 15):
    out = out + str(next(fib)) + " "
println(out)
`,

    'structs.sage': `# Vec2 struct with impl

struct Vec2:
    x: float
    y: float

impl Vec2:
    proc length(self) -> float:
        return sqrt(self.x * self.x + self.y * self.y)

    proc scale(self, factor: float) -> Vec2:
        return Vec2(self.x * factor, self.y * factor)

    proc add(self, other: Vec2) -> Vec2:
        return Vec2(self.x + other.x, self.y + other.y)

    proc to_str(self) -> str:
        return "(" + str(self.x) + ", " + str(self.y) + ")"

let a = Vec2(3.0, 4.0)
let b = Vec2(1.0, 2.0)

println("a = " + a.to_str())
println("|a| = " + str(a.length()))
println("a * 2 = " + a.scale(2.0).to_str())
println("a + b = " + a.add(b).to_str())
`,

    'patterns.sage': `# ADT enums + pattern matching

enum Result:
    Ok(value: int)
    Err(msg: str)

proc safe_div(a: int, b: int) -> Result:
    if b == 0:
        return Result.Err("division by zero")
    return Result.Ok(a // b)

let cases = [[10, 2], [7, 0], [100, 4], [42, 6]]

for pair in cases:
    let r = safe_div(pair[0], pair[1])
    match r:
        case Result.Ok(value):
            println(str(pair[0]) + " / " + str(pair[1]) + " = " + str(value))
        case Result.Err(msg):
            println("error: " + msg)
`,

    'classes.sage': `# class inheritance

class Shape:
    proc init(self, color: str):
        self.color = color

    proc area(self) -> float:
        return 0.0

    proc describe(self) -> str:
        return self.color + " shape  area=" + str(self.area())


class Circle(Shape):
    proc init(self, color: str, radius: float):
        super(color)
        self.radius = radius

    proc area(self) -> float:
        return 3.14159 * self.radius * self.radius


class Rect(Shape):
    proc init(self, color: str, w: float, h: float):
        super(color)
        self.w = w
        self.h = h

    proc area(self) -> float:
        return self.w * self.h


let shapes = [Circle("red", 5.0), Rect("blue", 4.0, 6.0), Circle("green", 2.5)]

for s in shapes:
    println(s.describe())
`,
  };

  // ── Syntax highlighter ────────────────────────────────────────────────────
  const KEYWORDS = new Set([
    'let','var','proc','if','elif','else','while','for','in','return',
    'import','class','struct','impl','enum','match','case','try','catch',
    'raise','defer','yield','and','or','not','break','continue','super','pass',
  ]);
  const TYPE_KWS = new Set(['int','str','float','bool']);
  const LITERALS = new Set(['true','false','None']);
  const BUILTINS = new Set([
    'println','print','len','range','sorted','reversed','enumerate','zip',
    'map','filter','reduce','any','all','sum','abs','max','min','round',
    'floor','ceil','sqrt','pow','str','int','float','bool','type','next',
    'gc_disable','gc_enable','gc_collect',
    'mem_alloc','mem_free','mem_read','mem_write',
  ]);

  function escHtml(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function highlight(code) {
    let out = '';
    let i   = 0;
    const n = code.length;

    // track context for better proc/class name detection
    let lastKw = '';

    function span(cls, txt) { return `<span class="st-${cls}">${txt}</span>`; }

    while (i < n) {
      const c = code[i];

      // ── comment ─────────────────────────────────────────────────────────
      if (c === '#') {
        let j = i;
        while (j < n && code[j] !== '\n') j++;
        out += span('comment', escHtml(code.slice(i, j)));
        i = j;
        continue;
      }

      // ── decorator / @tag ─────────────────────────────────────────────────
      if (c === '@') {
        let j = i + 1;
        while (j < n && /[a-zA-Z0-9_]/.test(code[j])) j++;
        out += span('decorator', escHtml(code.slice(i, j)));
        i = j;
        continue;
      }

      // ── string ───────────────────────────────────────────────────────────
      if (c === '"' || c === "'") {
        let j = i + 1;
        while (j < n) {
          if (code[j] === '\\') { j += 2; continue; }
          if (code[j] === c)    { j++;    break; }
          j++;
        }
        out += span('string', escHtml(code.slice(i, j)));
        i = j;
        continue;
      }

      // ── number ───────────────────────────────────────────────────────────
      if (/[0-9]/.test(c) || (c === '0' && i+1<n && (code[i+1]==='x'||code[i+1]==='b'))) {
        let j = i;
        if (c==='0' && i+1<n && (code[i+1]==='x'||code[i+1]==='X')) {
          j+=2; while(j<n&&/[0-9a-fA-F_]/.test(code[j])) j++;
        } else if (c==='0' && i+1<n && (code[i+1]==='b'||code[i+1]==='B')) {
          j+=2; while(j<n&&/[01_]/.test(code[j])) j++;
        } else {
          while(j<n&&/[0-9_]/.test(code[j])) j++;
          if(j<n&&code[j]==='.'&&j+1<n&&/[0-9]/.test(code[j+1])) {
            j++;
            while(j<n&&/[0-9_]/.test(code[j])) j++;
          }
        }
        out += span('number', escHtml(code.slice(i, j)));
        i = j;
        continue;
      }

      // ── identifier / keyword ─────────────────────────────────────────────
      if (/[a-zA-Z_]/.test(c)) {
        let j = i;
        while (j < n && /[a-zA-Z0-9_]/.test(code[j])) j++;
        const word = code.slice(i, j);

        // is it a proc/class name? (word immediately follows proc/class/struct/impl/enum)
        if (lastKw && ['proc','class','struct','impl','enum'].includes(lastKw)) {
          out += span('def-name', escHtml(word));
          lastKw = '';
        } else if (KEYWORDS.has(word)) {
          out += span('keyword', escHtml(word));
          lastKw = word;
        } else if (TYPE_KWS.has(word)) {
          out += span('type', escHtml(word));
          lastKw = '';
        } else if (LITERALS.has(word)) {
          out += span('literal', escHtml(word));
          lastKw = '';
        } else if (BUILTINS.has(word)) {
          out += span('builtin', escHtml(word));
          lastKw = '';
        } else if (word === 'self') {
          out += span('self', escHtml(word));
          lastKw = '';
        } else {
          // check if next non-space is '(' → function call
          let k = j;
          while (k < n && code[k] === ' ') k++;
          if (k < n && code[k] === '(') {
            out += span('call', escHtml(word));
          } else {
            out += span('ident', escHtml(word));
          }
          lastKw = '';
        }
        i = j;
        continue;
      }

      // ── operators & punctuation ──────────────────────────────────────────
      if ('+-*/%=<>!&|^~?'.includes(c)) {
        let j = i;
        const two = code.slice(i, i+2);
        if (['==','!=','<=','>=','->','??','**','//','+=','-=','*=','/='].includes(two)) {
          out += span('operator', escHtml(two));
          i += 2;
        } else {
          out += span('operator', escHtml(c));
          i++;
        }
        lastKw = '';
        continue;
      }

      if ('()[]{},:'.includes(c)) {
        out += span('punct', escHtml(c));
        lastKw = '';
        i++;
        continue;
      }

      if (c === '.') { out += span('punct', '.'); i++; continue; }

      // whitespace and other characters pass through uncoloured
      if (c === '\n') { lastKw = ''; }
      out += escHtml(c);
      i++;
    }
    return out;
  }

  // ── CSS ───────────────────────────────────────────────────────────────────
  function injectCSS() {
    const css = `
    /* ── reset & host ─────────────────────────────────────────────────── */
    .se-host {
      --bg:         #14111f;
      --bg-editor:  #16131f;
      --bg-chrome:  #1e1a2e;
      --bg-tab:     #1a1728;
      --bg-tab-act: #16131f;
      --bg-gutter:  #13101c;
      --bg-toolbar: #1a1628;
      --bg-status:  #12101b;
      --border:     #2a2240;
      --border-dim: #1e1a30;
      --text:       #d8d0f0;
      --text-dim:   #5a5070;
      --text-soft:  #8878a8;
      --accent:     #a068d8;
      --accent-dim: #7848b0;
      --sel:        rgba(160,104,216,0.22);
      --cur-line:   rgba(255,255,255,0.025);
      --dot-r:      #ff5f57;
      --dot-y:      #febc2e;
      --dot-g:      #28c840;

      font-family: 'JetBrains Mono','Fira Code','Cascadia Code','Consolas',monospace;
      font-size: 13px;
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      width: 100%;
      max-width: 900px;
      margin: 0 auto;
      box-shadow: 0 20px 60px rgba(0,0,0,0.55), 0 2px 4px rgba(0,0,0,0.4);
      user-select: none;
    }

    /* ── chrome bar ───────────────────────────────────────────────────── */
    .se-chrome {
      background: var(--bg-chrome);
      padding: 11px 14px 10px;
      display: flex;
      align-items: center;
      gap: 7px;
      border-bottom: 1px solid var(--border-dim);
      flex-shrink: 0;
    }
    .se-dot { width:12px; height:12px; border-radius:50%; cursor:default; flex-shrink:0; }
    .se-dot-r { background:var(--dot-r); }
    .se-dot-y { background:var(--dot-y); }
    .se-dot-g { background:var(--dot-g); }
    .se-chrome-title {
      flex:1; text-align:center; font-size:12px; color:var(--text-dim);
      letter-spacing:.04em; pointer-events:none;
    }
    .se-chrome-badge {
      font-size:10px; color:var(--text-soft);
      background: rgba(160,104,216,0.12);
      border: 1px solid rgba(160,104,216,0.2);
      border-radius:4px; padding:1px 7px; letter-spacing:.04em;
    }

    /* ── tabs ─────────────────────────────────────────────────────────── */
    .se-tabs {
      background: var(--bg-tab);
      display: flex;
      align-items: stretch;
      border-bottom: 1px solid var(--border-dim);
      overflow-x: auto;
      flex-shrink: 0;
      scrollbar-width: none;
    }
    .se-tabs::-webkit-scrollbar { display:none; }
    .se-tab {
      padding: 7px 16px 7px;
      font-size: 12px;
      color: var(--text-dim);
      cursor: pointer;
      border-right: 1px solid var(--border-dim);
      white-space: nowrap;
      display: flex; align-items: center; gap:7px;
      transition: color .15s, background .15s;
      position: relative;
    }
    .se-tab:hover { color: var(--text-soft); background: rgba(255,255,255,.02); }
    .se-tab.active {
      color: var(--text);
      background: var(--bg-tab-act);
    }
    .se-tab.active::after {
      content: '';
      position: absolute; bottom: 0; left: 0; right: 0; height: 2px;
      background: var(--accent);
      border-radius: 2px 2px 0 0;
    }
    .se-tab-dot { width:6px; height:6px; border-radius:50%; background:var(--text-dim); opacity:.5; }
    .se-tab.active .se-tab-dot { background:var(--accent); opacity:1; }

    /* ── toolbar ──────────────────────────────────────────────────────── */
    .se-toolbar {
      background: var(--bg-toolbar);
      border-bottom: 1px solid var(--border-dim);
      padding: 5px 14px;
      display: flex;
      align-items: center;
      gap: 10px;
      flex-shrink: 0;
    }
    .se-toolbar-path {
      font-size: 11px;
      color: var(--text-dim);
      display: flex; align-items: center; gap: 5px;
    }
    .se-toolbar-path span { color:var(--text-soft); }
    .se-toolbar-spacer { flex:1; }
    .se-btn {
      font-family: inherit;
      font-size: 11px;
      padding: 3px 12px;
      border-radius: 5px;
      border: 1px solid var(--border);
      background: rgba(160,104,216,0.08);
      color: var(--text-soft);
      cursor: pointer;
      display: flex; align-items: center; gap: 5px;
      transition: all .15s;
      letter-spacing:.03em;
    }
    .se-btn:hover { background:rgba(160,104,216,0.2); color:var(--text); border-color:var(--accent-dim); }
    .se-btn-run { background:rgba(160,104,216,0.18); color:#c8a0f0; border-color:rgba(160,104,216,0.35); }
    .se-btn-run:hover { background:rgba(160,104,216,0.35); color:#e0c8ff; }
    .se-kbd {
      font-size:9px; padding:1px 5px; border-radius:3px;
      background:rgba(255,255,255,.05); border:1px solid var(--border);
      color:var(--text-dim);
    }

    /* ── editor body ──────────────────────────────────────────────────── */
    .se-body {
      flex: 1;
      display: flex;
      overflow: hidden;
      min-height: 320px;
      max-height: 520px;
    }

    /* gutter (line numbers) */
    .se-gutter {
      background: var(--bg-gutter);
      border-right: 1px solid var(--border-dim);
      padding: 14px 0;
      overflow: hidden;
      flex-shrink: 0;
      width: 52px;
      text-align: right;
      color: var(--text-dim);
      font-size: 12px;
      line-height: 1.65;
      letter-spacing:0;
      pointer-events: none;
      user-select: none;
    }
    .se-gutter-inner { padding: 0 12px 0 4px; }
    .se-gutter-line { display:block; }
    .se-gutter-line.cur { color:var(--text-soft); }

    /* code area */
    .se-code-wrap {
      flex: 1;
      overflow: auto;
      position: relative;
      background: var(--bg-editor);
    }
    .se-code-wrap::-webkit-scrollbar { width:8px; height:8px; }
    .se-code-wrap::-webkit-scrollbar-track { background:transparent; }
    .se-code-wrap::-webkit-scrollbar-thumb { background:var(--border); border-radius:4px; }

    /* highlight layer + textarea share identical metrics */
    .se-highlight, .se-textarea {
      position: absolute;
      top: 0; left: 0;
      padding: 14px 18px 80px;
      margin: 0;
      font-family: 'JetBrains Mono','Fira Code','Cascadia Code','Consolas',monospace;
      font-size: 13px;
      line-height: 1.65;
      tab-size: 4;
      white-space: pre;
      word-wrap: normal;
      letter-spacing: 0;
      box-sizing: border-box;
      min-width: 100%;
    }
    .se-highlight {
      color: var(--text);
      z-index: 1;
      pointer-events: none;
      border: none; outline: none;
      background: transparent;
    }
    .se-textarea {
      color: transparent;
      caret-color: #c8a0f0;
      background: transparent;
      z-index: 2;
      border: none;
      outline: none;
      resize: none;
      overflow: hidden;
      -webkit-font-smoothing: antialiased;
    }
    .se-textarea::selection { background: var(--sel); }
    .se-textarea::-moz-selection { background: var(--sel); }

    /* current-line highlight */
    .se-curline {
      position: absolute;
      left: 0; right: 0;
      pointer-events: none;
      z-index: 0;
      background: var(--cur-line);
    }

    /* ── status bar ───────────────────────────────────────────────────── */
    .se-status {
      background: var(--bg-status);
      border-top: 1px solid var(--border-dim);
      padding: 4px 14px;
      display: flex;
      align-items: center;
      gap: 16px;
      font-size: 11px;
      color: var(--text-dim);
      flex-shrink: 0;
    }
    .se-status-item { display:flex; align-items:center; gap:4px; }
    .se-status-item.accent { color:var(--accent); }
    .se-status-spacer { flex:1; }
    .se-status-dot { width:5px; height:5px; border-radius:50%; background:var(--accent); opacity:.7; }

    /* ── syntax token colours ─────────────────────────────────────────── */
    .st-keyword  { color:#c792ea; font-weight:500; }
    .st-type     { color:#80cbc4; }
    .st-builtin  { color:#82aaff; }
    .st-literal  { color:#f78c6c; }
    .st-string   { color:#c3e88d; }
    .st-number   { color:#f78c6c; }
    .st-comment  { color:#475569; font-style:italic; }
    .st-operator { color:#89ddff; }
    .st-punct    { color:#89ddff; opacity:.7; }
    .st-def-name { color:#ffcb6b; }
    .st-call     { color:#82aaff; }
    .st-self     { color:#f07178; font-style:italic; }
    .st-decorator{ color:#c792ea; }
    .st-ident    { color:#d8d0f0; }

    /* ── output panel ─────────────────────────────────────────────────── */
    .se-output {
      background: var(--bg);
      border-top: 1px solid var(--border-dim);
      max-height: 0;
      overflow: hidden;
      transition: max-height .25s ease;
      flex-shrink: 0;
    }
    .se-output.open { max-height: 160px; }
    .se-output-inner {
      padding: 10px 18px;
      font-size: 12px;
      line-height: 1.7;
      color: #90c878;
      overflow-y: auto;
      max-height: 160px;
    }
    .se-output-inner::-webkit-scrollbar { width:5px; }
    .se-output-inner::-webkit-scrollbar-thumb { background:var(--border); border-radius:4px; }
    .se-output-err  { color:#f08080; }
    .se-output-dim  { color:var(--text-dim); }
    .se-output-head { color:var(--text-soft); font-size:11px; margin-bottom:4px; display:block; }
    `;
    const tag = document.createElement('style');
    tag.textContent = css;
    document.head.appendChild(tag);
  }

  // ── Editor ────────────────────────────────────────────────────────────────
  class SageEditor {
    constructor(container) {
      this.container   = container;
      this.currentFile = Object.keys(FILES)[0];
      this.fileContents = Object.fromEntries(Object.entries(FILES).map(([k,v]) => [k, v]));
      this._build();
      this._openFile(this.currentFile);
      this.textarea.focus();
    }

    _build() {
      this.container.innerHTML  = '';
      this.container.className  = 'se-host';
      this.container.setAttribute('role','application');
      this.container.setAttribute('aria-label','Sage code editor');

      // Chrome
      const chrome = document.createElement('div');
      chrome.className = 'se-chrome';
      chrome.innerHTML = `
        <span class="se-dot se-dot-r" title="Close"></span>
        <span class="se-dot se-dot-y" title="Minimise"></span>
        <span class="se-dot se-dot-g" title="Full screen"></span>
        <span class="se-chrome-title" id="se-file-title">${this.currentFile}</span>
        <span class="se-chrome-badge">Sage</span>
      `;

      // Tabs
      const tabs = document.createElement('div');
      tabs.className = 'se-tabs';
      tabs.id = 'se-tabs';
      Object.keys(FILES).forEach(name => {
        const tab = document.createElement('div');
        tab.className = 'se-tab';
        tab.dataset.file = name;
        tab.innerHTML = `<span class="se-tab-dot"></span>${name}`;
        tab.addEventListener('click', () => this._openFile(name));
        tabs.appendChild(tab);
      });

      // Toolbar
      const toolbar = document.createElement('div');
      toolbar.className = 'se-toolbar';
      toolbar.innerHTML = `
        <span class="se-toolbar-path">
          <span style="opacity:.5">~/my-project</span>
          <span style="opacity:.3">/</span>
          <span id="se-path-file">${this.currentFile}</span>
        </span>
        <span class="se-toolbar-spacer"></span>
        <button class="se-btn" id="se-btn-fmt" title="Format (Shift+Alt+F)">fmt</button>
        <button class="se-btn se-btn-run" id="se-btn-run">▶&nbsp;run <span class="se-kbd">⌘↵</span></button>
      `;

      // Body: gutter + code
      const body = document.createElement('div');
      body.className = 'se-body';

      this.gutterEl = document.createElement('div');
      this.gutterEl.className = 'se-gutter';
      this.gutterInner = document.createElement('div');
      this.gutterInner.className = 'se-gutter-inner';
      this.gutterEl.appendChild(this.gutterInner);

      const codeWrap = document.createElement('div');
      codeWrap.className = 'se-code-wrap';
      codeWrap.id = 'se-code-wrap';

      this.curlineEl = document.createElement('div');
      this.curlineEl.className = 'se-curline';

      this.highlightEl = document.createElement('pre');
      this.highlightEl.className = 'se-highlight';
      this.highlightEl.setAttribute('aria-hidden','true');

      this.textarea = document.createElement('textarea');
      this.textarea.className = 'se-textarea';
      this.textarea.setAttribute('autocomplete','off');
      this.textarea.setAttribute('autocorrect','off');
      this.textarea.setAttribute('autocapitalize','off');
      this.textarea.setAttribute('spellcheck','false');
      this.textarea.setAttribute('aria-label','Sage code editor. Use Tab for 4 spaces.');

      codeWrap.appendChild(this.curlineEl);
      codeWrap.appendChild(this.highlightEl);
      codeWrap.appendChild(this.textarea);
      body.appendChild(this.gutterEl);
      body.appendChild(codeWrap);

      // Output panel
      this.outputEl = document.createElement('div');
      this.outputEl.className = 'se-output';
      this.outputInner = document.createElement('div');
      this.outputInner.className = 'se-output-inner';
      this.outputEl.appendChild(this.outputInner);

      // Status bar
      const status = document.createElement('div');
      status.className = 'se-status';
      status.innerHTML = `
        <span class="se-status-item"><span class="se-status-dot"></span> Sage</span>
        <span class="se-status-item" id="se-stat-pos">Ln 1, Col 1</span>
        <span class="se-status-spacer"></span>
        <span class="se-status-item" id="se-stat-lines">— lines</span>
        <span class="se-status-item">UTF-8</span>
        <span class="se-status-item" id="se-stat-indent">spaces: 4</span>
      `;

      this.container.appendChild(chrome);
      this.container.appendChild(tabs);
      this.container.appendChild(toolbar);
      this.container.appendChild(body);
      this.container.appendChild(this.outputEl);
      this.container.appendChild(status);

      // Stash refs
      this.titleEl   = document.getElementById('se-file-title');
      this.pathFile  = document.getElementById('se-path-file');
      this.statPos   = document.getElementById('se-stat-pos');
      this.statLines = document.getElementById('se-stat-lines');
      this.codeWrap  = codeWrap;

      // Events
      this.textarea.addEventListener('input',    () => this._onInput());
      this.textarea.addEventListener('keydown',  e => this._onKeyDown(e));
      this.textarea.addEventListener('click',    () => this._updateStatus());
      this.textarea.addEventListener('keyup',    () => this._updateStatus());
      this.textarea.addEventListener('scroll',   () => this._syncScroll());
      codeWrap.addEventListener('scroll',        () => this._syncGutterScroll());

      document.getElementById('se-btn-run').addEventListener('click', () => this._run());
      document.getElementById('se-btn-fmt').addEventListener('click', () => this._fmt());

      // sync textarea scroll with wrapper
      this.textarea.addEventListener('scroll', () => {
        codeWrap.scrollTop  = this.textarea.scrollTop;
        codeWrap.scrollLeft = this.textarea.scrollLeft;
      });
    }

    _openFile(name) {
      // Save current content
      if (this.textarea) this.fileContents[this.currentFile] = this.textarea.value;

      this.currentFile = name;

      // Update tabs
      document.querySelectorAll('.se-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.file === name);
      });

      // Update title
      if (this.titleEl) this.titleEl.textContent = name;
      if (this.pathFile) this.pathFile.textContent = name;

      // Load content
      this.textarea.value = this.fileContents[name] || '';

      this._render();
      this._updateStatus();
      this.textarea.setSelectionRange(0,0);
      this.textarea.scrollTop = 0;
      this.codeWrap.scrollTop = 0;
      this.gutterEl.scrollTop = 0;

      // Close output panel on file switch
      this.outputEl.classList.remove('open');
    }

    _render() {
      const code = this.textarea.value;

      // Highlight
      const html = highlight(code);
      this.highlightEl.innerHTML = html + '\n\n'; // extra lines prevent height jitter

      // Resize textarea to content
      this.textarea.style.height = 'auto';
      const h = Math.max(this.highlightEl.scrollHeight, 200);
      this.textarea.style.height = h + 'px';
      this.textarea.style.width  = '100%';

      // Gutter
      const lines = code.split('\n');
      const curLine = this._cursorLine();
      let gutterHtml = '';
      for (let i = 1; i <= lines.length; i++) {
        gutterHtml += `<span class="se-gutter-line${i===curLine?' cur':''}">${i}</span>\n`;
      }
      this.gutterInner.innerHTML = gutterHtml;

      // Current-line highlight
      this._updateCurline(curLine);
    }

    _onInput() {
      this.fileContents[this.currentFile] = this.textarea.value;
      this._render();
      this._updateStatus();
    }

    _updateCurline(line) {
      const lh = 13 * 1.65; // font-size * line-height
      const pt = 14; // padding-top
      const top = pt + (line - 1) * lh;
      this.curlineEl.style.top    = top + 'px';
      this.curlineEl.style.height = lh + 'px';
    }

    _cursorLine() {
      const pos  = this.textarea.selectionStart || 0;
      const text = this.textarea.value.slice(0, pos);
      return (text.match(/\n/g) || []).length + 1;
    }

    _cursorCol() {
      const pos  = this.textarea.selectionStart || 0;
      const text = this.textarea.value.slice(0, pos);
      const nl   = text.lastIndexOf('\n');
      return pos - nl;
    }

    _updateStatus() {
      const ln  = this._cursorLine();
      const col = this._cursorCol();
      const tot = this.textarea.value.split('\n').length;
      if (this.statPos)   this.statPos.textContent   = `Ln ${ln}, Col ${col}`;
      if (this.statLines) this.statLines.textContent = `${tot} line${tot!==1?'s':''}`;
      this._render();
    }

    _syncScroll() {
      this.highlightEl.scrollTop  = this.textarea.scrollTop;
      this.highlightEl.scrollLeft = this.textarea.scrollLeft;
      this.gutterEl.scrollTop     = this.textarea.scrollTop;
    }

    _syncGutterScroll() {
      this.gutterEl.scrollTop = this.codeWrap.scrollTop;
    }

    // ── Keyboard handling ────────────────────────────────────────────────
    _onKeyDown(e) {
      const ta  = this.textarea;
      const val = ta.value;
      const sel = ta.selectionStart;
      const end = ta.selectionEnd;

      const isCmd  = e.metaKey || e.ctrlKey;
      const isMac  = navigator.platform?.includes('Mac');

      // ── Tab / Shift-Tab ────────────────────────────────────────────────
      if (e.key === 'Tab') {
        e.preventDefault();
        if (e.shiftKey) {
          // Dedent: remove up to 4 spaces from line start
          const lineStart = val.lastIndexOf('\n', sel-1) + 1;
          const spaces = val.slice(lineStart).match(/^ {1,4}/)?.[0] || '';
          if (spaces) {
            this._splice(lineStart, lineStart + spaces.length, '');
            ta.selectionStart = ta.selectionEnd = sel - spaces.length;
          }
        } else if (sel !== end) {
          // Multi-line indent
          const lineStart = val.lastIndexOf('\n', sel-1) + 1;
          const before    = val.slice(0, lineStart);
          const selected  = val.slice(lineStart, end);
          const after     = val.slice(end);
          const indented  = selected.replace(/^/gm, '    ');
          ta.value = before + indented + after;
          ta.selectionStart = lineStart;
          ta.selectionEnd   = lineStart + indented.length;
        } else {
          this._insert('    ');
        }
        this._onInput();
        return;
      }

      // ── Enter: smart auto-indent ───────────────────────────────────────
      if (e.key === 'Enter') {
        e.preventDefault();
        const lineStart  = val.lastIndexOf('\n', sel-1) + 1;
        const lineText   = val.slice(lineStart, sel);
        const indent     = lineText.match(/^( *)/)[1];
        const openBlock  = /:\s*(#.*)?$/.test(lineText.trimEnd());
        const extraIndent = openBlock ? '    ' : '';
        this._insert('\n' + indent + extraIndent);
        this._onInput();
        return;
      }

      // ── Ctrl/Cmd+/ : toggle line comment ──────────────────────────────
      if (e.key === '/' && isCmd) {
        e.preventDefault();
        const lineStart = val.lastIndexOf('\n', sel-1) + 1;
        const lineEnd   = val.indexOf('\n', sel);
        const line      = val.slice(lineStart, lineEnd === -1 ? undefined : lineEnd);
        if (/^( *)#/.test(line)) {
          // uncomment
          const uncommented = line.replace(/^( *)# ?/, '$1');
          this._splice(lineStart, lineEnd === -1 ? val.length : lineEnd, uncommented);
          ta.selectionStart = ta.selectionEnd = sel - (line.length - uncommented.length);
        } else {
          const commented = line.replace(/^( *)/, '$1# ');
          this._splice(lineStart, lineEnd === -1 ? val.length : lineEnd, commented);
          ta.selectionStart = ta.selectionEnd = sel + 2;
        }
        this._onInput();
        return;
      }

      // ── Ctrl/Cmd+D : duplicate line ────────────────────────────────────
      if (e.key === 'd' && isCmd && !e.shiftKey) {
        e.preventDefault();
        const lineStart = val.lastIndexOf('\n', sel-1) + 1;
        const lineEnd   = val.indexOf('\n', sel);
        const line      = val.slice(lineStart, lineEnd === -1 ? val.length : lineEnd);
        const nl        = lineEnd === -1 ? '' : '\n';
        const insertAt  = lineEnd === -1 ? val.length : lineEnd;
        this._splice(insertAt, insertAt, nl + line);
        ta.selectionStart = ta.selectionEnd = sel + line.length + 1;
        this._onInput();
        return;
      }

      // ── Ctrl/Cmd+Enter : run ──────────────────────────────────────────
      if (e.key === 'Enter' && isCmd) {
        e.preventDefault();
        this._run();
        return;
      }

      // ── Cmd+[ / Cmd+] : indent/dedent (VS Code style) ─────────────────
      if (e.key === ']' && isCmd) { e.preventDefault(); const ls=val.lastIndexOf('\n',sel-1)+1; this._splice(ls,ls,'    '); ta.selectionStart=ta.selectionEnd=sel+4; this._onInput(); return; }
      if (e.key === '[' && isCmd) { e.preventDefault(); const ls=val.lastIndexOf('\n',sel-1)+1; const sp=val.slice(ls).match(/^ {1,4}/)?.[0]||''; if(sp){this._splice(ls,ls+sp.length,'');ta.selectionStart=ta.selectionEnd=sel-sp.length;} this._onInput(); return; }

      // ── Auto-close pairs ──────────────────────────────────────────────
      const PAIRS = { '(':')', '[':']', '{':'}' };
      const PAIRS_CLOSE = new Set([')', ']', '}']);
      const QUOTES = ['"', "'"];

      if (PAIRS[e.key] && sel === end) {
        // Check it's not escaped
        e.preventDefault();
        this._insert(e.key + PAIRS[e.key]);
        ta.selectionStart = ta.selectionEnd = sel + 1;
        this._onInput();
        return;
      }
      if (PAIRS_CLOSE.has(e.key) && sel === end) {
        // Skip over existing close bracket
        if (val[sel] === e.key) {
          e.preventDefault();
          ta.selectionStart = ta.selectionEnd = sel + 1;
          return;
        }
      }
      if (QUOTES.includes(e.key) && sel === end) {
        const prev = val[sel-1];
        const next = val[sel];
        // Skip over closing quote
        if (next === e.key) {
          e.preventDefault();
          ta.selectionStart = ta.selectionEnd = sel + 1;
          return;
        }
        // Only auto-close if not already inside a string (simple heuristic)
        if (prev !== '\\') {
          e.preventDefault();
          this._insert(e.key + e.key);
          ta.selectionStart = ta.selectionEnd = sel + 1;
          this._onInput();
          return;
        }
      }

      // ── Backspace: remove paired bracket/quote ───────────────────────
      if (e.key === 'Backspace' && sel === end && sel > 0) {
        const prev = val[sel-1];
        const next = val[sel];
        if ((PAIRS[prev] === next) || (QUOTES.includes(prev) && next === prev)) {
          e.preventDefault();
          this._splice(sel-1, sel+1, '');
          ta.selectionStart = ta.selectionEnd = sel-1;
          this._onInput();
          return;
        }
      }

      // ── Home key: smart home ──────────────────────────────────────────
      if (e.key === 'Home' && !isCmd) {
        e.preventDefault();
        const lineStart = val.lastIndexOf('\n', sel-1) + 1;
        const lineText  = val.slice(lineStart, sel);
        const firstNonWs = lineStart + (lineText.match(/^ */)[0].length);
        ta.selectionStart = ta.selectionEnd = sel === firstNonWs ? lineStart : firstNonWs;
        this._updateStatus();
        return;
      }
    }

    // ── Helpers ──────────────────────────────────────────────────────────
    _insert(text) {
      const ta  = this.textarea;
      const sel = ta.selectionStart;
      const end = ta.selectionEnd;
      ta.value  = ta.value.slice(0, sel) + text + ta.value.slice(end);
      ta.selectionStart = ta.selectionEnd = sel + text.length;
    }

    _splice(from, to, text) {
      const ta = this.textarea;
      ta.value = ta.value.slice(0, from) + text + ta.value.slice(to);
    }

    // ── Run (uses Sage evaluator if available) ──────────────────────────
    _run() {
      const code = this.textarea.value;
      this.outputEl.classList.add('open');
      this.outputInner.innerHTML = '';

      const add = (text, cls='') => {
        const div = document.createElement('div');
        if (cls) div.className = cls;
        div.textContent = text;
        this.outputInner.appendChild(div);
        this.outputInner.scrollTop = this.outputInner.scrollHeight;
      };

      add('running ' + this.currentFile + '…', 'se-output-dim se-output-head');

      // Try to use sage-repl evaluator if loaded
      if (global.SageEvaluator) {
        const ev = new global.SageEvaluator(txt => add(txt));
        try {
          ev.evalSource(code);
          add('─── done', 'se-output-dim');
        } catch(e) {
          const msg = (e && e.value !== undefined) ? String(e.value) : (e?.message || String(e));
          add('error: ' + msg, 'se-output-err');
        }
        return;
      }

      // Fallback: inline mini evaluator (runs basic expressions only)
      try {
        const outputs = [];
        // Very lightweight execution via Function() — just runs println-level code
        // For full execution: load sage-repl.js alongside this file
        const safeRun = new Function('println','print','str','range','len','sqrt','abs','max','min',
          code
            .replace(/\bprintln\b/g, 'println')
            .replace(/\btrue\b/g, 'true')
            .replace(/\bfalse\b/g, 'false')
            .replace(/\bNone\b/g, 'null')
        );
        // Can't safely eval Sage via JS Function — show hint instead
        throw new Error('connect sage-repl.js for full execution');
      } catch(e) {
        if (e.message === 'connect sage-repl.js for full execution') {
          add('load sage-repl.js alongside this file for live execution', 'se-output-dim');
          add('example: <script src="sage-repl.js"></script> before this file', 'se-output-dim');
        } else {
          add('error: ' + e.message, 'se-output-err');
        }
      }
    }

    // ── Format (basic indent normalisation) ─────────────────────────────
    _fmt() {
      const lines = this.textarea.value.split('\n');
      let depth = 0;
      const out = lines.map(line => {
        const stripped = line.trimStart();
        if (!stripped) return '';
        // Detect dedent keywords
        if (/^(else|elif|except|finally|catch)\b/.test(stripped)) depth = Math.max(0, depth-1);
        const indented = '    '.repeat(depth) + stripped;
        // Increase depth after block openers
        if (/:\s*(#.*)?$/.test(stripped.trimEnd()) && !/^#/.test(stripped)) depth++;
        // Decrease after pass/return at same level
        if (/^(return|raise|break|continue|pass)\b/.test(stripped)) depth = Math.max(0, depth);
        return indented;
      });
      this.textarea.value = out.join('\n');
      this.fileContents[this.currentFile] = this.textarea.value;
      this._render();
      this._updateStatus();
    }
  }

  // ── Expose evaluator for integration ─────────────────────────────────────
  // If sage-repl.js also exposes SageEvaluator, this editor will use it for ▶ run.
  // You can expose it by adding at the end of sage-repl.js:
  //   global.SageEvaluator = Evaluator;

  // ── Init ──────────────────────────────────────────────────────────────────
  function init() {
    injectCSS();
    let target = document.getElementById('sage-editor');
    if (!target) {
      target = document.createElement('div');
      target.id = 'sage-editor';
      document.body.appendChild(target);
    }
    new SageEditor(target);
  }

  // Expose for the playground window-manager to (re)mount on reset.
  global.SageEditor = SageEditor;
  global.sageEditorInjectCSS = injectCSS;

  if (!global.__SAGE_NO_AUTOINIT) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  }

})(window);
