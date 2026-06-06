# sage-sandbox-demo

LilyBox sandboxing patterns for Sage — the three most useful ways to use Sage's
built-in process-isolation layer.

```toml
[dependencies]
sage-sandbox-demo = { git = "https://github.com/MilkmanAbi/Sage-Playground", path = "Examples-Myst/sage-sandbox-demo", rev = "main" }
```

## What is LilyBox?

LilyBox is Sage's native sandboxing system. Every `sandbox.create(manifest)` call
spawns a child Sage process in an isolated environment with:

- **Capability-based filesystem access** — only explicitly granted paths are readable/writable
- **Network isolation** — off by default, must be explicitly enabled
- **Memory cap** — child is killed and an error is returned if it exceeds the limit
- **CPU cap** — kills the child after N milliseconds of CPU time
- **Signed manifests** — optional Ed25519 signatures prevent tampered plugins from loading

The host process is unaffected if the sandboxed child crashes, loops, or runs out of resources.

## Patterns

### SecureEval — run untrusted code

```sage
import sage-sandbox-demo as sbox

let result = sbox.secure_eval(
    'println([1,2,3].map(proc(x): return x * x))',
    16,     # max 16 MB
    500,    # max 500 ms CPU
)
println(result.stdout)  # "[1, 4, 9]"
```

Use for: online playgrounds, notebook kernels, contest judges, configuration scripting.

### PluginHost — sandboxed plugins

```sage
let host = sbox.plugin_host("plugins/", "plugins/host.manifest")
host.load("my_plugin")
let result = host.call("my_plugin", "transform", {input: "data"})
host.unload_all()
```

Use for: extensible applications where plugins are written by third parties.

### DataPipeline — capped background processing

```sage
let result = sbox.run_in_sandbox(
    "transforms/process.sage",
    {records: [...]},
    64,    # MB
    5000,  # ms
)
if result.ok:
    println(result.data)
```

Use for: heavy ETL, ML inference, report generation — anything you want isolated from the host.

### SignedPlugin — tamper-resistant loading

```sage
let signed = sbox.sign_plugin("plugins/my_plugin.sage", private_key)
let box    = sbox.load_signed(signed, "host.manifest")
```

Use for: production plugin systems where you need to guarantee the plugin code hasn't been modified.

## myst.toml sandbox section

Packages can declare their own sandbox requirements:

```toml
[sandbox]
allow_network   = false
allow_fs_read   = ["data/"]
allow_fs_write  = []
max_memory_mb   = 64
max_cpu_ms      = 5000
```

The host enforces these limits when loading the package inside a LilyBox.
