# sage-json  ✦  JSON encode/decode for Sage
#
# Thin wrapper over the platform JSON codec (Python's json via FFI in this
# build). Provides dumps/loads plus a couple of conveniences.
#
# Usage:
#   import sage-json as json
#   let obj = json.loads("{\"id\": 42, \"ok\": true}")
#   println(str(obj.get("id")))
#   println(json.dumps(obj))

import python

let _json = python.import("json")

proc loads(text: str):
    # parse a JSON string into Sage values (dict / list / scalars)
    return _json.loads(text)

proc dumps(value) -> str:
    # serialise a Sage value to a JSON string
    return _json.dumps(value)

proc parse(text: str):
    return _json.loads(text)

proc stringify(value) -> str:
    return _json.dumps(value)
