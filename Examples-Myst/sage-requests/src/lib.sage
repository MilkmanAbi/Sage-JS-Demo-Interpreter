# sage-requests  ✦  HTTP client via libcurl C FFI
#
# Wraps libcurl using Sage's C FFI layer.
# Supports GET, POST, PUT, PATCH, DELETE with headers,
# basic auth, timeouts, and JSON sugar.
#
# Usage:
#   import sage-requests as req
#   let r = req.get("https://api.example.com/users")
#   println(r.status)
#   println(r.text())

import c_ffi
import sage-json as json

let _curl = c_ffi.load("libcurl.so.4")

# curl_easy_* bindings
let _easy_init    = c_ffi.bind(_curl, "curl_easy_init",    "ptr")
let _easy_cleanup = c_ffi.bind(_curl, "curl_easy_cleanup", "void", "ptr")
let _easy_setopt  = c_ffi.bind(_curl, "curl_easy_setopt",  "int",  "ptr", "int", "ptr")
let _easy_perform = c_ffi.bind(_curl, "curl_easy_perform", "int",  "ptr")
let _easy_getinfo = c_ffi.bind(_curl, "curl_easy_getinfo", "int",  "ptr", "int", "ptr")
let _slist_append = c_ffi.bind(_curl, "curl_slist_append", "ptr",  "ptr", "str")
let _slist_free   = c_ffi.bind(_curl, "curl_slist_free_all", "void", "ptr")

# CURLOPT constants (matching libcurl ABI)
let OPT_URL          = 10002
let OPT_POSTFIELDS   = 10015
let OPT_HTTPHEADER   = 10023
let OPT_CUSTOMREQUEST= 10036
let OPT_TIMEOUT_MS   = 155
let OPT_FOLLOWLOC    = 52
let OPT_USERPWD      = 10005
let OPT_WRITEDATA    = 10001
let OPT_WRITEFUNCTION= 20011
let OPT_VERBOSE      = 41
let INFO_RESPONSE_CODE = 0x200002


# ── Response ──────────────────────────────────────────────────────────────────

struct Response:
    status   : int
    body     : str
    headers  : int     # dict[str, str]
    url      : str

impl Response:
    proc ok(self) -> bool:
        return self.status >= 200 and self.status < 300

    proc text(self) -> str:
        return self.body

    proc json(self) -> int:
        return json.loads(self.body)

    proc raise_for_status(self):
        if not self.ok():
            raise "HTTP " + str(self.status) + " error for " + self.url

    proc to_str(self) -> str:
        return "<Response [" + str(self.status) + "] " + self.url + ">"


# ── Session ───────────────────────────────────────────────────────────────────

struct Session:
    base_url : str
    headers  : int   # dict[str, str]
    timeout  : int   # milliseconds
    auth     : str   # "user:pass" or ""
    verify   : bool

impl Session:
    proc set_header(self, key: str, value: str):
        self.headers.set(key, value)

    proc set_auth(self, user: str, password: str):
        self.auth = user + ":" + password

    proc set_timeout(self, ms: int):
        self.timeout = ms

    proc _build_url(self, path: str) -> str:
        if self.base_url == "":
            return path
        if path.starts_with("http://") or path.starts_with("https://"):
            return path
        return self.base_url + path

    proc _perform(self, method: str, url: str, body: str, extra_headers: int) -> Response:
        let full_url = self._build_url(url)
        let handle   = _easy_init()

        if handle == 0:
            raise "curl_easy_init failed — is libcurl installed?"

        defer:
            _easy_cleanup(handle)

        # URL + options
        _easy_setopt(handle, OPT_URL, full_url)
        _easy_setopt(handle, OPT_FOLLOWLOC, 1)
        _easy_setopt(handle, OPT_TIMEOUT_MS, self.timeout)

        if self.auth != "":
            _easy_setopt(handle, OPT_USERPWD, self.auth)

        # Method
        if method == "POST":
            _easy_setopt(handle, OPT_POSTFIELDS, body)
        elif method != "GET":
            _easy_setopt(handle, OPT_CUSTOMREQUEST, method)
            if body != "":
                _easy_setopt(handle, OPT_POSTFIELDS, body)

        # Headers
        var hlist = 0
        for key in self.headers.keys():
            let line = key + ": " + self.headers.get(key)
            hlist = _slist_append(hlist, line)
        for key in extra_headers.keys():
            let line = key + ": " + extra_headers.get(key)
            hlist = _slist_append(hlist, line)

        if hlist != 0:
            _easy_setopt(handle, OPT_HTTPHEADER, hlist)

        defer:
            if hlist != 0:
                _slist_free(hlist)

        # Perform
        let err = _easy_perform(handle)
        if err != 0:
            raise "curl error code " + str(err) + " for " + full_url

        var status_code = 0
        _easy_getinfo(handle, INFO_RESPONSE_CODE, status_code)

        # body captured via write callback — in playground this is emulated
        let response_body = c_ffi.last_write_buffer()

        return Response(status_code, response_body, {}, full_url)

    proc get(self, url: str) -> Response:
        return self._perform("GET", url, "", {})

    proc post(self, url: str, body: str) -> Response:
        return self._perform("POST", url, body, {})

    proc post_json(self, url: str, data: int) -> Response:
        let body = json.dumps(data)
        return self._perform("POST", url, body, {"Content-Type": "application/json"})

    proc put(self, url: str, body: str) -> Response:
        return self._perform("PUT", url, body, {})

    proc put_json(self, url: str, data: int) -> Response:
        let body = json.dumps(data)
        return self._perform("PUT", url, body, {"Content-Type": "application/json"})

    proc patch(self, url: str, body: str) -> Response:
        return self._perform("PATCH", url, body, {})

    proc delete(self, url: str) -> Response:
        return self._perform("DELETE", url, "", {})


# ── Module-level helpers ──────────────────────────────────────────────────────

proc session(base_url: str) -> Session:
    return Session(base_url, {}, 30000, "", true)

proc get(url: str) -> Response:
    let s = session("")
    return s.get(url)

proc post(url: str, body: str) -> Response:
    let s = session("")
    return s.post(url, body)

proc post_json(url: str, data: int) -> Response:
    let s = session("")
    return s.post_json(url, data)

proc put(url: str, body: str) -> Response:
    let s = session("")
    return s.put(url, body)

proc delete(url: str) -> Response:
    let s = session("")
    return s.delete(url)
