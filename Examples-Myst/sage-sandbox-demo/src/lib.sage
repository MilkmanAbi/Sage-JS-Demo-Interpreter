# sage-sandbox-demo  ✦  LilyBox sandboxing patterns
#
# LilyBox is Sage's process-isolation sandbox.
# It wraps a child Sage process with:
#   - capability-based filesystem access  (only declared paths)
#   - network isolation  (off by default)
#   - memory + CPU caps
#   - signed manifests  (optional — prevents tampered plugins)
#
# This module shows three patterns:
#   1. PluginHost   — loads untrusted plugins safely
#   2. DataPipeline — runs heavy processing in a capped sandbox
#   3. SecureEval   — evaluates user-supplied Sage code safely

import sandbox
import sage-json as json
import sage-crypto as crypto
import sage-io    as io


# ── 1. PluginHost ─────────────────────────────────────────────────────────────
#
# A PluginHost loads plugin .sage files from a directory.
# Each plugin runs in its own LilyBox with strict resource caps.
# The host communicates with the plugin over a message-passing channel.

struct PluginHost:
    plugin_dir : str
    manifest   : str   # path to .manifest file
    plugins    : int   # dict[str, box_handle]

impl PluginHost:
    proc load(self, name: str):
        let plugin_path = self.plugin_dir + "/" + name + ".sage"

        if not io.exists(plugin_path):
            raise "plugin not found: " + plugin_path

        # Create a LilyBox with explicit capability grants
        let box = sandbox.create(self.manifest)
        sandbox.grant_read(box, "data/")          # read-only data dir
        sandbox.set_memory_cap(box, 64)           # 64 MB
        sandbox.set_cpu_cap(box, 2000)            # 2 s of CPU

        # Run the plugin entry point
        let result = sandbox.run(box, plugin_path)

        if not result.ok:
            sandbox.close(box)
            raise "plugin " + name + " failed to load: " + result.error

        self.plugins.set(name, box)
        println("  loaded plugin: " + name)

    proc call(self, name: str, method: str, args: int) -> int:
        if not self.plugins.has(name):
            raise "plugin not loaded: " + name

        let box = self.plugins.get(name)
        let msg = json.dumps({method: method, args: args})

        let result = sandbox.send(box, msg)

        if result.error != "":
            raise "plugin error: " + result.error

        return json.loads(result.stdout)

    proc unload(self, name: str):
        if self.plugins.has(name):
            sandbox.close(self.plugins.get(name))
            self.plugins.delete(name)

    proc unload_all(self):
        for name in self.plugins.keys():
            sandbox.close(self.plugins.get(name))
        self.plugins.clear()


proc plugin_host(plugin_dir: str, manifest: str) -> PluginHost:
    return PluginHost(plugin_dir, manifest, {})


# ── 2. DataPipeline ───────────────────────────────────────────────────────────
#
# Runs an arbitrary transformation function on a dataset inside a
# memory-capped sandbox. If the transform exceeds the cap, it is
# killed and the host gets an error — the host process is unaffected.

struct PipelineResult:
    ok      : bool
    data    : int
    error   : str
    cpu_ms  : int
    mem_peak_mb : float

impl PipelineResult:
    proc to_str(self) -> str:
        if self.ok:
            return "PipelineResult(ok, cpu=" + str(self.cpu_ms) + "ms, mem=" + str(self.mem_peak_mb) + "MB)"
        return "PipelineResult(err=" + self.error + ")"

proc run_in_sandbox(transform_file: str, input_json: int,
                    memory_mb: int, cpu_ms: int) -> PipelineResult:
    let box = sandbox.create("pipeline.manifest")
    sandbox.set_memory_cap(box, memory_mb)
    sandbox.set_cpu_cap(box, cpu_ms)
    sandbox.grant_read(box, "data/")

    # Write input to sandbox stdin channel
    let input_str = json.dumps(input_json)
    let result    = sandbox.run_with_input(box, transform_file, input_str)

    defer:
        sandbox.close(box)

    if not result.ok:
        return PipelineResult(false, {}, result.error, result.cpu_ms, result.mem_mb)

    let output = json.loads(result.stdout)
    return PipelineResult(true, output, "", result.cpu_ms, result.mem_mb)


# ── 3. SecureEval ─────────────────────────────────────────────────────────────
#
# Evaluates user-supplied Sage code safely.
# The code gets no filesystem access and is killed after 1 second.
# Useful for online playgrounds, notebook cells, contest judges.

struct EvalResult:
    ok     : bool
    stdout : str
    stderr : str
    error  : str

impl EvalResult:
    proc to_str(self) -> str:
        if self.ok:
            return self.stdout
        return "error: " + self.error + "\n" + self.stderr

proc secure_eval(code: str, memory_mb: int, timeout_ms: int) -> EvalResult:
    let box = sandbox.create("eval.manifest")

    # No filesystem access at all — completely isolated
    sandbox.set_memory_cap(box, memory_mb)
    sandbox.set_cpu_cap(box, timeout_ms)
    sandbox.deny_network(box)
    sandbox.deny_fs(box)

    let result = sandbox.eval_code(box, code)

    defer:
        sandbox.close(box)

    return EvalResult(result.ok, result.stdout, result.stderr, result.error)


# ── 4. SignedPlugin ───────────────────────────────────────────────────────────
#
# Demonstrates manifest signing so the host can reject tampered plugins.

struct SignedPlugin:
    path      : str
    signature : str
    public_key: str

impl SignedPlugin:
    proc verify(self) -> bool:
        let code = io.read_file(self.path)
        return crypto.ed25519_verify(
            self.public_key,
            code,
            self.signature,
        )

proc sign_plugin(path: str, private_key: str) -> SignedPlugin:
    let code = io.read_file(path)
    let sig  = crypto.ed25519_sign(private_key, code)
    let pub  = crypto.ed25519_public_key(private_key)
    return SignedPlugin(path, sig, pub)

proc load_signed(plugin: SignedPlugin, manifest: str) -> int:
    if not plugin.verify():
        raise "plugin signature verification failed: " + plugin.path

    let box = sandbox.create(manifest)
    let result = sandbox.run(box, plugin.path)

    if not result.ok:
        sandbox.close(box)
        raise "signed plugin failed: " + result.error

    return box
