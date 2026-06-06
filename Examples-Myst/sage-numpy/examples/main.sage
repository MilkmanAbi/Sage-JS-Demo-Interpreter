# sage-numpy  ✦  example usage
#
# Run with:  myst run examples/main.sage
#            (or open in Sage Playground)

import sage-numpy as np

# ── Basic array operations ────────────────────────────────────────────────────

let a = np.array([1.0, 2.0, 3.0, 4.0, 5.0])
println("a      = " + a.to_str())
println("mean   = " + str(a.mean()))
println("std    = " + str(a.std()))
println("sum    = " + str(a.sum()))
println("max    = " + str(a.max()))
println("")

# ── 2D matrix from nested list ────────────────────────────────────────────────

let mat = np.array([[1.0, 2.0, 3.0],
                    [4.0, 5.0, 6.0],
                    [7.0, 8.0, 9.0]])

println("mat =")
println(mat.to_str())
println("mat.T =")
println(mat.T().to_str())
println("")

# ── Matrix multiplication ─────────────────────────────────────────────────────

let b = np.array([[1.0, 0.0],
                  [0.0, 1.0],
                  [1.0, 1.0]])

let c = np.array([[2.0, 3.0, 4.0],
                  [5.0, 6.0, 7.0]])

let product = c.matmul(b)
println("c @ b =")
println(product.to_str())
println("")

# ── linspace + element-wise ops ───────────────────────────────────────────────

let x     = np.linspace(0.0, np.pi(), 8)
let sin_x = np.array(x._handle).where(
              np.ones([8]),
              np.zeros([8])
            )
println("x   = " + x.to_str())
println("")

# ── Random + statistics ───────────────────────────────────────────────────────

let samples = np.random_normal(0.0, 1.0, [1000])
println("1000 samples from N(0,1):")
println("  mean  = " + str(samples.mean()))
println("  std   = " + str(samples.std()))
println("  min   = " + str(samples.min()))
println("  max   = " + str(samples.max()))
println("")

# ── Linear system solve  Ax = b ───────────────────────────────────────────────

let A = np.array([[2.0, 1.0],
                  [5.0, 7.0]])
let b2 = np.array([11.0, 13.0])

let x_sol = np.solve(A, b2)
println("Ax = b  →  x = " + x_sol.to_str())

# ── Eigendecomposition ────────────────────────────────────────────────────────

let sym = np.array([[4.0, 2.0],
                    [2.0, 3.0]])
let eig = np.eig(sym)
println("eigenvalues  = " + eig[0].to_str())
println("eigenvectors =")
println(eig[1].to_str())
