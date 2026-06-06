# sage-torch  ✦  train a 2-layer MLP on XOR
#
# This demonstrates the full Sage-torch training loop:
#   build model → forward pass → loss → backward → optimiser step
#
# Run with:  myst run examples/main.sage

import sage-torch as torch

println("CUDA available: " + str(torch.is_cuda_available()))
println("")

# ── Dataset: XOR problem ──────────────────────────────────────────────────────
#   inputs:  (0,0)→0  (0,1)→1  (1,0)→1  (1,1)→0

let X = torch.tensor([[0.0, 0.0],
                       [0.0, 1.0],
                       [1.0, 0.0],
                       [1.0, 1.0]])

let y = torch.tensor([[0.0], [1.0], [1.0], [0.0]])

# ── Model: input(2) → hidden(8) → ReLU → output(1) → Sigmoid ─────────────────

let model = torch.sequential(
    torch.linear(2, 8),
    torch.linear(8, 1),
)

let opt = torch.adam(model.parameters(), 0.01)

# ── Training loop ─────────────────────────────────────────────────────────────

model.train()
println("training for 1000 epochs…")

for epoch in range(0, 1000):
    opt.zero_grad()

    let pred = model.forward(X)
    let pred_sigmoid = torch.sigmoid(pred)
    let loss = torch.bce_loss(pred_sigmoid, y)

    loss.backward()
    opt.step()

    if epoch % 200 == 0:
        println("  epoch " + str(epoch) + "  loss = " + str(loss.item()))

println("")

# ── Evaluation ────────────────────────────────────────────────────────────────

model.eval()

let out = torch.sigmoid(model.forward(X))
println("predictions after training (rounded):")
println(out.to_str())
println("targets were:  [[0] [1] [1] [0]]")

println("")

# ── Save / load ───────────────────────────────────────────────────────────────

model.save("xor_model.pt")
println("model saved to xor_model.pt")

let loaded = torch.load("xor_model.pt")
println("model loaded  ✦")
