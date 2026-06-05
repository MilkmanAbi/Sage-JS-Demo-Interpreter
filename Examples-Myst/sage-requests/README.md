# sage-requests

HTTP client for Sage, wrapping **libcurl** via the C FFI layer.

```toml
[dependencies]
sage-requests = { git = "https://github.com/MilkmanAbi/Sage-Playground", path = "Examples-Myst/sage-requests", rev = "main" }
```

## Quick start

```sage
import sage-requests as req

let r = req.get("https://api.example.com/users/1")
r.raise_for_status()
let user = r.json()
println(user.get("name"))
```

## API

### One-shot helpers

```sage
req.get(url)
req.post(url, body)
req.post_json(url, data)   # serialises dict to JSON, sets Content-Type
req.put(url, body)
req.delete(url)
```

### Session (recommended for multi-request use)

```sage
let s = req.session("https://api.example.com")
s.set_header("Authorization", "Bearer " + token)
s.set_auth("user", "password")   # HTTP Basic
s.set_timeout(5000)              # ms

let r = s.get("/users")
let r = s.post_json("/users", {name: "Ada"})
```

### Response

```sage
r.status          # int — HTTP status code
r.ok()            # bool — 2xx
r.text()          # str — raw body
r.json()          # dict — parsed JSON body
r.raise_for_status()  # raises on 4xx / 5xx
r.headers         # dict[str, str]
```

## How the FFI works

```sage
import c_ffi

let _curl         = c_ffi.load("libcurl.so.4")
let _easy_init    = c_ffi.bind(_curl, "curl_easy_init", "ptr")
let _easy_perform = c_ffi.bind(_curl, "curl_easy_perform", "int", "ptr")
```

`c_ffi.load` calls `dlopen`, `c_ffi.bind` resolves the symbol via `dlsym` and wraps it in
a Sage-callable that handles marshalling of primitive types and pointers.
