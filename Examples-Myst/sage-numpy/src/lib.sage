# sage-numpy  ✦  NumPy bindings for Sage
#
# Wraps the NumPy C-extension via Sage's Python FFI layer.
# All heavy computation stays in NumPy; this module provides
# an idiomatic Sage API on top.
#
# Usage:
#   import sage-numpy as np
#   let a = np.array([1.0, 2.0, 3.0, 4.0])
#   println(a.mean())

import python

let _np = python.import("numpy")


# ── NDArray ──────────────────────────────────────────────────────────────────
# Thin wrapper around a NumPy ndarray handle.

struct NDArray:
    _handle : int     # opaque reference to the numpy ndarray
    shape   : int     # list[int] — filled on creation
    dtype   : str


impl NDArray:

    proc to_str(self) -> str:
        return _np.array_str(self._handle)

    proc size(self) -> int:
        return _np.size(self._handle)

    proc ndim(self) -> int:
        return _np.ndim(self._handle)

    # ── element access ────────────────────────────────────────────────────

    proc get(self, *indices) -> float:
        # e.g. mat.get(0, 1)  for row 0, col 1
        return _np.take(self._handle, indices)

    # ── shape operations ──────────────────────────────────────────────────

    proc reshape(self, *new_shape) -> NDArray:
        let h = _np.reshape(self._handle, new_shape)
        return NDArray(h, new_shape, self.dtype)

    proc flatten(self) -> NDArray:
        let h = _np.ravel(self._handle)
        return NDArray(h, [self.size()], self.dtype)

    proc T(self) -> NDArray:
        let h = _np.transpose(self._handle)
        return NDArray(h, list(reversed(self.shape)), self.dtype)

    proc astype(self, dtype: str) -> NDArray:
        let h = _np.ndarray_astype(self._handle, dtype)
        return NDArray(h, self.shape, dtype)

    # ── arithmetic ────────────────────────────────────────────────────────

    proc add(self, other: NDArray) -> NDArray:
        let h = _np.add(self._handle, other._handle)
        return NDArray(h, self.shape, self.dtype)

    proc sub(self, other: NDArray) -> NDArray:
        let h = _np.subtract(self._handle, other._handle)
        return NDArray(h, self.shape, self.dtype)

    proc mul(self, other: NDArray) -> NDArray:
        let h = _np.multiply(self._handle, other._handle)
        return NDArray(h, self.shape, self.dtype)

    proc div(self, other: NDArray) -> NDArray:
        let h = _np.divide(self._handle, other._handle)
        return NDArray(h, self.shape, self.dtype)

    proc scale(self, scalar: float) -> NDArray:
        let h = _np.multiply(self._handle, scalar)
        return NDArray(h, self.shape, self.dtype)

    proc dot(self, other: NDArray) -> NDArray:
        let h = _np.dot(self._handle, other._handle)
        # shape of result depends on input dims; let numpy decide
        return NDArray(h, [], self.dtype)

    proc matmul(self, other: NDArray) -> NDArray:
        let h = _np.matmul(self._handle, other._handle)
        return NDArray(h, [], self.dtype)

    # ── reductions ───────────────────────────────────────────────────────

    proc sum(self) -> float:
        return _np.sum(self._handle)

    proc sum_axis(self, axis: int) -> NDArray:
        let h = _np.sum_axis(self._handle, axis)
        return NDArray(h, [], self.dtype)

    proc mean(self) -> float:
        return _np.mean(self._handle)

    proc std(self) -> float:
        return _np.std(self._handle)

    proc var(self) -> float:
        return _np.var(self._handle)

    proc min(self) -> float:
        return _np.min(self._handle)

    proc max(self) -> float:
        return _np.max(self._handle)

    proc argmin(self) -> int:
        return _np.argmin(self._handle)

    proc argmax(self) -> int:
        return _np.argmax(self._handle)

    proc norm(self) -> float:
        return _np.linalg_norm(self._handle)

    # ── comparisons ───────────────────────────────────────────────────────

    proc eq(self, other: NDArray) -> NDArray:
        let h = _np.equal(self._handle, other._handle)
        return NDArray(h, self.shape, "bool")

    proc lt(self, other: NDArray) -> NDArray:
        let h = _np.less(self._handle, other._handle)
        return NDArray(h, self.shape, "bool")

    proc gt(self, other: NDArray) -> NDArray:
        let h = _np.greater(self._handle, other._handle)
        return NDArray(h, self.shape, "bool")

    # ── element-wise math ─────────────────────────────────────────────────

    proc abs(self) -> NDArray:
        return NDArray(_np.abs(self._handle), self.shape, self.dtype)

    proc sqrt(self) -> NDArray:
        return NDArray(_np.sqrt(self._handle), self.shape, self.dtype)

    proc exp(self) -> NDArray:
        return NDArray(_np.exp(self._handle), self.shape, self.dtype)

    proc log(self) -> NDArray:
        return NDArray(_np.log(self._handle), self.shape, self.dtype)

    proc clip(self, lo: float, hi: float) -> NDArray:
        return NDArray(_np.clip(self._handle, lo, hi), self.shape, self.dtype)

    proc where(self, cond: NDArray, other: NDArray) -> NDArray:
        let h = _np.where(cond._handle, self._handle, other._handle)
        return NDArray(h, self.shape, self.dtype)


