# sage-pandas  ✦  pandas DataFrame bindings for Sage
#
# Wraps pandas via the Python FFI layer.
# Gives DataFrames a Sage-idiomatic API: struct-based types,
# method chaining, pattern-matched error handling.
#
# Usage:
#   import sage-pandas as pd
#   let df = pd.read_csv("sales.csv")
#   println(df.head(5).to_str())

import python

let _pd = python.import("pandas")
let _np = python.import("numpy")


# ── Series ────────────────────────────────────────────────────────────────────

struct Series:
    _handle : int
    name    : str

impl Series:
    proc to_str(self) -> str:
        return _pd.series_str(self._handle)

    proc len(self) -> int:
        return _pd.series_len(self._handle)

    proc dtype(self) -> str:
        return _pd.series_dtype(self._handle)

    proc head(self, n: int) -> Series:
        return Series(_pd.series_head(self._handle, n), self.name)

    proc tail(self, n: int) -> Series:
        return Series(_pd.series_tail(self._handle, n), self.name)

    # aggregations
    proc sum(self) -> float:
        return _pd.series_sum(self._handle)

    proc mean(self) -> float:
        return _pd.series_mean(self._handle)

    proc median(self) -> float:
        return _pd.series_median(self._handle)

    proc std(self) -> float:
        return _pd.series_std(self._handle)

    proc min(self) -> float:
        return _pd.series_min(self._handle)

    proc max(self) -> float:
        return _pd.series_max(self._handle)

    proc nunique(self) -> int:
        return _pd.series_nunique(self._handle)

    proc value_counts(self) -> Series:
        return Series(_pd.series_value_counts(self._handle), "count")

    # transforms
    proc sort(self, ascending: bool) -> Series:
        return Series(_pd.series_sort(self._handle, ascending), self.name)

    proc unique(self) -> Series:
        return Series(_pd.series_unique(self._handle), self.name)

    proc fillna(self, value: str) -> Series:
        return Series(_pd.series_fillna(self._handle, value), self.name)

    proc dropna(self) -> Series:
        return Series(_pd.series_dropna(self._handle), self.name)

    proc astype(self, dtype: str) -> Series:
        return Series(_pd.series_astype(self._handle, dtype), self.name)

    proc apply(self, fn: int) -> Series:
        # fn: proc(x) -> x  — applied element-wise via Python callback
        return Series(_pd.series_apply(self._handle, fn), self.name)

    proc to_list(self) -> int:
        return _pd.series_to_list(self._handle)


# ── DataFrame ─────────────────────────────────────────────────────────────────

struct DataFrame:
    _handle : int
    shape   : int    # [rows, cols]

