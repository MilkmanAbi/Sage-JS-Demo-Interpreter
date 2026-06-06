# sage-redis

Redis client for Sage, wrapping **hiredis** via the C FFI layer.
Covers strings, hashes, lists, sorted sets, pub/sub, and pipelines.

```toml
[dependencies]
sage-redis = { git = "https://github.com/MilkmanAbi/Sage-Playground", path = "Examples-Myst/sage-redis", rev = "main" }
```

## Quick start

```sage
import sage-redis as redis

let r = redis.connect("127.0.0.1", 6379)
r.set("key", "value")
println(r.get("key"))
r.close()
```

## API highlights

```sage
# Strings
r.set(key, value)
r.set_ex(key, value, ttl_sec)
r.get(key) -> str
r.incr(key) -> int
r.mset({a: "1", b: "2"})

# Hashes
r.hmset(key, {field: value, ...})
r.hget(key, field) -> str
r.hgetall(key) -> dict
r.hincrby(key, field, n) -> int

# Lists
r.lpush(key, *values) -> int
r.rpush(key, *values) -> int
r.lrange(key, 0, -1) -> list[str]

# Sorted sets
r.zadd(key, score, member) -> int
r.zrange(key, 0, -1) -> list[str]
r.zscore(key, member) -> float

# Keys
r.exists(key) -> bool
r.expire(key, ttl_sec)
r.ttl(key) -> int
r.del(key) -> int

# Pipeline
let pipe = r.pipeline()
pipe.queue("SET x 1")
pipe.queue("INCR x")
let results = pipe.execute()  # list[str]
```
