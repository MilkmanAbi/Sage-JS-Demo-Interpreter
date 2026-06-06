import sage-json as json

let obj = json.loads("{\"name\": \"sage\", \"stars\": 5, \"tags\": [\"fast\", \"typed\"]}")
println("name  = " + obj.get("name"))
println("stars = " + str(obj.get("stars")))
println("round-trip: " + json.dumps(obj))
