# V8 coverage 

This repository contains helper functions to manipulate V8 coverage files.
At the moment, the library only exposes merging. The plan is to also expose
validation and normalization functions.

There are three implementations:
- **Typescript (`ts`)**: Reference implementation, available on npm as `c88/v8-coverage`.
- **Rust (`rs`)**: Available on crates.io as `v8-coverage`.
- **Node native module (`node`)**: Not available yet, planned to be published on npm as `c88/v8-coverage-node`.

All the implementations expose the same API.

## API

### `mergeProcessCovsSync(processCovs: ProcessCov[]): ProcessCov`

Merges multiple process coverages into a single process coverage.

### `mergeScriptCovsSync(scriptCovs: ScriptCov[]): ScriptCov | undefined`

Merges a list of matching script coverages into a single script coverage.

The lib assumes two scripts are matching if they have the same `url`.

If the list is empty, returns `undefined`.

### `mergeFunctionCovsSync(funcCovs: ScriptCov[]): ScriptCov | undefined`

Merges a list of matching script coverages into a single script coverage.

The lib assumes two scripts are matching if they have the same `url`.

If the list is empty, returns `undefined`.

## Types

### ProcessCov

Coverage results for a single process. It contains a list of script coverages.
There is one entry for each executed script.

```typescript
interface ProcessCov {
  result: ScriptCov[];
}
```

```rust
pub struct ProcessCov {
  pub result: Vec<ScriptCov>
}
```

**Properties**:
- Inside a single `ProcessCov`, the `scriptId` values are unique.
- Between multiple `ProcessCov`, scripts with the same `url` do not always have the same `scriptId`.

**Hypothesis**:
- Inside a single `ProcessCov`, the `url` values can be non-unique.

### ScriptCov

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
  pub functions: Vec<FunctionCov>
}
```

**Properties**:
- Inside a single `ScriptCov`, the functions do not partially overlap.
