# sage-redis  ✦  example usage
#
# Run with:  myst run examples/main.sage
# Requires:  Redis running on localhost:6379

import sage-redis as redis

let r = redis.connect_default()
println("ping → " + str(r.ping()))
println("")

# ── Strings ───────────────────────────────────────────────────────────────────

r.set("lang", "sage")
println("lang          = " + r.get("lang"))

r.set_ex("session:abc123", "{user:42}", 3600)
println("session ttl   = " + str(r.ttl("session:abc123")) + "s")
println("")

# ── Counters ──────────────────────────────────────────────────────────────────

r.set("visits", "0")
r.incr("visits")
r.incr("visits")
r.incrby("visits", 10)
println("visits        = " + r.get("visits"))
println("")

# ── Hashes ────────────────────────────────────────────────────────────────────

r.hmset("user:1", {
    name:  "Ada_Lovelace",
    email: "ada@example.com",
    score: "9900",
})

println("user:1 name   = " + r.hget("user:1", "name"))
println("user:1 fields = " + str(r.hlen("user:1")))
r.hincrby("user:1", "score", 100)
println("user:1 score  = " + r.hget("user:1", "score"))
println("")

# ── Lists ─────────────────────────────────────────────────────────────────────

r.rpush("queue", "task:1", "task:2", "task:3")
println("queue length  = " + str(r.llen("queue")))
println("pop           = " + r.lpop("queue"))
println("queue length  = " + str(r.llen("queue")))
println("")

# ── Sorted sets (leaderboard) ─────────────────────────────────────────────────

r.zadd("leaderboard", 9900.0, "ada")
r.zadd("leaderboard", 8400.0, "grace")
r.zadd("leaderboard", 7750.0, "alan")

let top3 = r.zrange("leaderboard", 0, 2)
println("leaderboard top 3:")
for name in top3:
    let score = r.zscore("leaderboard", name)
    println("  " + name + "  " + str(score))
println("")

# ── Pipeline ──────────────────────────────────────────────────────────────────

let pipe = r.pipeline()
pipe.queue("SET temp:a 100")
pipe.queue("SET temp:b 200")
pipe.queue("INCR temp:a")
pipe.queue("INCR temp:b")
let results = pipe.execute()
println("pipeline results: " + str(results))
println("")

# ── Cleanup ───────────────────────────────────────────────────────────────────

r.del("lang")
r.del("visits")
r.del("user:1")
r.del("queue")
r.del("leaderboard")
r.close()
println("done  ✦")
