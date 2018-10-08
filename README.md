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

### `mergeFunctionCovs(funcCovs: ScriptCov[]): ScriptCov | undefined`

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
  pub is_bloc_coverage: bool,
}
```

**Properties**:
- `ranges` is always non-empty. The first range is called the "root range".
- `isBlockCoverage` indicates if the function has block coverage information.
  If this is `false`, it usually means that the functions was never called.
  It seems to be equivalent to `ranges.length === 1 && ranges[0].count === 0`.
- The `functionName` can be an empty string. This is common for the
  `FunctionCov` representing the whole module.
- Inside a single `FunctionCov`, the ranges form a tree based on their inclusion
  relation.
- If you get matching `FunctionCov` values from different `ProcessCov`, the
  ranges may partially overlap (their number and offsets can vary per process).

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
