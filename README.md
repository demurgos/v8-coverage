# V8 coverage 

This repository contains helper functions to manipulate V8 coverage files.

These functions are implemented as a Rust crate (`rs`), a simple Javascript 
package (`ts`) and a native Node module (`node`).

## API

### `mergeProcesses(processes: ProcessCov[]): ProcessCov`

Merges multiple process coverages into a single process coverage.

### `mergeScripts(scripts: ScriptCov[]): ScriptCov`

Merges a list of matching script coverages into a single script coverage.

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
