# sage-redis  ✦  Redis client via hiredis C FFI
#
# Wraps hiredis (synchronous C client) using Sage's C FFI layer.
# Supports strings, hashes, lists, sorted sets, pub/sub, pipelines,
# and TTL operations.
#
# Usage:
#   import sage-redis as redis
#   let r = redis.connect("127.0.0.1", 6379)
#   r.set("greeting", "hello from sage")
#   println(r.get("greeting"))

import c_ffi

let _hiredis = c_ffi.load("libhiredis.so.1")

# hiredis core bindings
let _connect      = c_ffi.bind(_hiredis, "redisConnect",        "ptr",  "str", "int")
let _connect_tls  = c_ffi.bind(_hiredis, "redisConnectWithTimeout", "ptr", "str", "int", "ptr")
let _free_ctx     = c_ffi.bind(_hiredis, "redisFree",            "void", "ptr")
let _command      = c_ffi.bind(_hiredis, "redisCommand",         "ptr",  "ptr", "str")
let _free_reply   = c_ffi.bind(_hiredis, "freeReplyObject",      "void", "ptr")
let _pipeline_cmd = c_ffi.bind(_hiredis, "redisAppendCommand",   "int",  "ptr", "str")
let _pipeline_get = c_ffi.bind(_hiredis, "redisGetReply",        "int",  "ptr", "ptr")

# Reply type constants
let REPLY_STRING  = 1
let REPLY_ARRAY   = 2
let REPLY_INTEGER = 3
let REPLY_NIL     = 4
let REPLY_STATUS  = 5
let REPLY_ERROR   = 6


# ── RedisError ────────────────────────────────────────────────────────────────

proc redis_error(msg: str):
    raise "RedisError: " + msg


# ── Client ────────────────────────────────────────────────────────────────────

struct Client:
    _ctx  : int   # redisContext*
    host  : str
    port  : int
    _open : bool

