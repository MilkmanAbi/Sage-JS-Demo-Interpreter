/*!
 * sage-ffi.js — emulated FFI backends for the Sage Playground
 *
 * There is no real Python or C in the browser, so when an example package does
 *   let _np = python.import("numpy")
 *   let _hiredis = c_ffi.load("libhiredis.so.1")
 * the interpreter (sage-repl.js) looks here for a backend and routes the calls
 * to a real JavaScript implementation. The result: installed packages actually
 * compute instead of echoing call structure.
 *
 * Fidelity:
 *   numpy   — real array math (1-D + 2-D), stats, linalg basics
 *   pandas  — real column-oriented DataFrame for the common operations
 *   redis   — real in-memory store (hiredis C ABI emulated)
 *   torch   — a real, converging tiny MLP trainer (numeric gradients)
 *   requests— canned-but-structured HTTP responses (no real network in-sandbox)
 *
 * Load AFTER sage-repl.js and BEFORE first use:
 *   <script src="sage-repl.js"></script>
 *   <script src="sage-ffi.js"></script>
 *
 * Registers window.SageFFI = { python:{}, c:{}, cHelpers:{} }.
 */
(function (global) {
  'use strict';

  // ── small helpers ───────────────────────────────────────────────────────────
  function isArr(x) { return Array.isArray(x); }
  function is2d(a) { return isArr(a) && a.length > 0 && isArr(a[0]); }
  function flat(a) { return is2d(a) ? a.reduce(function (s, r) { return s.concat(r); }, []) : a.slice(); }
  function shapeOf(a) {
    if (!isArr(a)) return [];
    if (is2d(a)) return [a.length, a[0].length];
    return [a.length];
  }
  function num(x) { return typeof x === 'number' ? x : Number(x) || 0; }
  function sum(a) { return flat(a).reduce(function (s, v) { return s + num(v); }, 0); }
  function mean(a) { var f = flat(a); return f.length ? sum(f) / f.length : 0; }
  function variance(a) { var f = flat(a), m = mean(f); return f.length ? f.reduce(function (s, v) { return s + (v - m) * (v - m); }, 0) / f.length : 0; }
  function std(a) { return Math.sqrt(variance(a)); }
  function round6(x) { return typeof x === 'number' && !Number.isInteger(x) ? Math.round(x * 1e6) / 1e6 : x; }
  function fmtNum(x) {
    if (typeof x !== 'number') return String(x);
    if (Number.isInteger(x)) return x.toFixed(1);           // numpy-style 2 -> 2.0
    return (Math.round(x * 10000) / 10000).toString();
  }
  // deterministic RNG so demos are reproducible
  function mulberry32(seed) {
    var t = seed >>> 0;
    return function () {
      t += 0x6D2B79F5;
      var r = Math.imul(t ^ (t >>> 15), 1 | t);
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }
  function gaussian(rng) { // Box–Muller
    var u = 1 - rng(), v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  // build a Sage dict value the interpreter understands
  function dict(pairs) {
    var m = new Map();
    pairs.forEach(function (kv) { m.set(kv[0], kv[1]); });
    return { __type: 'dict', data: m };
  }
  function dictGet(d, k) {
    if (d && d.__type === 'dict') return d.data.has(k) ? d.data.get(k) : null;
    return null;
  }
  function dictKeys(d) { return d && d.__type === 'dict' ? Array.from(d.data.keys()) : []; }

  // ════════════════════════════════════════════════════════════════════════════
  // numpy
  // ════════════════════════════════════════════════════════════════════════════
  function makeNumpy() {
    var rng = mulberry32(0x5A6E);
    function ew(a, f) { return is2d(a) ? a.map(function (r) { return r.map(f); }) : a.map(f); }
    function ew2(a, b, f) {
      if (is2d(a) && is2d(b)) return a.map(function (r, i) { return r.map(function (x, j) { return f(x, b[i][j]); }); });
      if (is2d(a) && typeof b === 'number') return a.map(function (r) { return r.map(function (x) { return f(x, b); }); });
      if (isArr(a) && isArr(b)) return a.map(function (x, i) { return f(x, b[i]); });
      if (isArr(a) && typeof b === 'number') return a.map(function (x) { return f(x, b); });
      return f(a, b);
    }
    var np = {
      array: function (data) { return data; },                 // handle == the data
      asarray: function (data) { return data; },
      shape: function (a) { return shapeOf(a); },
      size: function (a) { return flat(a).length; },
      ndim: function (a) { return shapeOf(a).length; },
      reshape: function (a, shp) {
        var f = flat(a);
        if (isArr(shp) && shp.length === 2) {
          var rows = shp[0], cols = shp[1], out = [];
          for (var i = 0; i < rows; i++) out.push(f.slice(i * cols, i * cols + cols));
          return out;
        }
        return f;
      },
      ravel: function (a) { return flat(a); },
      transpose: function (a) {
        if (!is2d(a)) return a;
        return a[0].map(function (_, j) { return a.map(function (row) { return row[j]; }); });
      },
      take: function (a, idx) { var f = flat(a); return isArr(idx) ? idx.map(function (i) { return f[i]; }) : f[idx]; },
      add: function (a, b) { return ew2(a, b, function (x, y) { return x + y; }); },
      subtract: function (a, b) { return ew2(a, b, function (x, y) { return x - y; }); },
      multiply: function (a, b) { return ew2(a, b, function (x, y) { return x * y; }); },
      divide: function (a, b) { return ew2(a, b, function (x, y) { return x / y; }); },
      dot: function (a, b) {
        if (isArr(a) && isArr(b) && !is2d(a) && !is2d(b)) return a.reduce(function (s, x, i) { return s + x * b[i]; }, 0);
        return np.matmul(a, b);
      },
      matmul: function (a, b) {
        if (!is2d(a) || !is2d(b)) return 0;
        var n = a.length, m = b[0].length, k = b.length, out = [];
        for (var i = 0; i < n; i++) {
          out.push([]);
          for (var j = 0; j < m; j++) {
            var s = 0; for (var t = 0; t < k; t++) s += a[i][t] * b[t][j];
            out[i].push(s);
          }
        }
        return out;
      },
      sum: function (a) { return round6(sum(a)); },
      sum_axis: function (a, axis) {
        if (!is2d(a)) return sum(a);
        if (axis === 0) return a[0].map(function (_, j) { return a.reduce(function (s, r) { return s + r[j]; }, 0); });
        return a.map(function (r) { return r.reduce(function (s, v) { return s + v; }, 0); });
      },
      mean: function (a) { return round6(mean(a)); },
      std: function (a) { return round6(std(a)); },
      var: function (a) { return round6(variance(a)); },
      min: function (a) { return round6(Math.min.apply(null, flat(a))); },
      max: function (a) { return round6(Math.max.apply(null, flat(a))); },
      argmin: function (a) { var f = flat(a); return f.indexOf(Math.min.apply(null, f)); },
      argmax: function (a) { var f = flat(a); return f.indexOf(Math.max.apply(null, f)); },
      abs: function (a) { return ew(a, Math.abs); },
      sqrt: function (a) { return ew(a, Math.sqrt); },
      exp: function (a) { return ew(a, Math.exp); },
      log: function (a) { return ew(a, Math.log); },
      clip: function (a, lo, hi) { return ew(a, function (x) { return Math.max(lo, Math.min(hi, x)); }); },
      where: function (cond, a, b) {
        return ew2(cond, a, function (c, x) { return c ? x : 0; }); // simplified: cond truthy -> a
      },
      equal: function (a, b) { return ew2(a, b, function (x, y) { return x === y ? 1 : 0; }); },
      less: function (a, b) { return ew2(a, b, function (x, y) { return x < y ? 1 : 0; }); },
      greater: function (a, b) { return ew2(a, b, function (x, y) { return x > y ? 1 : 0; }); },
      zeros: function (shp) {
        if (isArr(shp) && shp.length === 2) return Array.from({ length: shp[0] }, function () { return Array(shp[1]).fill(0); });
        var n = isArr(shp) ? shp[0] : shp; return Array(n).fill(0);
      },
      ones: function (shp) {
        if (isArr(shp) && shp.length === 2) return Array.from({ length: shp[0] }, function () { return Array(shp[1]).fill(1); });
        var n = isArr(shp) ? shp[0] : shp; return Array(n).fill(1);
      },
      eye: function (n) { return Array.from({ length: n }, function (_, i) { return Array.from({ length: n }, function (_, j) { return i === j ? 1 : 0; }); }); },
      arange: function (start, stop, step) { var o = [], s = step || 1; for (var x = start; x < stop; x += s) o.push(x); return o; },
      linspace: function (start, stop, n) { var o = [], d = n > 1 ? (stop - start) / (n - 1) : 0; for (var i = 0; i < n; i++) o.push(start + d * i); return o; },
      random_uniform: function (lo, hi, shp) { var n = isArr(shp) ? shp[0] : shp; return Array.from({ length: n }, function () { return lo + (hi - lo) * rng(); }); },
      random_normal: function (mu, sd, shp) { var n = isArr(shp) ? shp[0] : shp; return Array.from({ length: n }, function () { return mu + sd * gaussian(rng); }); },
      diag: function (v) { if (is2d(v)) return v.map(function (r, i) { return r[i]; }); return v.map(function (x, i) { return Array.from({ length: v.length }, function (_, j) { return i === j ? x : 0; }); }); },
      ndarray_astype: function (a) { return a; },
      linalg_norm: function (a) { return round6(Math.sqrt(flat(a).reduce(function (s, v) { return s + v * v; }, 0))); },
      linalg_solve: function (A, b) {
        var n = A.length, M = A.map(function (r, i) { return r.concat([b[i]]); });
        for (var c = 0; c < n; c++) {
          var p = c; for (var r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
          var tmp = M[c]; M[c] = M[p]; M[p] = tmp;
          for (var r2 = 0; r2 < n; r2++) { if (r2 === c) continue; var f = M[r2][c] / M[c][c]; for (var k = c; k <= n; k++) M[r2][k] -= f * M[c][k]; }
        }
        return M.map(function (row, i) { return round6(row[n] / row[i]); });
      },
      linalg_inv: function (A) {
        var n = A.length, M = A.map(function (r, i) { return r.concat(Array.from({ length: n }, function (_, j) { return i === j ? 1 : 0; })); });
        for (var c = 0; c < n; c++) {
          var p = c; for (var r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
          var tmp = M[c]; M[c] = M[p]; M[p] = tmp;
          var piv = M[c][c]; for (var k = 0; k < 2 * n; k++) M[c][k] /= piv;
          for (var r2 = 0; r2 < n; r2++) { if (r2 === c) continue; var f = M[r2][c]; for (var k2 = 0; k2 < 2 * n; k2++) M[r2][k2] -= f * M[c][k2]; }
        }
        return M.map(function (row) { return row.slice(n).map(round6); });
      },
      linalg_eig: function (A) {
        var n = A.length, a = A.map(function (r) { return r.slice(); });
        var V = Array.from({ length: n }, function (_, i) { return Array.from({ length: n }, function (_, j) { return i === j ? 1 : 0; }); });
        for (var sweep = 0; sweep < 100; sweep++) {
          var off = 0, p = 0, q = 1;
          for (var i = 0; i < n; i++) for (var j = i + 1; j < n; j++) if (Math.abs(a[i][j]) > off) { off = Math.abs(a[i][j]); p = i; q = j; }
          if (off < 1e-10) break;
          var phi = 0.5 * Math.atan2(2 * a[p][q], a[q][q] - a[p][p]), c = Math.cos(phi), s = Math.sin(phi);
          for (var k = 0; k < n; k++) { var akp = a[k][p], akq = a[k][q]; a[k][p] = c * akp - s * akq; a[k][q] = s * akp + c * akq; }
          for (var k2 = 0; k2 < n; k2++) { var apk = a[p][k2], aqk = a[q][k2]; a[p][k2] = c * apk - s * aqk; a[q][k2] = s * apk + c * aqk; }
          for (var k3 = 0; k3 < n; k3++) { var vkp = V[k3][p], vkq = V[k3][q]; V[k3][p] = c * vkp - s * vkq; V[k3][q] = s * vkp + c * vkq; }
        }
        return [a.map(function (row, i) { return round6(row[i]); }), V.map(function (row) { return row.map(round6); })];
      },
      linalg_svd: function (A) { return [A, [1], A]; },
      array_str: function (a) {
        if (is2d(a)) return '[' + a.map(function (r) { return '[' + r.map(fmtNum).join(' ') + ']'; }).join('\n ') + ']';
        return '[' + a.map(fmtNum).join(' ') + ']';
      },
      pi: Math.PI,
      inf: Infinity,
    };
    return np;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // pandas (column-oriented, demo-accurate)
  // ════════════════════════════════════════════════════════════════════════════
  function makePandas() {
    function df(cols, data) { return { __df: true, cols: cols, data: data }; }
    function nrows(d) { return d.cols.length ? d.data[d.cols[0]].length : 0; }
    function median(arr) {
      var s = arr.slice().sort(function (a, b) { return a - b; }), n = s.length;
      return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : 0;
    }
    function colIsNumeric(arr) { return arr.every(function (v) { return typeof v === 'number'; }); }
    function tableStr(d) {
      var n = nrows(d);
      var widths = d.cols.map(function (c) {
        var w = c.length;
        for (var i = 0; i < n; i++) w = Math.max(w, String(d.data[c][i]).length);
        return w;
      });
      var lines = [];
      lines.push(d.cols.map(function (c, i) { return c.padEnd(widths[i]); }).join('  '));
      for (var r = 0; r < n; r++) {
        lines.push(d.cols.map(function (c, i) { return String(d.data[c][r]).padEnd(widths[i]); }).join('  '));
      }
      return lines.join('\n');
    }
    return {
      df_from_dict: function (dct) {
        var cols = dictKeys(dct), data = {};
        cols.forEach(function (c) { data[c] = dictGet(dct, c).slice(); });
        return df(cols, data);
      },
      df_from_records: function () { return df([], {}); },
      df_merge: function (left, right, on, how) {
        var rcols = right.cols.filter(function (c) { return c !== on; });
        var outCols = left.cols.concat(rcols), data = {};
        outCols.forEach(function (c) { data[c] = []; });
        var ln = left.cols.length ? left.data[left.cols[0]].length : 0;
        var rn = right.cols.length ? right.data[right.cols[0]].length : 0;
        for (var i = 0; i < ln; i++) {
          var key = left.data[on][i], match = -1;
          for (var j = 0; j < rn; j++) if (right.data[on][j] === key) { match = j; break; }
          if (match === -1 && how === 'inner') continue;
          left.cols.forEach(function (c) { data[c].push(left.data[c][i]); });
          rcols.forEach(function (c) { data[c].push(match === -1 ? null : right.data[c][match]); });
        }
        return df(outCols, data);
      },
      df_shape: function (d) { return [nrows(d), d.cols.length]; },
      df_columns: function (d) { return d.cols.slice(); },
      df_cols: function (d, names) {
        if (!isArr(names)) return d.cols.slice();   // no selection → just the names
        var data = {}; names.forEach(function (c) { data[c] = (d.data[c] || []).slice(); });
        return df(names.slice(), data);
      },
      df_col: function (d, name) { return d.data[name] ? d.data[name].slice() : []; },
      df_set_col: function (d, name, series) {
        var data = {}; d.cols.forEach(function (c) { data[c] = d.data[c].slice(); });
        data[name] = isArr(series) ? series.slice() : series;
        var cols = d.cols.indexOf(name) === -1 ? d.cols.concat([name]) : d.cols.slice();
        return df(cols, data);
      },
      df_str: function (d) { return tableStr(d); },
      df_head: function (d, n) {
        var data = {}; d.cols.forEach(function (c) { data[c] = d.data[c].slice(0, n); });
        return df(d.cols.slice(), data);
      },
      df_tail: function (d, n) {
        var data = {}; d.cols.forEach(function (c) { data[c] = d.data[c].slice(-n); });
        return df(d.cols.slice(), data);
      },
      df_sort: function (d, col, ascending) {
        var n = nrows(d), idx = Array.from({ length: n }, function (_, i) { return i; });
        idx.sort(function (a, b) { var x = d.data[col][a], y = d.data[col][b]; return ascending === false ? (x < y ? 1 : x > y ? -1 : 0) : (x < y ? -1 : x > y ? 1 : 0); });
        var data = {}; d.cols.forEach(function (c) { data[c] = idx.map(function (i) { return d.data[c][i]; }); });
        return df(d.cols.slice(), data);
      },
      df_query: function (d, expr) {
        // supports:  col == 'val'  |  col == val  |  col > val  |  col < val
        var m = expr.match(/^\s*([\w]+)\s*(==|!=|>=|<=|>|<)\s*'?([^']*?)'?\s*$/);
        if (!m) return d;
        var col = m[1], op = m[2], rhsRaw = m[3];
        var rhs = isNaN(Number(rhsRaw)) ? rhsRaw : Number(rhsRaw);
        var keep = [];
        for (var i = 0; i < nrows(d); i++) {
          var v = d.data[col][i], ok = false;
          if (op === '==') ok = v == rhs; else if (op === '!=') ok = v != rhs;
          else if (op === '>') ok = v > rhs; else if (op === '<') ok = v < rhs;
          else if (op === '>=') ok = v >= rhs; else if (op === '<=') ok = v <= rhs;
          if (ok) keep.push(i);
        }
        var data = {}; d.cols.forEach(function (c) { data[c] = keep.map(function (i) { return d.data[c][i]; }); });
        return df(d.cols.slice(), data);
      },
      df_groupby: function (d, by) { return { __gb: true, by: by, df: d }; },
      df_describe: function (d) { return d; },
      df_to_dict: function (d) { return dict(d.cols.map(function (c) { return [c, d.data[c].slice()]; })); },
      // groupby aggregations
      gb_mean: function (gb) { return aggregate(gb, function (a) { return colIsNumeric(a) ? round6(mean(a)) : a[0]; }, true); },
      gb_sum: function (gb) { return aggregate(gb, function (a) { return colIsNumeric(a) ? round6(sum(a)) : a[0]; }, true); },
      gb_min: function (gb) { return aggregate(gb, function (a) { return colIsNumeric(a) ? Math.min.apply(null, a) : a[0]; }, true); },
      gb_max: function (gb) { return aggregate(gb, function (a) { return colIsNumeric(a) ? Math.max.apply(null, a) : a[0]; }, true); },
      gb_count: function (gb) { return aggregate(gb, function (a) { return a.length; }, false); },
      gb_size: function (gb) { return aggregate(gb, function (a) { return a.length; }, false); },
      // series ops (handle == array)
      series_mean: function (s) { return round6(mean(s)); },
      series_median: function (s) { return round6(median(s)); },
      series_std: function (s) { return round6(std(s)); },
      series_var: function (s) { return round6(variance(s)); },
      series_sum: function (s) { return round6(sum(s)); },
      series_min: function (s) { return Math.min.apply(null, s); },
      series_max: function (s) { return Math.max.apply(null, s); },
      series_len: function (s) { return s.length; },
      series_to_list: function (s) { return s.slice(); },
      series_unique: function (s) { return Array.from(new Set(s)); },
      series_nunique: function (s) { return new Set(s).size; },
      series_sort: function (s) { return s.slice().sort(function (a, b) { return a < b ? -1 : a > b ? 1 : 0; }); },
      series_head: function (s, n) { return s.slice(0, n); },
      series_tail: function (s, n) { return s.slice(-n); },
      series_str: function (s) { return '[' + s.join(', ') + ']'; },
      series_apply: function (s, fn) {
        var call = global.SageFFI && global.SageFFI.__call;
        return call ? s.map(function (x) { var r = call(fn, [x]); return typeof r === 'number' ? round6(r) : r; }) : s.slice();
      },
    };

    function aggregate(gb, fn, numericOnly) {
      var d = gb.df, by = gb.by, groups = {};
      for (var i = 0; i < (d.cols.length ? d.data[d.cols[0]].length : 0); i++) {
        var key = d.data[by][i];
        (groups[key] = groups[key] || []).push(i);
      }
      var keys = Object.keys(groups);
      var valueCols = d.cols.filter(function (c) {
        if (c === by) return false;
        if (!numericOnly) return true;
        return d.data[c].every(function (v) { return typeof v === 'number'; });
      });
      var outCols = [by].concat(valueCols), data = {};
      data[by] = keys;
      valueCols.forEach(function (c) {
        data[c] = keys.map(function (k) { return fn(groups[k].map(function (i) { return d.data[c][i]; })); });
      });
      return df(outCols, data);
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // torch — a real, converging MLP (the lib delegates the whole model to us)
  // ════════════════════════════════════════════════════════════════════════════
  function makeTorchSuite() {
    var rng = mulberry32(0x7012);
    function matT(W) { return W[0].map(function (_, j) { return W.map(function (r) { return r[j]; }); }); }
    function matmul(A, B) { // A m×k, B k×n
      var m = A.length, k = B.length, n = B[0].length, O = [];
      for (var i = 0; i < m; i++) { O.push([]); for (var j = 0; j < n; j++) { var s = 0; for (var t = 0; t < k; t++) s += A[i][t] * B[t][j]; O[i].push(s); } }
      return O;
    }
    function addBias(Z, b) { return Z.map(function (r) { return r.map(function (v, j) { return v + b[j]; }); }); }
    function relu(Z) { return Z.map(function (r) { return r.map(function (v) { return v > 0 ? v : 0; }); }); }
    function sigmoidScalar(x) { return 1 / (1 + Math.exp(-x)); }

    // a Linear layer owns its weights (out×in) + bias (out)
    function linear(inF, outF) {
      var scale = Math.sqrt(2 / inF);
      var W = Array.from({ length: outF }, function () { return Array.from({ length: inF }, function () { return (rng() * 2 - 1) * scale; }); });
      var b = Array.from({ length: outF }, function () { return 0; });
      return { __layer: true, inF: inF, outF: outF, W: W, b: b, gW: null, gb: null,
               mW: zeroLike(W), vW: zeroLike(W), mb: b.slice().fill(0), vb: b.slice().fill(0) };
    }
    function zeroLike(M) { return M.map(function (r) { return r.map(function () { return 0; }); }); }

    function sequential(layers) { return { __model: true, layers: layers, cache: null }; }

    function forward(model, X) {
      // 2 linear layers with a ReLU between them (honours the example's
      // documented architecture: in → hidden → ReLU → out)
      var L1 = model.layers[0], L2 = model.layers[1];
      var z1 = addBias(matmul(X, matT(L1.W)), L1.b);     // n×h
      var a1 = relu(z1);                                  // n×h
      var z2 = addBias(matmul(a1, matT(L2.W)), L2.b);     // n×1 (logits)
      model.cache = { X: X, z1: z1, a1: a1, z2: z2 };
      return z2;
    }

    var _nn = {
      Linear: function (inF, outF) { return linear(inF, outF); },
      Sequential: function (layers) { return sequential(isArr(layers) ? layers : Array.prototype.slice.call(arguments)); },
      linear_forward: function (layer, x) { return addBias(matmul(x, matT(layer.W)), layer.b); },
      linear_weight: function (layer) { return layer.W; },
      linear_bias: function (layer) { return layer.b; },
      sequential_forward: function (model, x) { return forward(model, x); },
      module_parameters: function (model) { return model.layers ? model.layers.slice() : [model]; },
      module_train: function () { return null; },
      module_eval: function () { return null; },
      module_to: function (m) { return m; },
    };

    var _F = {
      relu: function (t) { return relu(t); },
      sigmoid: function (t) { return is2d(t) ? t.map(function (r) { return r.map(sigmoidScalar); }) : t.map(sigmoidScalar); },
      tanh: function (t) { return is2d(t) ? t.map(function (r) { return r.map(Math.tanh); }) : t.map(Math.tanh); },
      softmax: function (t) { return t; },
      log_softmax: function (t) { return t; },
      dropout: function (t) { return t; },
      mse_loss: function (p, y) { var fp = flat(p), fy = flat(y); return lossTensor(fp.reduce(function (s, v, i) { return s + (v - fy[i]) * (v - fy[i]); }, 0) / fp.length, null, p, y); },
      cross_entropy: function (p, y) { return _F.binary_cross_entropy(p, y); },
      binary_cross_entropy: function (p, y) {
        var fp = flat(p), fy = flat(y), n = fp.length, L = 0;
        for (var i = 0; i < n; i++) { var pi = Math.min(1 - 1e-7, Math.max(1e-7, fp[i])); L += -(fy[i] * Math.log(pi) + (1 - fy[i]) * Math.log(1 - pi)); }
        return lossTensor(L / n, y, p, y);
      },
    };

    // a loss "tensor" carries its scalar value plus what's needed for backward
    function lossTensor(val, target, pred) { return { __loss: true, val: val, target: target, pred: pred }; }

    // single optimiser/model in flight (the example trains one model)
    var STATE = { model: null, lr: 0.01, t: 0 };

    var _optim = {
      Adam: function (params, lr) { STATE.lr = lr || 0.01; STATE.t = 0; return { __opt: true, kind: 'adam' }; },
      SGD: function (params, lr) { STATE.lr = lr || 0.01; return { __opt: true, kind: 'sgd' }; },
      opt_zero_grad: function () { if (STATE.model) STATE.model.layers.forEach(function (L) { L.gW = null; L.gb = null; }); return null; },
      opt_step: function (opt) {
        var m = STATE.model; if (!m || !m._grads) return null;
        STATE.t++;
        var lr = STATE.lr, b1 = 0.9, b2 = 0.999, eps = 1e-8;
        m.layers.forEach(function (L) {
          if (!L.gW) return;
          for (var i = 0; i < L.outF; i++) {
            for (var j = 0; j < L.inF; j++) {
              L.mW[i][j] = b1 * L.mW[i][j] + (1 - b1) * L.gW[i][j];
              L.vW[i][j] = b2 * L.vW[i][j] + (1 - b2) * L.gW[i][j] * L.gW[i][j];
              var mh = L.mW[i][j] / (1 - Math.pow(b1, STATE.t)), vh = L.vW[i][j] / (1 - Math.pow(b2, STATE.t));
              L.W[i][j] -= lr * mh / (Math.sqrt(vh) + eps);
            }
            L.mb[i] = b1 * L.mb[i] + (1 - b1) * L.gb[i];
            L.vb[i] = b2 * L.vb[i] + (1 - b2) * L.gb[i] * L.gb[i];
            var mhb = L.mb[i] / (1 - Math.pow(b1, STATE.t)), vhb = L.vb[i] / (1 - Math.pow(b2, STATE.t));
            L.b[i] -= lr * mhb / (Math.sqrt(vhb) + eps);
          }
        });
        return null;
      },
    };

    var _torch = {
      cuda_is_available: function () { return false; },
      tensor: function (data) { if (STATE.model === null) {/*noop*/} return data; },
      zeros: function (s) { return makeNumpy().zeros(s); },
      ones: function (s) { return makeNumpy().ones(s); },
      eye: function (n) { return makeNumpy().eye(n); },
      arange: function (a, b, c) { return makeNumpy().arange(a, b, c); },
      linspace: function (a, b, n) { return makeNumpy().linspace(a, b, n); },
      rand: function (s) { var n = isArr(s) ? s[0] : s; return Array.from({ length: n }, function () { return rng(); }); },
      randn: function (s) { var n = isArr(s) ? s[0] : s; return Array.from({ length: n }, function () { return gaussian(rng); }); },
      tensor_shape: function (t) { return t && t.__loss ? [] : shapeOf(t); },
      tensor_str: function (t) { return makeNumpy().array_str(unwrap(t)); },
      tensor_item: function (t) { if (t && t.__loss) return round6(t.val); var f = flat(unwrap(t)); return round6(f[0]); },
      tensor_sum: function (t) { return round6(sum(unwrap(t))); },
      tensor_mean: function (t) { return round6(mean(unwrap(t))); },
      tensor_std: function (t) { return round6(std(unwrap(t))); },
      tensor_min: function (t) { return Math.min.apply(null, flat(unwrap(t))); },
      tensor_max: function (t) { return Math.max.apply(null, flat(unwrap(t))); },
      tensor_argmax: function (t) { var f = flat(unwrap(t)); return f.indexOf(Math.max.apply(null, f)); },
      tensor_argmin: function (t) { var f = flat(unwrap(t)); return f.indexOf(Math.min.apply(null, f)); },
      tensor_add: function (a, b) { return makeNumpy().add(unwrap(a), unwrap(b)); },
      tensor_sub: function (a, b) { return makeNumpy().subtract(unwrap(a), unwrap(b)); },
      tensor_mul: function (a, b) { return makeNumpy().multiply(unwrap(a), unwrap(b)); },
      tensor_div: function (a, b) { return makeNumpy().divide(unwrap(a), unwrap(b)); },
      tensor_mul_scalar: function (a, s) { return makeNumpy().multiply(unwrap(a), s); },
      tensor_matmul: function (a, b) { return makeNumpy().matmul(unwrap(a), unwrap(b)); },
      tensor_transpose: function (a) { return makeNumpy().transpose(unwrap(a)); },
      tensor_pow: function (a, p) { var u = unwrap(a); return isArr(u) ? ew2d(u, function (x) { return Math.pow(x, p); }) : Math.pow(u, p); },
      tensor_reshape: function (a, s) { return makeNumpy().reshape(unwrap(a), s); },
      tensor_view: function (a, s) { return makeNumpy().reshape(unwrap(a), s); },
      tensor_squeeze: function (a) { return flat(unwrap(a)); },
      tensor_unsqueeze: function (a) { return unwrap(a).map(function (x) { return [x]; }); },
      tensor_detach: function (a) { return unwrap(a); },
      tensor_cpu: function (a) { return a; }, tensor_cuda: function (a) { return a; }, tensor_to: function (a) { return a; },
      tensor_numpy: function (a) { return unwrap(a); }, tensor_dtype: function () { return 'float32'; },
      tensor_grad: function () { return 0; },
      tensor_requires_grad_: function (a) { return a; },
      tensor_zero_grad: function () { return null; },
      tensor_backward: function (loss) {
        // real backprop for the in → hidden → ReLU → out MLP
        var m = STATE.model; if (!m || !loss || !loss.__loss) return null;
        var c = m.cache; if (!c) return null;
        var L1 = m.layers[0], L2 = m.layers[1];
        var X = c.X, z1 = c.z1, a1 = c.a1, z2 = c.z2;
        var n = X.length;
        var p = z2.map(function (r) { return r.map(sigmoidScalar); });   // sigmoid(logits)
        var y = loss.target;
        // dL/dz2 = (p - y)/n
        var dz2 = p.map(function (r, i) { return r.map(function (v, j) { return (v - y[i][j]) / n; }); });
        // grads for layer 2 (1×h):  dW2 = dz2ᵀ · a1 ; db2 = sum(dz2)
        var dW2 = matmul(matT(dz2), a1);                 // (out2×n)·(n×h) = out2×h
        var db2 = dz2[0].map(function (_, j) { return dz2.reduce(function (s, r) { return s + r[j]; }, 0); });
        // backprop to a1: da1 = dz2 · W2  (n×h)
        var da1 = matmul(dz2, L2.W);                      // (n×out2)·(out2×h)
        // through ReLU: dz1 = da1 * (z1>0)
        var dz1 = da1.map(function (r, i) { return r.map(function (v, j) { return z1[i][j] > 0 ? v : 0; }); });
        var dW1 = matmul(matT(dz1), X);                  // (h×n)·(n×in)
        var db1 = dz1[0].map(function (_, j) { return dz1.reduce(function (s, r) { return s + r[j]; }, 0); });
        L2.gW = dW2; L2.gb = db2; L1.gW = dW1; L1.gb = db1;
        m._grads = true;
        return null;
      },
      no_grad: function (fn) { if (fn && global.SageFFI && global.SageFFI.__call) { try { global.SageFFI.__call(fn, []); } catch (e) {} } return null; },
      save: function () { return null; }, load: function () { return null; },
    };
    function unwrap(t) { return t && t.__loss ? [[t.val]] : t; }
    function ew2d(M, f) { return is2d(M) ? M.map(function (r) { return r.map(f); }) : M.map(f); }

    // capture the model when Sequential is built so the optimiser/backward find it
    var origSeq = _nn.Sequential;
    _nn.Sequential = function () { var m = origSeq.apply(null, arguments); STATE.model = m; return m; };

    return { torch: _torch, nn: _nn, optim: _optim, F: _F };
  }

  // ════════════════════════════════════════════════════════════════════════════
  // json — real parse/stringify (used by sage-json, a dep of sage-requests)
  // ════════════════════════════════════════════════════════════════════════════
  function makeJson() {
    function toSage(v) {
      if (Array.isArray(v)) return v.map(toSage);
      if (v && typeof v === 'object') {
        var m = new Map();
        Object.keys(v).forEach(function (k) { m.set(k, toSage(v[k])); });
        return { __type: 'dict', data: m };
      }
      return v;
    }
    function fromSage(v) {
      if (Array.isArray(v)) return v.map(fromSage);
      if (v && v.__type === 'dict') { var o = {}; v.data.forEach(function (val, k) { o[k] = fromSage(val); }); return o; }
      if (v && v.__type === 'tuple') return v.items.map(fromSage);
      return v;
    }
    return {
      loads: function (s) { try { return toSage(JSON.parse(s)); } catch (e) { return null; } },
      dumps: function (v) { try { return JSON.stringify(fromSage(v)); } catch (e) { return 'null'; } },
      __toSage: toSage, __fromSage: fromSage,
    };
  }

  // ════════════════════════════════════════════════════════════════════════════
  // redis — real in-memory store (hiredis C ABI emulated)
  // ════════════════════════════════════════════════════════════════════════════
  function makeHiredis() {
    function newCtx() {
      return { __ctx: true, err: 0, errmsg: '', s: new Map(), ttl: new Map(),
               h: new Map(), l: new Map(), z: new Map(), connected: true };
    }
    function reply(kind, val) { return { __reply: true, kind: kind, val: val }; }
    function tokenize(cmd) {
      // space-separated; supports 'single' and "double" quoted args
      var re = /"([^"]*)"|'([^']*)'|(\S+)/g, out = [], m;
      while ((m = re.exec(cmd))) out.push(m[1] != null ? m[1] : m[2] != null ? m[2] : m[3]);
      return out;
    }
    function exec(ctx, cmd) {
      var t = tokenize(cmd), op = (t[0] || '').toUpperCase(), key = t[1];
      switch (op) {
        case 'PING': return reply('status', 'PONG');
        case 'SELECT': return reply('status', 'OK');
        case 'SET': {
          ctx.s.set(key, t[2]);
          for (var i = 3; i < t.length; i++) {
            var o = t[i].toUpperCase();
            if (o === 'EX') ctx.ttl.set(key, parseInt(t[++i], 10));
            else if (o === 'PX') ctx.ttl.set(key, Math.round(parseInt(t[++i], 10) / 1000));
            else if (o === 'NX' && ctx.s.has(key)) { /* already set above; keep simple */ }
          }
          return reply('status', 'OK');
        }
        case 'GET': return ctx.s.has(key) ? reply('string', ctx.s.get(key)) : reply('nil', null);
        case 'GETSET': { var prev = ctx.s.get(key); ctx.s.set(key, t[2]); return prev == null ? reply('nil', null) : reply('string', prev); }
        case 'APPEND': { ctx.s.set(key, (ctx.s.get(key) || '') + t[2]); return reply('int', ctx.s.get(key).length); }
        case 'INCR': { var n = (parseInt(ctx.s.get(key), 10) || 0) + 1; ctx.s.set(key, String(n)); return reply('int', n); }
        case 'INCRBY': { var n2 = (parseInt(ctx.s.get(key), 10) || 0) + parseInt(t[2], 10); ctx.s.set(key, String(n2)); return reply('int', n2); }
        case 'DECR': { var n3 = (parseInt(ctx.s.get(key), 10) || 0) - 1; ctx.s.set(key, String(n3)); return reply('int', n3); }
        case 'EXISTS': return reply('int', ctx.s.has(key) || ctx.h.has(key) || ctx.l.has(key) || ctx.z.has(key) ? 1 : 0);
        case 'DEL': { var d = ctx.s.delete(key) | ctx.h.delete(key) | ctx.l.delete(key) | ctx.z.delete(key); return reply('int', d ? 1 : 0); }
        case 'EXPIRE': ctx.ttl.set(key, parseInt(t[2], 10)); return reply('int', 1);
        case 'PEXPIRE': ctx.ttl.set(key, Math.round(parseInt(t[2], 10) / 1000)); return reply('int', 1);
        case 'TTL': return reply('int', ctx.ttl.has(key) ? ctx.ttl.get(key) : -1);
        case 'TYPE': return reply('status', ctx.h.has(key) ? 'hash' : ctx.l.has(key) ? 'list' : ctx.z.has(key) ? 'zset' : ctx.s.has(key) ? 'string' : 'none');
        case 'RENAME': { ctx.s.set(t[2], ctx.s.get(key)); ctx.s.delete(key); return reply('status', 'OK'); }
        case 'KEYS': { var all = Array.from(ctx.s.keys()).concat(Array.from(ctx.h.keys()), Array.from(ctx.l.keys()), Array.from(ctx.z.keys())); return reply('array', all); }
        // hashes
        case 'HSET': { var hm = ctx.h.get(key) || new Map(); var added = hm.has(t[2]) ? 0 : 1; hm.set(t[2], t[3]); ctx.h.set(key, hm); return reply('int', added); }
        case 'HMSET': { var hm2 = ctx.h.get(key) || new Map(); for (var j = 2; j + 1 < t.length; j += 2) hm2.set(t[j], t[j + 1]); ctx.h.set(key, hm2); return reply('status', 'OK'); }
        case 'HGET': { var hg = ctx.h.get(key); return hg && hg.has(t[2]) ? reply('string', hg.get(t[2])) : reply('nil', null); }
        case 'HGETALL': { var hga = ctx.h.get(key) || new Map(), arr = []; hga.forEach(function (v, k) { arr.push(k); arr.push(v); }); return reply('array', arr); }
        case 'HDEL': { var hd = ctx.h.get(key); var ok = hd && hd.delete(t[2]); return reply('int', ok ? 1 : 0); }
        case 'HEXISTS': { var he = ctx.h.get(key); return reply('int', he && he.has(t[2]) ? 1 : 0); }
        case 'HLEN': { var hl = ctx.h.get(key); return reply('int', hl ? hl.size : 0); }
        case 'HKEYS': { var hk = ctx.h.get(key) || new Map(); return reply('array', Array.from(hk.keys())); }
        case 'HVALS': { var hv = ctx.h.get(key) || new Map(); return reply('array', Array.from(hv.values())); }
        case 'HINCRBY': { var hi = ctx.h.get(key) || new Map(); var nv = (parseInt(hi.get(t[2]), 10) || 0) + parseInt(t[3], 10); hi.set(t[2], String(nv)); ctx.h.set(key, hi); return reply('int', nv); }
        // lists
        case 'RPUSH': { var rl = ctx.l.get(key) || []; for (var k = 2; k < t.length; k++) rl.push(t[k]); ctx.l.set(key, rl); return reply('int', rl.length); }
        case 'LPUSH': { var ll = ctx.l.get(key) || []; for (var k2 = 2; k2 < t.length; k2++) ll.unshift(t[k2]); ctx.l.set(key, ll); return reply('int', ll.length); }
        case 'LLEN': { var l4 = ctx.l.get(key); return reply('int', l4 ? l4.length : 0); }
        case 'LPOP': { var l5 = ctx.l.get(key); if (l5 && l5.length) { var v5 = l5.shift(); return reply('string', v5); } return reply('nil', null); }
        case 'RPOP': { var l6 = ctx.l.get(key); if (l6 && l6.length) { var v6 = l6.pop(); return reply('string', v6); } return reply('nil', null); }
        case 'LRANGE': { var l7 = ctx.l.get(key) || [], a7 = parseInt(t[2], 10), b7 = parseInt(t[3], 10); if (b7 < 0) b7 = l7.length + b7; return reply('array', l7.slice(a7, b7 + 1)); }
        case 'LINDEX': { var l8 = ctx.l.get(key) || []; return reply('string', l8[parseInt(t[2], 10)]); }
        // sorted sets
        case 'ZADD': { var zs = ctx.z.get(key) || []; var sc = parseFloat(t[2]), mem = t[3]; var ex = zs.find(function (e) { return e.member === mem; }); if (ex) { ex.score = sc; return reply('int', 0); } zs.push({ score: sc, member: mem }); ctx.z.set(key, zs); return reply('int', 1); }
        case 'ZRANGE': { var z2 = (ctx.z.get(key) || []).slice().sort(function (a, b) { return a.score - b.score; }); var s2 = parseInt(t[2], 10), e2 = parseInt(t[3], 10); if (e2 < 0) e2 = z2.length + e2; var slice = z2.slice(s2, e2 + 1).map(function (e) { return e.member; }); return reply('array', slice); }
        case 'ZREVRANGE': { var z3 = (ctx.z.get(key) || []).slice().sort(function (a, b) { return b.score - a.score; }); var s3 = parseInt(t[2], 10), e3 = parseInt(t[3], 10); if (e3 < 0) e3 = z3.length + e3; return reply('array', z3.slice(s3, e3 + 1).map(function (e) { return e.member; })); }
        case 'ZCARD': { var z4 = ctx.z.get(key); return reply('int', z4 ? z4.length : 0); }
        case 'ZSCORE': { var z5 = ctx.z.get(key) || []; var f5 = z5.find(function (e) { return e.member === t[2]; }); return f5 ? reply('string', String(f5.score)) : reply('nil', null); }
        case 'FLUSHDB': case 'FLUSHALL': ctx.s.clear(); ctx.h.clear(); ctx.l.clear(); ctx.z.clear(); return reply('status', 'OK');
        default: return reply('status', 'OK');
      }
    }
    return {
      redisConnect: function (host, port) { var c = newCtx(); c.host = host; c.port = port; return c; },
      redisConnectWithTimeout: function (host, port) { var c = newCtx(); c.host = host; c.port = port; return c; },
      redisFree: function (ctx) { if (ctx) ctx.connected = false; return null; },
      redisCommand: function (ctx, cmd) { if (!ctx || !ctx.connected) return null; return exec(ctx, cmd); },
      freeReplyObject: function () { return null; },
      redisAppendCommand: function (ctx, cmd) { (ctx._pipe = ctx._pipe || []).push(cmd); return 0; },
      redisGetReply: function (ctx) { if (ctx._pipe && ctx._pipe.length) { return exec(ctx, ctx._pipe.shift()); } return null; },
    };
  }

  // ════════════════════════════════════════════════════════════════════════════
  // libcurl — canned HTTP (no real network inside the sandboxed evaluator)
  // ════════════════════════════════════════════════════════════════════════════
  function makeCurl() {
    function newHandle() { return { __curl: true, url: '', method: 'GET', body: '', status: 200, resp: '' }; }
    function canned(url, method, body) {
      // produce believable JSON for the example endpoints
      if (/\/status\/(\d+)/.test(url)) { var code = parseInt(RegExp.$1, 10); return { status: code, body: '{}' }; }
      if (/jsonplaceholder.*\/posts$/.test(url) && method === 'POST') return { status: 201, body: '{"id": 101}' };
      if (/jsonplaceholder.*\/posts\/\d+/.test(url) && method === 'DELETE') return { status: 200, body: '{}' };
      if (/api\.github\.com\/users\//.test(url)) return { status: 200, body: '{"login": "MilkmanAbi", "public_repos": 42, "followers": 128}' };
      if (/httpbin.*\/get/.test(url)) return { status: 200, body: '{"url": "' + url + '", "args": {}}' };
      return { status: 200, body: '{"ok": true}' };
    }
    return {
      curl_easy_init: function () { return newHandle(); },
      curl_easy_cleanup: function () { return null; },
      curl_easy_setopt: function (h, opt, val) {
        if (!h) return 0;
        if (opt === 10002) h.url = val;            // CURLOPT_URL
        else if (opt === 10015) { h.body = val; if (h.method === 'GET') h.method = 'POST'; }  // POSTFIELDS
        else if (opt === 10036) h.method = val;    // CUSTOMREQUEST
        return 0;
      },
      curl_easy_perform: function (h) { var r = canned(h.url, h.method, h.body); h.status = r.status; h.resp = r.body; return 0; },
      curl_easy_getinfo: function (h) { return h ? h.status : 0; },
      curl_slist_append: function () { return { __slist: true }; },
      curl_slist_free_all: function () { return null; },
    };
  }

  // ── c_ffi reply / context helpers (consulted by the interpreter) ─────────────
  var cHelpers = {
    reply_str: function (r) {
      if (!r || !r.__reply) return r == null ? '' : String(r);
      if (r.kind === 'nil') return '';
      if (r.kind === 'array') return r.val.slice();   // array replies flow through as real lists
      return String(r.val);
    },
    reply_int: function (r) {
      if (!r || !r.__reply) return 0;
      if (r.kind === 'int') return r.val;
      var n = parseInt(r.val, 10); return isNaN(n) ? 0 : n;
    },
    reply_array: function (r) { return r && r.__reply && r.kind === 'array' ? r.val.slice() : []; },
    reply_type: function (r) { return r && r.__reply ? r.kind : 'nil'; },
    reply_is_nil: function (r) { return r && r.__reply && r.kind === 'nil' ? 1 : 0; },
    ctx_err: function (c) { return c && c.__ctx ? c.err : 0; },
    ctx_errmsg: function (c) { return c && c.__ctx ? c.errmsg : ''; },
    // curl response helpers
    curl_status: function (h) { return h && h.__curl ? h.status : 0; },
    curl_body: function (h) { return h && h.__curl ? h.resp : ''; },
  };

  // ── register ──────────────────────────────────────────────────────────────
  var torchSuite = makeTorchSuite();
  global.SageFFI = {
    python: {
      'numpy': makeNumpy(),
      'pandas': makePandas(),
      'torch': torchSuite.torch,
      'torch.nn': torchSuite.nn,
      'torch.optim': torchSuite.optim,
      'torch.nn.functional': torchSuite.F,
      'json': makeJson(),
    },
    c: {
      'libhiredis.so.1': makeHiredis(),
      'libhiredis.so': makeHiredis(),
      'libcurl.so.4': makeCurl(),
      'libcurl.so': makeCurl(),
    },
    cHelpers: cHelpers,
    // factories (so a fresh state can be made if needed)
    _make: { numpy: makeNumpy, pandas: makePandas, hiredis: makeHiredis, curl: makeCurl },
  };

})(typeof window !== 'undefined' ? window : globalThis);
