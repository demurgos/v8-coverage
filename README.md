# V8 coverage 

This repository contains helper functions to manipulate V8 coverage files.
- Stable features:
  - Clone: Perform deep copies of V8 coverages
  - Merge: Merge multiple V8 coverages into a single one. The merge does not
    rely on the source text.
- Unstable:
  - Normalization: Normalize a V8 coverage by sorting it's item and fusing
    some ranges. Requires more tests before being exposed.
- Planned (unavailable yet):
  - Test validity: Check if a JS object is a valid V8 coverage.
  - Diff: Opposite of merge: get the difference between two coverages
  - Test "inclusion": Verify if two coverages are compatible (one "includes"
    the other).

There are three implementations:
- **Typescript (`ts`)**: Reference implementation, available on npm as `@c88/v8-coverage`.
- **Rust (`rs`)**: Available on crates.io as `v8-coverage`.
- **Node native module (`node`)**: Not available yet, planned to be published on npm as `@c88/v8-coverage-node`.

All the implementations expose the same API.

## API

### `mergeProcessCovs(processCovs: ProcessCov[]): ProcessCov`

Merges multiple process coverages into a single process coverage.

### `mergeScriptCovs(scriptCovs: ScriptCov[]): ScriptCov | undefined`

Merges a list of matching script coverages into a single script coverage.

The lib assumes two scripts are matching if they have the same `url`.

If the list is empty, returns `undefined`.

### `mergeFunctionCovs(funcCovs: FunctionCov[]): FunctionCov | undefined`

Merges a list of matching function coverages into a single function coverage.

The lib assumes two scripts are matching if their "root range" (first range)
has the same offsets.

If the list is empty, returns `undefined`.

### `cloneProcessCov(processCov: ProcessCov): ProcessCov`

### `cloneScriptCov(functionCov: FunctionCov): FunctionCov`

### `cloneFunctionCov(scriptCov: ScriptCov): ScriptCov`

### `cloneRangeCov(rangeCov: RangeCov): RangeCov`

## Types

### ProcessCov

Coverage results for a single process. It contains a list of script coverages.
There is one entry per script.

```typescript
interface ProcessCov {
  result: ScriptCov[];
}
```

```rust
pub struct ProcessCov {
  pub result: Vec<ScriptCov>,
}
```

**Properties**:
- Inside a single `ProcessCov`, the `scriptId` values are unique.
- Between multiple `ProcessCov`, scripts with the same `url` do not always have
  the same `scriptId`. The `scriptId` depends on the load order, so dynamically
  loading modules may cause different `scriptId` values.

**Hypothesis**:
- Inside a single `ProcessCov`, the `url` values can be non-unique. I haven't checked it
  yet but it seems possible if you load a module, then clear it from cache, overwrite
  its file and reload it. Another way to achieve it may be using the `vm` module.

### ScriptCov

Coverage data for a single script. A script can be a CJS module, an ES module,
a Node internal module, a dynamic module (for example `cjs-bridge://` modules),
etc. It holds a list of function coverages, for each of its functions.

```typescript
interface ScriptCov {
  scriptId: string;
  url: string;
  functions: FunctionCov[];
}
```

```rust
pub struct ScriptCov {
  pub script_id: String,
  pub url: String,
  pub functions: Vec<FunctionCov>,
}
```

**Properties**:
- Inside a single `ScriptCov`, the functions do not partially overlap.
- The url can be: an empty string, a relative path (usually indicates an
  internal node module), an absolute file path (usually for CJS), a file
  URL (`file://`, for ESM), or some other protocol.
- The same `ScriptCov` can have multiple functions with the same `functionName`.

### FunctionCov

Coverage data for a single function. This is the main unit of coverage: it has
a list of `ranges` forming a tree covering the AST and holding `count` data.
A function coverage can correspond to a `function` declaration or expression,
an arrow function, or the whole source text (anything outside of a function).

```typescript
interface FunctionCov {
  functionName: string;
  ranges: RangeCov[];
  isBlockCoverage: boolean;
}
```

```rust
pub struct FunctionCov {
  pub function_name: String,
  pub ranges: Vec<RangeCocv>,
  pub is_block_coverage: bool,
}
```

**Properties**:
- `ranges` is always non-empty. The first range is called the "root range".
- `isBlockCoverage` indicates if the function has block coverage information.
  - `false` means that there is a single range and its count is the number of
    times the function was called. **It does not say anything about what happens
    inside the body of the function**, some blocks may be skipped or repeated
    but this is not measured when `isBlockCoverage` is `false`. There's a single
    range spanning the whole function and its count is just number of calls to
    this function.
  - `true` means that the ranges form a tree of blocks representing how many
    times each statement or expression inside was executed. It detects skipped
    or repeated statements. The root range counts the number of function calls.
- The `functionName` can be an empty string. This is common for the
  `FunctionCov` representing the whole module.
- Inside a single `FunctionCov`, the ranges form a tree based on their inclusion
  relation.
- If you get matching `FunctionCov` values from different `ProcessCov`, the
  ranges may partially overlap (their number and offsets can vary per process).
- Inside a `ScriptCov`, a `FunctionCov` is uniquely identified by the span of
  its root range.

**Hypothesis**:
- A `ScriptCov` cannot contain two `FunctionCov` with the same span but
  different `isBlockCoverage` values. This can happen across different
  `ProcessCov`: a `FunctionCov` with `isBlockCoverage: true` in one `ProcessCov`
  and a `FunctionCov` with the same span but with `isBlockCoverage: false` in
  another `ProcessCov`.

### RangeCov

Range coverage is the primary unit of information: it has a `count` for the
number of times a span of code was executed. The offsets and counts are absolute
values (relative to the script).
The count for an AST node is given by the smallest range containing this node.

```typescript
interface RangeCov {
  startOffset: number;
  endOffset: number;
  count: number;
}
```

```rust
pub struct FunctionCov {
  pub start_offset: usize,
  pub end_offset: usize,
  pub count: i64,
}
```

**Properties**:
- `count >= 0`
- `startOffset >= 0`
- `startOffset < endOffset`