impl Client:

    # ── lifecycle ─────────────────────────────────────────────────────────

    proc close(self):
        if self._open:
            _free_ctx(self._ctx)
            self._open = false

    proc ping(self) -> bool:
        let r = self._cmd("PING")
        return r == "PONG"

    proc select(self, db: int):
        self._cmd_ok("SELECT " + str(db))

    # ── internal ──────────────────────────────────────────────────────────

    proc _cmd(self, cmd: str) -> str:
        if not self._open:
            redis_error("connection is closed")
        let reply = _command(self._ctx, cmd)
        if reply == 0:
            redis_error("null reply from hiredis — connection lost?")
        defer:
            _free_reply(reply)
        return c_ffi.reply_str(reply)

    proc _cmd_ok(self, cmd: str):
        let r = self._cmd(cmd)
        if r != "OK":
            redis_error("expected OK, got: " + r)

    proc _cmd_int(self, cmd: str) -> int:
        if not self._open:
            redis_error("connection is closed")
        let reply = _command(self._ctx, cmd)
        defer:
            _free_reply(reply)
        return c_ffi.reply_int(reply)

    # ── strings ───────────────────────────────────────────────────────────

    proc set(self, key: str, value: str):
        self._cmd_ok("SET " + key + " " + value)

    proc set_ex(self, key: str, value: str, ttl_sec: int):
        self._cmd_ok("SET " + key + " " + value + " EX " + str(ttl_sec))

    proc set_px(self, key: str, value: str, ttl_ms: int):
        self._cmd_ok("SET " + key + " " + value + " PX " + str(ttl_ms))

    proc set_nx(self, key: str, value: str) -> bool:
        let r = self._cmd("SET " + key + " " + value + " NX")
        return r == "OK"

    proc get(self, key: str) -> str:
        return self._cmd("GET " + key)

    proc getset(self, key: str, value: str) -> str:
        return self._cmd("GETSET " + key + " " + value)

    proc mset(self, pairs: int):
        var cmd = "MSET"
        for key in pairs.keys():
            cmd = cmd + " " + key + " " + pairs.get(key)
        self._cmd_ok(cmd)

    proc mget(self, keys: int) -> int:
        var cmd = "MGET"
        for k in keys:
            cmd = cmd + " " + k
        return self._cmd(cmd)   # returns array reply as list

    proc incr(self, key: str) -> int:
        return self._cmd_int("INCR " + key)

    proc incrby(self, key: str, n: int) -> int:
        return self._cmd_int("INCRBY " + key + " " + str(n))

    proc decr(self, key: str) -> int:
        return self._cmd_int("DECR " + key)

    proc append(self, key: str, value: str) -> int:
        return self._cmd_int("APPEND " + key + " " + value)

    # ── key management ────────────────────────────────────────────────────

    proc exists(self, key: str) -> bool:
        return self._cmd_int("EXISTS " + key) == 1

    proc del(self, key: str) -> int:
        return self._cmd_int("DEL " + key)

    proc expire(self, key: str, ttl_sec: int):
        self._cmd_int("EXPIRE " + key + " " + str(ttl_sec))

    proc pexpire(self, key: str, ttl_ms: int):
        self._cmd_int("PEXPIRE " + key + " " + str(ttl_ms))

    proc ttl(self, key: str) -> int:
        return self._cmd_int("TTL " + key)

    proc type(self, key: str) -> str:
        return self._cmd("TYPE " + key)

    proc rename(self, key: str, new_key: str):
        self._cmd_ok("RENAME " + key + " " + new_key)

    proc keys(self, pattern: str) -> int:
        return self._cmd("KEYS " + pattern)

    # ── hashes ────────────────────────────────────────────────────────────

    proc hset(self, key: str, field: str, value: str):
        self._cmd_int("HSET " + key + " " + field + " " + value)

    proc hget(self, key: str, field: str) -> str:
        return self._cmd("HGET " + key + " " + field)

    proc hmset(self, key: str, mapping: int):
        var cmd = "HMSET " + key
        for f in mapping.keys():
            cmd = cmd + " " + f + " " + mapping.get(f)
        self._cmd_ok(cmd)

    proc hgetall(self, key: str) -> int:
        # returns dict built from flat list reply [field, value, field, value…]
        return self._cmd("HGETALL " + key)

    proc hdel(self, key: str, field: str) -> int:
        return self._cmd_int("HDEL " + key + " " + field)

    proc hexists(self, key: str, field: str) -> bool:
        return self._cmd_int("HEXISTS " + key + " " + field) == 1

    proc hlen(self, key: str) -> int:
        return self._cmd_int("HLEN " + key)

    proc hincrby(self, key: str, field: str, n: int) -> int:
        return self._cmd_int("HINCRBY " + key + " " + field + " " + str(n))

    # ── lists ─────────────────────────────────────────────────────────────

    proc lpush(self, key: str, *values) -> int:
        var cmd = "LPUSH " + key
        for v in values:
            cmd = cmd + " " + v
        return self._cmd_int(cmd)

    proc rpush(self, key: str, *values) -> int:
        var cmd = "RPUSH " + key
        for v in values:
            cmd = cmd + " " + v
        return self._cmd_int(cmd)

    proc lpop(self, key: str) -> str:
        return self._cmd("LPOP " + key)

    proc rpop(self, key: str) -> str:
        return self._cmd("RPOP " + key)

    proc llen(self, key: str) -> int:
        return self._cmd_int("LLEN " + key)

    proc lrange(self, key: str, start: int, stop: int) -> int:
        return self._cmd("LRANGE " + key + " " + str(start) + " " + str(stop))

    proc lindex(self, key: str, idx: int) -> str:
        return self._cmd("LINDEX " + key + " " + str(idx))

    # ── sorted sets ───────────────────────────────────────────────────────

    proc zadd(self, key: str, score: float, member: str) -> int:
        return self._cmd_int("ZADD " + key + " " + str(score) + " " + member)

    proc zrange(self, key: str, start: int, stop: int) -> int:
        return self._cmd("ZRANGE " + key + " " + str(start) + " " + str(stop))

    proc zrank(self, key: str, member: str) -> int:
        return self._cmd_int("ZRANK " + key + " " + member)

    proc zscore(self, key: str, member: str) -> float:
        return float(self._cmd("ZSCORE " + key + " " + member))

    proc zcard(self, key: str) -> int:
        return self._cmd_int("ZCARD " + key)

    # ── pub/sub ───────────────────────────────────────────────────────────

    proc publish(self, channel: str, message: str) -> int:
        return self._cmd_int("PUBLISH " + channel + " " + message)

    # ── pipeline ──────────────────────────────────────────────────────────

    proc pipeline(self) -> int:
        return Pipeline(self._ctx, [])

    # ── misc ─────────────────────────────────────────────────────────────

    proc flushdb(self):
        self._cmd_ok("FLUSHDB")

    proc dbsize(self) -> int:
        return self._cmd_int("DBSIZE")

    proc info(self, section: str) -> str:
        if section == "":
            return self._cmd("INFO")
        return self._cmd("INFO " + section)


# ── Pipeline ──────────────────────────────────────────────────────────────────

struct Pipeline:
    _ctx  : int
    _cmds : int   # list[str]

impl Pipeline:
    proc queue(self, cmd: str):
        self._cmds.push(cmd)

    proc execute(self) -> int:
        # Send all queued commands at once, collect replies
        for cmd in self._cmds:
            _pipeline_cmd(self._ctx, cmd)

        let replies = []
        for i in range(0, len(self._cmds)):
            let reply = _pipeline_get(self._ctx)
            replies.push(c_ffi.reply_str(reply))
            _free_reply(reply)

        self._cmds.clear()
        return replies


# ── Module entry ──────────────────────────────────────────────────────────────

proc connect(host: str, port: int) -> Client:
    let ctx = _connect(host, port)
    if ctx == 0:
        raise "RedisError: could not connect to " + host + ":" + str(port)

    let err_flag = c_ffi.ctx_err(ctx)
    if err_flag != 0:
        _free_ctx(ctx)
        raise "RedisError: " + c_ffi.ctx_errmsg(ctx)

    return Client(ctx, host, port, true)

proc connect_default() -> Client:
    return connect("127.0.0.1", 6379)