# ── Module-level constructors ─────────────────────────────────────────────────

proc array(data: int) -> NDArray:
    let h = _np.array(data)
    return NDArray(h, _np.shape(h), "float64")

proc zeros(shape: int) -> NDArray:
    let h = _np.zeros(shape)
    return NDArray(h, shape, "float64")

proc ones(shape: int) -> NDArray:
    let h = _np.ones(shape)
    return NDArray(h, shape, "float64")

proc arange(start: float, stop: float, step: float) -> NDArray:
    let h = _np.arange(start, stop, step)
    return NDArray(h, [], "float64")

proc linspace(start: float, stop: float, num: int) -> NDArray:
    let h = _np.linspace(start, stop, num)
    return NDArray(h, [num], "float64")

proc random_uniform(low: float, high: float, shape: int) -> NDArray:
    let h = _np.random_uniform(low, high, shape)
    return NDArray(h, shape, "float64")

proc random_normal(mean: float, std: float, shape: int) -> NDArray:
    let h = _np.random_normal(mean, std, shape)
    return NDArray(h, shape, "float64")

proc eye(n: int) -> NDArray:
    let h = _np.eye(n)
    return NDArray(h, [n, n], "float64")

proc diag(v: NDArray) -> NDArray:
    let h = _np.diag(v._handle)
    return NDArray(h, [], "float64")

proc stack(arrays: int, axis: int) -> NDArray:
    # arrays: list of NDArray
    let handles = arrays.map(proc(a): return a._handle)
    let h = _np.stack(handles, axis)
    return NDArray(h, [], "float64")

proc concatenate(arrays: int, axis: int) -> NDArray:
    let handles = arrays.map(proc(a): return a._handle)
    let h = _np.concatenate(handles, axis)
    return NDArray(h, [], "float64")


# ── Linear algebra ────────────────────────────────────────────────────────────

proc inv(a: NDArray) -> NDArray:
    let h = _np.linalg_inv(a._handle)
    return NDArray(h, a.shape, a.dtype)

proc eig(a: NDArray) -> int:
    # returns [eigenvalues: NDArray, eigenvectors: NDArray]
    let result = _np.linalg_eig(a._handle)
    let vals = NDArray(result[0], [], "complex128")
    let vecs = NDArray(result[1], [], "complex128")
    return [vals, vecs]

proc svd(a: NDArray) -> int:
    # returns [U, S, Vh]
    let result = _np.linalg_svd(a._handle)
    return [NDArray(result[0], [], "float64"),
            NDArray(result[1], [], "float64"),
            NDArray(result[2], [], "float64")]

proc solve(a: NDArray, b: NDArray) -> NDArray:
    let h = _np.linalg_solve(a._handle, b._handle)
    return NDArray(h, b.shape, "float64")


# ── Convenience re-exports ────────────────────────────────────────────────────

proc pi() -> float:
    return _np.pi

proc inf() -> float:
    return _np.inf
