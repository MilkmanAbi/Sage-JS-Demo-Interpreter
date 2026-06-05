# sage-numpy

NumPy bindings for Sage via the Python FFI layer.

```toml
# myst.toml
[dependencies]
sage-numpy = { git = "https://github.com/MilkmanAbi/Sage-Playground", path = "Examples-Myst/sage-numpy", rev = "main" }
```

## Quick start

```sage
import sage-numpy as np

let a = np.array([1.0, 2.0, 3.0, 4.0])
println(a.mean())    # 2.5
println(a.std())     # 1.118...

let mat = np.eye(3)
println(mat.to_str())

let x = np.random_normal(0.0, 1.0, [100])
println("std ≈ " + str(x.std()))
```

## API surface

### Constructors
| proc | description |
|---|---|
| `array(data)` | from nested list |
| `zeros(shape)` | all zeros |
| `ones(shape)` | all ones |
| `eye(n)` | identity matrix |
| `arange(start, stop, step)` | evenly-spaced range |
| `linspace(start, stop, num)` | evenly-spaced interval |
| `random_uniform(low, high, shape)` | uniform random |
| `random_normal(mean, std, shape)` | Gaussian random |
| `stack(arrays, axis)` | stack along new axis |
| `concatenate(arrays, axis)` | concatenate along axis |

### NDArray methods
`to_str` · `size` · `ndim` · `reshape` · `flatten` · `T` · `astype`  
`add` · `sub` · `mul` · `div` · `scale` · `dot` · `matmul`  
`sum` · `sum_axis` · `mean` · `std` · `var` · `min` · `max` · `argmin` · `argmax` · `norm`  
`abs` · `sqrt` · `exp` · `log` · `clip` · `where`  
`eq` · `lt` · `gt`

### Linear algebra
`inv(a)` · `eig(a)` · `svd(a)` · `solve(a, b)`

## How the FFI works

```sage
import python

let _np = python.import("numpy")   # loads the CPython extension
let h   = _np.array([1.0, 2.0])   # returns an opaque handle
```

`python.import` calls `PyImport_ImportModule` through Sage's embedded CPython 3.12 runtime.
All subsequent calls on the returned object are dispatched via `PyObject_CallMethod`.
The `NDArray` struct holds an opaque handle and exposes a typed Sage interface on top.
