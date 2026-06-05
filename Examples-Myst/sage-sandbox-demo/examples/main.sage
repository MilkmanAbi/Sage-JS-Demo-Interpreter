# sage-sandbox-demo  ✦  example usage
#
# Demonstrates all three patterns in this package:
#   1. SecureEval  — run untrusted code safely
#   2. PluginHost  — load and call sandboxed plugins
#   3. DataPipeline — run a heavy transform in a capped box

import sage-sandbox-demo as sbox

# ── 1. SecureEval ─────────────────────────────────────────────────────────────
#
# Evaluate arbitrary Sage code with no filesystem access,
# 16 MB memory cap, and a 500ms CPU budget.

println("─── SecureEval ───")

let ok_result = sbox.secure_eval(
    'let x = [1,2,3,4,5]\nprintln(x.map(proc(n): return n*n))',
    16,    # memory_mb
    500,   # timeout_ms
)
println("clean code: " + ok_result.to_str())

let bad_result = sbox.secure_eval(
    'var n = 0\nwhile true: n = n + 1',  # infinite loop
    16,
    200,
)
println("infinite loop: ok=" + str(bad_result.ok) + " error=" + bad_result.error)

let error_result = sbox.secure_eval(
    'raise "intentional error"',
    16,
    500,
)
println("raised error: " + error_result.to_str())
println("")

# ── 2. PluginHost ─────────────────────────────────────────────────────────────
#
# Load two plugins from ./plugins/ and call a method on each.
# Each plugin runs in its own isolated LilyBox.

println("─── PluginHost ───")

let host = sbox.plugin_host("plugins", "plugins/host.manifest")

try:
    host.load("formatter")
    let fmt_result = host.call("formatter", "format", {
        text: "hello, world",
        style: "uppercase",
    })
    println("formatter result: " + str(fmt_result))
catch e:
    println("plugin not available in this env: " + e)

try:
    host.load("validator")
    let val_result = host.call("validator", "validate", {
        email: "ada@example.com",
    })
    println("validator result: " + str(val_result))
catch e:
    println("plugin not available in this env: " + e)

host.unload_all()
println("")

# ── 3. DataPipeline ───────────────────────────────────────────────────────────
#
# Run a data-processing transform in a sandboxed child process.
# The transform is an external .sage file; the host passes input
# via JSON and receives output the same way.

println("─── DataPipeline ───")

let input_data = {
    records: [
        {name: "Alice", score: 88},
        {name: "Bob",   score: 72},
        {name: "Carol", score: 95},
    ],
    threshold: 80,
}

let pipeline_result = sbox.run_in_sandbox(
    "transforms/filter_above_threshold.sage",
    input_data,
    32,    # memory_mb
    1000,  # cpu_ms
)

println("pipeline: " + pipeline_result.to_str())
if pipeline_result.ok:
    println("filtered records: " + str(pipeline_result.data))
println("")

# ── 4. Signed plugin ──────────────────────────────────────────────────────────

println("─── SignedPlugin ───")

# In a real project: keys are generated once and stored securely.
# Here we just show the API pattern.
let fake_privkey = "ed25519_private_key_bytes_here"

try:
    let signed = sbox.sign_plugin("plugins/formatter.sage", fake_privkey)
    println("signature: " + signed.signature.slice(0, 16) + "…")
    println("verified:  " + str(signed.verify()))
    let box = sbox.load_signed(signed, "plugins/host.manifest")
    println("loaded signed plugin  ✦")
catch e:
    println("signing demo (keys not real): " + e)