impl DataFrame:

    # ── inspection ────────────────────────────────────────────────────────

    proc to_str(self) -> str:
        return _pd.df_str(self._handle)

    proc info(self) -> str:
        return _pd.df_info(self._handle)

    proc describe(self) -> DataFrame:
        return DataFrame(_pd.df_describe(self._handle), [])

    proc dtypes(self) -> Series:
        return Series(_pd.df_dtypes(self._handle), "dtype")

    proc columns(self) -> int:
        return _pd.df_columns(self._handle)

    proc index(self) -> Series:
        return Series(_pd.df_index(self._handle), "index")

    proc nrows(self) -> int:
        return self.shape[0]

    proc ncols(self) -> int:
        return self.shape[1]

    proc memory_usage(self) -> int:
        return _pd.df_memory_usage(self._handle)

    # ── selection ─────────────────────────────────────────────────────────

    proc col(self, name: str) -> Series:
        return Series(_pd.df_col(self._handle, name), name)

    proc cols(self, names: int) -> DataFrame:
        return DataFrame(_pd.df_cols(self._handle, names), [])

    proc row(self, idx: int) -> Series:
        return Series(_pd.df_iloc(self._handle, idx), "")

    proc head(self, n: int) -> DataFrame:
        return DataFrame(_pd.df_head(self._handle, n), [n, self.shape[1]])

    proc tail(self, n: int) -> DataFrame:
        return DataFrame(_pd.df_tail(self._handle, n), [n, self.shape[1]])

    proc sample(self, n: int) -> DataFrame:
        return DataFrame(_pd.df_sample(self._handle, n), [n, self.shape[1]])

    proc filter(self, mask: Series) -> DataFrame:
        return DataFrame(_pd.df_filter(self._handle, mask._handle), [])

    proc query(self, expr: str) -> DataFrame:
        return DataFrame(_pd.df_query(self._handle, expr), [])

    proc slice(self, start: int, stop: int) -> DataFrame:
        return DataFrame(_pd.df_slice(self._handle, start, stop), [])

    # ── mutation ──────────────────────────────────────────────────────────

    proc set_col(self, name: str, series: Series) -> DataFrame:
        return DataFrame(_pd.df_set_col(self._handle, name, series._handle), self.shape)

    proc drop_col(self, name: str) -> DataFrame:
        return DataFrame(_pd.df_drop_col(self._handle, name), [])

    proc rename(self, mapping: int) -> DataFrame:
        return DataFrame(_pd.df_rename(self._handle, mapping), self.shape)

    proc sort(self, by: str, ascending: bool) -> DataFrame:
        return DataFrame(_pd.df_sort(self._handle, by, ascending), self.shape)

    proc drop_duplicates(self) -> DataFrame:
        return DataFrame(_pd.df_drop_duplicates(self._handle), [])

    proc reset_index(self) -> DataFrame:
        return DataFrame(_pd.df_reset_index(self._handle), self.shape)

    proc set_index(self, col: str) -> DataFrame:
        return DataFrame(_pd.df_set_index(self._handle, col), self.shape)

    # ── missing values ────────────────────────────────────────────────────

    proc dropna(self) -> DataFrame:
        return DataFrame(_pd.df_dropna(self._handle), [])

    proc fillna(self, value: str) -> DataFrame:
        return DataFrame(_pd.df_fillna(self._handle, value), self.shape)

    proc isna(self) -> DataFrame:
        return DataFrame(_pd.df_isna(self._handle), self.shape)

    # ── aggregation ───────────────────────────────────────────────────────

    proc groupby(self, by: str) -> int:
        return GroupBy(_pd.df_groupby(self._handle, by), by)

    proc agg(self, ops: int) -> DataFrame:
        # ops: dict[str, str]  e.g. {sales: "sum", age: "mean"}
        return DataFrame(_pd.df_agg(self._handle, ops), [])

    proc pivot_table(self, values: str, index: str, aggfunc: str) -> DataFrame:
        return DataFrame(_pd.df_pivot(self._handle, values, index, aggfunc), [])

    # ── join / reshape ────────────────────────────────────────────────────

    proc merge(self, other: DataFrame, on: str, how: str) -> DataFrame:
        return DataFrame(_pd.df_merge(self._handle, other._handle, on, how), [])

    proc concat(self, other: DataFrame) -> DataFrame:
        return DataFrame(_pd.df_concat(self._handle, other._handle), [])

    proc melt(self, id_vars: int, value_vars: int) -> DataFrame:
        return DataFrame(_pd.df_melt(self._handle, id_vars, value_vars), [])

    proc pivot(self, index: str, columns: str, values: str) -> DataFrame:
        return DataFrame(_pd.df_pivot_no_agg(self._handle, index, columns, values), [])

    # ── export ────────────────────────────────────────────────────────────

    proc to_csv(self, path: str):
        _pd.df_to_csv(self._handle, path)

    proc to_json(self, path: str):
        _pd.df_to_json(self._handle, path)

    proc to_dict(self) -> int:
        return _pd.df_to_dict(self._handle)

    proc to_records(self) -> int:
        return _pd.df_to_records(self._handle)


# ── GroupBy ───────────────────────────────────────────────────────────────────

struct GroupBy:
    _handle : int
    by      : str

impl GroupBy:
    proc sum(self) -> DataFrame:
        return DataFrame(_pd.gb_sum(self._handle), [])

    proc mean(self) -> DataFrame:
        return DataFrame(_pd.gb_mean(self._handle), [])

    proc count(self) -> DataFrame:
        return DataFrame(_pd.gb_count(self._handle), [])

    proc min(self) -> DataFrame:
        return DataFrame(_pd.gb_min(self._handle), [])

    proc max(self) -> DataFrame:
        return DataFrame(_pd.gb_max(self._handle), [])

    proc agg(self, ops: int) -> DataFrame:
        return DataFrame(_pd.gb_agg(self._handle, ops), [])

    proc size(self) -> Series:
        return Series(_pd.gb_size(self._handle), "size")


# ── Module-level I/O ──────────────────────────────────────────────────────────

proc read_csv(path: str) -> DataFrame:
    let h = _pd.read_csv(path)
    return DataFrame(h, _pd.df_shape(h))

proc read_csv_opts(path: str, sep: str, header: int, nrows: int) -> DataFrame:
    let h = _pd.read_csv_opts(path, sep, header, nrows)
    return DataFrame(h, _pd.df_shape(h))

proc read_json(path: str) -> DataFrame:
    let h = _pd.read_json(path)
    return DataFrame(h, _pd.df_shape(h))

proc read_excel(path: str, sheet: str) -> DataFrame:
    let h = _pd.read_excel(path, sheet)
    return DataFrame(h, _pd.df_shape(h))

proc from_dict(data: int) -> DataFrame:
    let h = _pd.df_from_dict(data)
    return DataFrame(h, _pd.df_shape(h))

proc from_records(records: int, columns: int) -> DataFrame:
    let h = _pd.df_from_records(records, columns)
    return DataFrame(h, _pd.df_shape(h))

proc concat_dfs(dfs: int, axis: int) -> DataFrame:
    let handles = dfs.map(proc(df): return df._handle)
    let h = _pd.concat_list(handles, axis)
    return DataFrame(h, [])
