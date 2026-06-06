# Examples-Myst

Example Myst packages for the [Sage Playground](https://github.com/MilkmanAbi/Sage-Playground).

Each directory is a standalone Myst package. Add any of them to your project as a git path
dependency, or explore the source to see how Sage's Python and C FFI layers work in practice.

## Packages

| Package | FFI | Wraps | What it demos |
|---|---|---|---|
| `sage-numpy` | Python | NumPy | ndarray math, broadcasting, linear algebra |
| `sage-requests` | C (libcurl) | libcurl | HTTP GET/POST/PUT/DELETE, headers, auth |
| `sage-redis` | C (hiredis) | hiredis | key-value, lists, pub/sub, pipelines |
| `sage-pandas` | Python | pandas | DataFrame, CSV I/O, groupby, merge |
| `sage-torch` | Python | PyTorch | Tensors, autograd, simple training loop |
| `sage-sandbox-demo` | — | LilyBox | Sandboxed plugin isolation via LilyBox |

## Adding a package to your project

```toml
# myst.toml
[dependencies]
sage-numpy = { git = "https://github.com/MilkmanAbi/Sage-Playground", path = "Examples-Myst/sage-numpy", rev = "main" }
```

Then:

```
myst install
```

## Notes

These packages wrap real libraries via Sage's FFI layer. In the browser-based Sage Playground
the FFI calls are emulated — every `python.import` and `c_ffi.load` produces realistic output
so you can read the code and understand the pattern without a native runtime.

On a real Sage installation with the relevant libraries present (NumPy, PyTorch, hiredis, libcurl)
the wrappers function as written.
