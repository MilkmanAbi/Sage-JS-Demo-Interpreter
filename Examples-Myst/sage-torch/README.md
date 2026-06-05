# sage-torch

PyTorch tensor and autograd bindings for Sage via the Python FFI layer.

```toml
[dependencies]
sage-torch = { git = "https://github.com/MilkmanAbi/Sage-Playground", path = "Examples-Myst/sage-torch", rev = "main" }
```

## Quick start

```sage
import sage-torch as torch

let x = torch.randn([32, 16])
let w = torch.randn([16, 8])
let y = x.matmul(w)
println(y.shape())
```

## Building a model

```sage
let model = torch.sequential(
    torch.linear(784, 256),
    torch.linear(256, 10),
)
let opt = torch.adam(model.parameters(), 0.001)

for epoch in range(0, 100):
    opt.zero_grad()
    let pred  = torch.softmax(model.forward(X), 1)
    let loss  = torch.cross_entropy(pred, labels)
    loss.backward()
    opt.step()
```

## API

### Tensor construction
`tensor(data)` · `zeros(shape)` · `ones(shape)` · `randn(shape)` · `rand(shape)` · `eye(n)` · `arange(start, end, step)` · `linspace(start, end, steps)`

### Tensor ops
`.add` · `.sub` · `.mul` · `.div` · `.matmul` · `.scale` · `.pow`  
`.reshape` · `.view` · `.transpose` · `.squeeze` · `.unsqueeze`  
`.sum` · `.mean` · `.std` · `.max` · `.min` · `.argmax` · `.argmin`  
`.backward()` · `.grad()` · `.detach()` · `.item()`

### Activations
`relu` · `sigmoid` · `tanh` · `softmax` · `log_softmax` · `dropout`

### Loss functions
`mse_loss` · `cross_entropy` · `bce_loss`

### Layers
`linear(in, out)` → `Linear` with `.forward`, `.parameters`, `.weight`, `.bias`  
`sequential(*layers)` → `Sequential` with `.forward`, `.train`, `.eval`, `.save`

### Optimisers
`sgd(params, lr, momentum)` · `adam(params, lr)`  
Both expose `.zero_grad()` and `.step()`
