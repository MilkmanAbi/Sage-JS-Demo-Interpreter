# sage-pandas  ✦  example usage
#
# Run with:  myst run examples/main.sage

import sage-pandas as pd

# ── Build a DataFrame from a dict ─────────────────────────────────────────────

let df = pd.from_dict({
    name:       ["Alice", "Bob", "Carol", "Dave", "Eve"],
    department: ["Eng",   "Eng", "Sales", "Sales", "Eng"],
    salary:     [92000,   88000, 74000,   71000,   95000],
    years:      [5,       3,     7,       2,       6],
})

println("── raw data ──")
println(df.to_str())
println("")

println("shape   : " + str(df.shape))
println("columns : " + str(df.columns()))
println("")

# ── Column access + basic stats ───────────────────────────────────────────────

let salaries = df.col("salary")
println("── salary stats ──")
println("mean   : " + str(salaries.mean()))
println("median : " + str(salaries.median()))
println("std    : " + str(salaries.std()))
println("min    : " + str(salaries.min()))
println("max    : " + str(salaries.max()))
println("")

# ── Filter ────────────────────────────────────────────────────────────────────

let eng = df.query("department == 'Eng'")
println("── engineering team ──")
println(eng.to_str())
println("")

# ── Sort ──────────────────────────────────────────────────────────────────────

let ranked = df.sort("salary", false)   # descending
println("── sorted by salary ──")
println(ranked.head(3).to_str())
println("")

# ── groupby + aggregation ─────────────────────────────────────────────────────

let by_dept = df.groupby("department")
println("── avg salary by department ──")
println(by_dept.mean().to_str())
println("")

println("── headcount by department ──")
println(by_dept.count().to_str())
println("")

# ── Add a computed column ─────────────────────────────────────────────────────

let salary_per_year = df.col("salary").apply(proc(s):
    return s / 1000.0
)
let df2 = df.set_col("salary_k", salary_per_year)
println("── with salary in thousands ──")
println(df2.cols(["name", "department", "salary_k"]).to_str())
println("")

# ── Read from CSV (real path on disk) ─────────────────────────────────────────

# let sales = pd.read_csv("data/sales.csv")
# println(sales.describe().to_str())

# ── Merge two DataFrames ──────────────────────────────────────────────────────

let dept_info = pd.from_dict({
    department: ["Eng", "Sales"],
    office:     ["Berlin", "London"],
})

let merged = df.merge(dept_info, "department", "left")
println("── merged with office info ──")
println(merged.to_str())
