# sage-requests  ✦  example usage
#
# Run with:  myst run examples/main.sage

import sage-requests as req

# ── Simple GET ────────────────────────────────────────────────────────────────

let r = req.get("https://httpbin.org/get")
println("status  : " + str(r.status))
println("ok      : " + str(r.ok()))
println("")

# ── JSON POST ─────────────────────────────────────────────────────────────────

let payload = {
    title:  "Learn Sage FFI",
    body:   "Wrap native libs in a few lines",
    userId: 1,
}

let post_r = req.post_json("https://jsonplaceholder.typicode.com/posts", payload)
post_r.raise_for_status()
let created = post_r.json()
println("created post id: " + str(created.get("id")))
println("")

# ── Session with base URL + auth ──────────────────────────────────────────────

let s = req.session("https://api.github.com")
s.set_header("Accept", "application/vnd.github+json")
s.set_header("X-GitHub-Api-Version", "2022-11-28")
s.set_timeout(10000)

let profile = s.get("/users/MilkmanAbi")
if profile.ok():
    let data = profile.json()
    println("github user  : " + data.get("login"))
    println("public repos : " + str(data.get("public_repos")))
else:
    println("request failed: " + str(profile.status))
println("")

# ── Error handling ────────────────────────────────────────────────────────────

try:
    let bad = req.get("https://httpbin.org/status/404")
    bad.raise_for_status()
catch e:
    println("caught expected error: " + e)

# ── DELETE + status check ─────────────────────────────────────────────────────

let del_r = req.delete("https://jsonplaceholder.typicode.com/posts/1")
println("delete status: " + str(del_r.status))
