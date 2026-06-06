# sage-torch  ✦  PyTorch bindings for Sage
#
# Wraps torch via the Python FFI layer.
# Tensors, autograd, optimisers, and a small neural net API.
#
# Usage:
#   import sage-torch as torch
#   let x = torch.randn([3, 4])
#   println(x.to_str())

import python

let _torch   = python.import("torch")
let _nn      = python.import("torch.nn")
let _optim   = python.import("torch.optim")
let _F       = python.import("torch.nn.functional")


# ── Tensor ────────────────────────────────────────────────────────────────────

struct Tensor:
    _handle   : int
    requires_grad : bool

impl Tensor:
    proc to_str(self) -> str:
        return _torch.tensor_str(self._handle)

    proc shape(self) -> int:
        return _torch.tensor_shape(self._handle)

    proc dtype(self) -> str:
        return _torch.tensor_dtype(self._handle)

    proc item(self) -> float:
        return _torch.tensor_item(self._handle)

    proc numpy(self) -> int:
        return _torch.tensor_numpy(self._handle)

    proc detach(self) -> Tensor:
        return Tensor(_torch.tensor_detach(self._handle), false)

    proc cpu(self) -> Tensor:
        return Tensor(_torch.tensor_cpu(self._handle), self.requires_grad)

    proc cuda(self) -> Tensor:
        return Tensor(_torch.tensor_cuda(self._handle), self.requires_grad)

    proc to(self, device: str) -> Tensor:
        return Tensor(_torch.tensor_to(self._handle, device), self.requires_grad)

    proc requires_grad_(self, flag: bool) -> Tensor:
        _torch.tensor_requires_grad_(self._handle, flag)
        return Tensor(self._handle, flag)

    # ── arithmetic ────────────────────────────────────────────────────────

    proc add(self, other: Tensor) -> Tensor:
        return Tensor(_torch.tensor_add(self._handle, other._handle), false)

    proc sub(self, other: Tensor) -> Tensor:
        return Tensor(_torch.tensor_sub(self._handle, other._handle), false)

    proc mul(self, other: Tensor) -> Tensor:
        return Tensor(_torch.tensor_mul(self._handle, other._handle), false)

    proc div(self, other: Tensor) -> Tensor:
        return Tensor(_torch.tensor_div(self._handle, other._handle), false)

    proc matmul(self, other: Tensor) -> Tensor:
        return Tensor(_torch.tensor_matmul(self._handle, other._handle), false)

    proc scale(self, s: float) -> Tensor:
        return Tensor(_torch.tensor_mul_scalar(self._handle, s), false)

    proc pow(self, exp: float) -> Tensor:
        return Tensor(_torch.tensor_pow(self._handle, exp), false)

    # ── shape ─────────────────────────────────────────────────────────────

    proc reshape(self, *dims) -> Tensor:
        return Tensor(_torch.tensor_reshape(self._handle, dims), self.requires_grad)

    proc view(self, *dims) -> Tensor:
        return Tensor(_torch.tensor_view(self._handle, dims), self.requires_grad)

    proc transpose(self, dim0: int, dim1: int) -> Tensor:
        return Tensor(_torch.tensor_transpose(self._handle, dim0, dim1), self.requires_grad)

    proc squeeze(self) -> Tensor:
        return Tensor(_torch.tensor_squeeze(self._handle), self.requires_grad)

    proc unsqueeze(self, dim: int) -> Tensor:
        return Tensor(_torch.tensor_unsqueeze(self._handle, dim), self.requires_grad)

    # ── reductions ────────────────────────────────────────────────────────

    proc sum(self) -> Tensor:
        return Tensor(_torch.tensor_sum(self._handle), false)

    proc mean(self) -> Tensor:
        return Tensor(_torch.tensor_mean(self._handle), false)

    proc std(self) -> Tensor:
        return Tensor(_torch.tensor_std(self._handle), false)

    proc max(self) -> Tensor:
        return Tensor(_torch.tensor_max(self._handle), false)

    proc min(self) -> Tensor:
        return Tensor(_torch.tensor_min(self._handle), false)

    proc argmax(self, dim: int) -> Tensor:
        return Tensor(_torch.tensor_argmax(self._handle, dim), false)

    proc argmin(self, dim: int) -> Tensor:
        return Tensor(_torch.tensor_argmin(self._handle, dim), false)

    # ── autograd ──────────────────────────────────────────────────────────

    proc backward(self):
        _torch.tensor_backward(self._handle)

    proc grad(self) -> Tensor:
        return Tensor(_torch.tensor_grad(self._handle), false)

    proc zero_grad(self):
        _torch.tensor_zero_grad(self._handle)


# ── Activations ───────────────────────────────────────────────────────────────

proc relu(x: Tensor) -> Tensor:
    return Tensor(_F.relu(x._handle), false)

