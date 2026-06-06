# sage-pandas

pandas DataFrame bindings for Sage via the Python FFI layer.

```toml
[dependencies]
sage-pandas = { git = "https://github.com/MilkmanAbi/Sage-Playground", path = "Examples-Myst/sage-pandas", rev = "main" }
```

## Quick start

```sage
import sage-pandas as pd

let df = pd.read_csv("data.csv")
println(df.head(5).to_str())

let avg = df.col("price").mean()
let top = df.sort("price", false).head(10)
let by_cat = df.groupby("category").sum()
```

## Key types

- **`DataFrame`** — 2D labelled table
- **`Series`** — single column / 1D array
- **`GroupBy`** — grouped-aggregation context

## API highlights

```sage
# I/O
pd.read_csv(path)
pd.read_json(path)
pd.from_dict(data)

# Inspect
df.head(n) / df.tail(n) / df.sample(n)
df.describe()
df.col(name)          -> Series
df.columns()          -> list[str]
df.shape              -> [rows, cols]

# Filter & sort
df.query("col > 10")
df.filter(mask)
df.sort(by, ascending)
df.drop_duplicates()

# Aggregation
df.groupby(col).mean()
df.groupby(col).agg({col: "sum", ...})
df.pivot_table(values, index, aggfunc)

# Reshape
df.merge(other, on, how)
df.melt(id_vars, value_vars)
pd.concat_dfs([df1, df2], axis)

# Export
df.to_csv(path)
df.to_dict()
```