proc sigmoid(x: Tensor) -> Tensor:
    return Tensor(_F.sigmoid(x._handle), false)

proc tanh(x: Tensor) -> Tensor:
    return Tensor(_F.tanh(x._handle), false)

proc softmax(x: Tensor, dim: int) -> Tensor:
    return Tensor(_F.softmax(x._handle, dim), false)

proc log_softmax(x: Tensor, dim: int) -> Tensor:
    return Tensor(_F.log_softmax(x._handle, dim), false)

proc dropout(x: Tensor, p: float, training: bool) -> Tensor:
    return Tensor(_F.dropout(x._handle, p, training), false)


# ── Loss functions ────────────────────────────────────────────────────────────

proc mse_loss(pred: Tensor, target: Tensor) -> Tensor:
    return Tensor(_F.mse_loss(pred._handle, target._handle), false)

proc cross_entropy(pred: Tensor, target: Tensor) -> Tensor:
    return Tensor(_F.cross_entropy(pred._handle, target._handle), false)

proc bce_loss(pred: Tensor, target: Tensor) -> Tensor:
    return Tensor(_F.binary_cross_entropy(pred._handle, target._handle), false)


# ── Linear layer ─────────────────────────────────────────────────────────────

struct Linear:
    _module : int
    in_dim  : int
    out_dim : int

impl Linear:
    proc forward(self, x: Tensor) -> Tensor:
        return Tensor(_nn.linear_forward(self._module, x._handle), false)

    proc parameters(self) -> int:
        return _nn.module_parameters(self._module).map(proc(p): return Tensor(p, true))

    proc weight(self) -> Tensor:
        return Tensor(_nn.linear_weight(self._module), true)

    proc bias(self) -> Tensor:
        return Tensor(_nn.linear_bias(self._module), true)

    proc to(self, device: str) -> Linear:
        _nn.module_to(self._module, device)
        return self


# ── Sequential model ──────────────────────────────────────────────────────────

struct Sequential:
    _module : int
    layers  : int   # list of layer descriptors

impl Sequential:
    proc forward(self, x: Tensor) -> Tensor:
        return Tensor(_nn.sequential_forward(self._module, x._handle), false)

    proc parameters(self) -> int:
        return _nn.module_parameters(self._module).map(proc(p): return Tensor(p, true))

    proc to(self, device: str) -> Sequential:
        _nn.module_to(self._module, device)
        return self

    proc train(self):
        _nn.module_train(self._module)

    proc eval(self):
        _nn.module_eval(self._module)

    proc save(self, path: str):
        _torch.save(self._module, path)


# ── Optimisers ────────────────────────────────────────────────────────────────

struct SGD:
    _opt : int

impl SGD:
    proc zero_grad(self):
        _optim.opt_zero_grad(self._opt)

    proc step(self):
        _optim.opt_step(self._opt)


struct Adam:
    _opt : int

impl Adam:
    proc zero_grad(self):
        _optim.opt_zero_grad(self._opt)

    proc step(self):
        _optim.opt_step(self._opt)


# ── Module-level constructors ─────────────────────────────────────────────────

proc tensor(data: int) -> Tensor:
    return Tensor(_torch.tensor(data), false)

proc zeros(shape: int) -> Tensor:
    return Tensor(_torch.zeros(shape), false)

proc ones(shape: int) -> Tensor:
    return Tensor(_torch.ones(shape), false)

proc randn(shape: int) -> Tensor:
    return Tensor(_torch.randn(shape), false)

proc rand(shape: int) -> Tensor:
    return Tensor(_torch.rand(shape), false)

proc arange(start: float, end: float, step: float) -> Tensor:
    return Tensor(_torch.arange(start, end, step), false)

proc linspace(start: float, end: float, steps: int) -> Tensor:
    return Tensor(_torch.linspace(start, end, steps), false)

proc eye(n: int) -> Tensor:
    return Tensor(_torch.eye(n), false)

proc linear(in_dim: int, out_dim: int) -> Linear:
    return Linear(_nn.Linear(in_dim, out_dim), in_dim, out_dim)

proc sequential(*layers) -> Sequential:
    let handles = layers.map(proc(l): return l._module)
    return Sequential(_nn.Sequential(handles), layers)

proc sgd(params: int, lr: float, momentum: float) -> SGD:
    let ps = params.map(proc(p): return p._handle)
    return SGD(_optim.SGD(ps, lr, momentum))

proc adam(params: int, lr: float) -> Adam:
    let ps = params.map(proc(p): return p._handle)
    return Adam(_optim.Adam(ps, lr))

proc no_grad(fn: int):
    _torch.no_grad(fn)

proc is_cuda_available() -> bool:
    return _torch.cuda_is_available()

proc load(path: str) -> Sequential:
    return Sequential(_torch.load(path), [])
