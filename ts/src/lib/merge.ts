import { deepNormalizeProcessCov, deepNormalizeScriptCov, normalizeFunctionCov, normalizeProcessCov, normalizeRangeTree, normalizeScriptCov } from "./normalize";
import { RangeTree } from "./range-tree";
import { FunctionCov, ProcessCov, RangeCov, ScriptCov } from "./types";

/**
 * Merges a list of process coverages.
 *
 * The result is normalized.
 * The input values may be mutated, it is not safe to use them after passing
 * them to this function.
 * The computation is synchronous.
 *
 * @param processCovs Process coverages to merge.
 * @return Merged process coverage.
 */
export function mergeProcessCovs(processCovs: ReadonlyArray<ProcessCov>): ProcessCov {
  if (processCovs.length === 0) {
    return {result: []};
  } else if (processCovs.length === 1) {
    const merged: ProcessCov = processCovs[0];
    deepNormalizeProcessCov(merged);
    return merged;
  }

  const urlToScripts: Map<string, ScriptCov[]> = new Map();
  for (const processCov of processCovs) {
    for (const scriptCov of processCov.result) {
      let scriptCovs: ScriptCov[] | undefined = urlToScripts.get(scriptCov.url);
      if (scriptCovs === undefined) {
        scriptCovs = [];
        urlToScripts.set(scriptCov.url, scriptCovs);
      }
      scriptCovs.push(scriptCov);
    }
  }

  const result: ScriptCov[] = [];
  for (const scripts of urlToScripts.values()) {
    // assert: `scripts.length > 0`
    result.push(mergeScriptCovs(scripts)!);
  }
  const merged: ProcessCov = {result};

  normalizeProcessCov(merged);
  return merged;
}

/**
 * Merges a list of matching script coverages.
 *
 * Scripts are matching if they have the same `url`.
 * The result is normalized.
 * The input values may be mutated, it is not safe to use them after passing
 * them to this function.
 * The computation is synchronous.
 *
 * @param scriptCovs Process coverages to merge.
 * @return Merged script coverage, or `undefined` if the input list was empty.
 */
export function mergeScriptCovs(scriptCovs: ReadonlyArray<ScriptCov>): ScriptCov | undefined {
  if (scriptCovs.length === 0) {
    return undefined;
  } else if (scriptCovs.length === 1) {
    const merged: ScriptCov = scriptCovs[0];
    deepNormalizeScriptCov(merged);
    return merged;
  }

  const first: ScriptCov = scriptCovs[0];
  const scriptId: string = first.scriptId;
  const url: string = first.url;

  const rangeToFuncs: Map<string, FunctionCov[]> = new Map();
  for (const scriptCov of scriptCovs) {
    for (const funcCov of scriptCov.functions) {
      const rootRange: string = stringifyFunctionRootRange(funcCov);
      let funcCovs: FunctionCov[] | undefined = rangeToFuncs.get(rootRange);
      if (funcCovs === undefined) {
        funcCovs = [];
        rangeToFuncs.set(rootRange, funcCovs);
      }
      funcCovs.push(funcCov);
    }
  }

  const functions: FunctionCov[] = [];
  for (const funcCovs of rangeToFuncs.values()) {
    // assert: `funcCovs.length > 0`
    functions.push(mergeFunctions(funcCovs)!);
  }

  const merged: ScriptCov = {scriptId, url, functions};
  normalizeScriptCov(merged);
  return merged;
}

/**
 * Returns a string representation of the root range of the function.
 *
 * This string can be used to match function with same root range.
 * The string is derived from the start and end offsets of the root range of
 * the function.
 * This assumes that `ranges` is non-empty (true for valid function coverages).
 *
 * @param funcCov Function coverage with the range to stringify
 * @internal
 */
function stringifyFunctionRootRange(funcCov: Readonly<FunctionCov>): string {
  const rootRange: RangeCov = funcCov.ranges[0];
  return `${rootRange.startOffset.toString(10)};${rootRange.endOffset.toString(10)}`;
}

/**
 * Merges a list of matching function coverages.
 *
 * Functions are matching if their root ranges have the same span.
 * The result is normalized.
 * The input values may be mutated, it is not safe to use them after passing
 * them to this function.
 * The computation is synchronous.
 *
 * @param funcCovs Function coverages to merge.
 * @return Merged function coverage, or `undefined` if the input list was empty.
 */
export function mergeFunctions(funcCovs: ReadonlyArray<FunctionCov>): FunctionCov | undefined {
  if (funcCovs.length === 0) {
    return undefined;
  } else if (funcCovs.length === 1) {
    const merged: FunctionCov = funcCovs[0];
    normalizeFunctionCov(merged);
    return merged;
  }

  const functionName: string = funcCovs[0].functionName;

  const trees: RangeTree[] = [];
  for (const funcCov of funcCovs) {
    // assert: `fn.ranges.length > 0`
    // assert: `fn.ranges` is sorted
    trees.push(RangeTree.fromSortedRanges(funcCov.ranges)!);
  }

  // assert: `trees.length > 0`
  const mergedTree: RangeTree = mergeRangeTrees(trees)!;
  normalizeRangeTree(mergedTree);
  const ranges: RangeCov[] = mergedTree.toRanges();
  const isBlockCoverage: boolean = !(ranges.length === 1 && ranges[0].count === 0);

  const merged: FunctionCov = {functionName, ranges, isBlockCoverage};
  // assert: `merged` is normalized
  return merged;
}

/**
 * @precondition Same `start` and `end` for all the trees
 */
function mergeRangeTrees(trees: ReadonlyArray<RangeTree>): RangeTree | undefined {
  if (trees.length <= 1) {
    return trees[0];
  }
  const first: RangeTree = trees[0];
  let delta: number = 0;
  for (const tree of trees) {
    delta += tree.delta;
  }
  const children: RangeTree[] = mergeRangeTreeChildren(trees);
  return new RangeTree(first.start, first.end, delta, children);
}

function mergeRangeTreeChildren(parentTrees: ReadonlyArray<RangeTree>): RangeTree[] {
  extendChildren(parentTrees);
  const events: number[] = getChildEvents(parentTrees);
  const nextTreeIndexes: number[] = new Array(parentTrees.length).fill(0);

  const result: RangeTree[] = [];
  for (let eventIndex: number = 0; eventIndex < events.length - 1; eventIndex++) {
    const event: number = events[eventIndex];
    const childTrees: RangeTree[] = [];
    for (let parentIdx: number = 0; parentIdx < parentTrees.length; parentIdx++) {
      const parentTree: RangeTree = parentTrees[parentIdx];
      const nextTreeIndex: number = nextTreeIndexes[parentIdx];
      const nextTree: RangeTree = parentTree.children[nextTreeIndex];
      if (nextTree !== undefined && nextTree.start === event) {
        nextTreeIndexes[parentIdx] = nextTreeIndex + 1;
        childTrees.push(nextTree);
      }
    }
    const merged: RangeTree | undefined = mergeRangeTrees(childTrees);
    if (merged !== undefined) {
      result.push(merged);
    }
  }
  return result;
}

// tslint:disable-next-line:cyclomatic-complexity
function extendChildren(parentTrees: ReadonlyArray<RangeTree>): void {
  const events: number[] = getChildEvents(parentTrees);

  // For each end, contains the tree starting the earlier (if is is currently open)
  // const openTrees: OpenTreeQueue = new OpenTreeQueue();
  const childStacks: RangeTree[][] = [];
  const flatChildren: RangeTree[][] = [];
  const wrappedChildren: RangeTree[][] = [];
  let openTree: RangeTree | undefined;
  // tslint:disable-next-line:prefer-for-of
  for (let i: number = 0; i < parentTrees.length; i++) {
    const children: RangeTree[] = parentTrees[i].children;
    const childStack: RangeTree[] = [];
    for (let j: number = children.length - 1; j >= 0; j--) {
      childStack.push(children[j]);
    }
    childStacks.push(childStack);
    flatChildren.push([]);
    wrappedChildren.push([]);
  }

  const parentToNested: Map<number, RangeTree[]> = new Map();

  function finalizeWrapped() {
    const superTree: RangeTree = openTree!;
    for (const [parentIndex, nested] of parentToNested) {
      const wrapper: RangeTree = new RangeTree(
        superTree.start,
        superTree.end,
        0,
        nested,
      );
      wrappedChildren[parentIndex].push(wrapper);
    }
    parentToNested.clear();
  }

  for (const event of events) {
    if (openTree !== undefined && openTree.end === event) {
      finalizeWrapped();
      openTree = undefined;
    }

    // Starting tree to end the last
    let maxStartingChild: RangeTree | undefined;

    const startingChildren: [number, RangeTree][] = [];
    for (let parentIndex: number = 0; parentIndex < parentTrees.length; parentIndex++) {
      const childStack: RangeTree[] = childStacks[parentIndex];
      if (childStack.length === 0) {
        continue;
      }
      const child: RangeTree = childStack[childStack.length - 1];
      if (child.start !== event) {
        continue;
      }
      childStack.pop();
      if (openTree !== undefined) {
        if (child.end > openTree.end) {
          childStack.push(child.split(openTree.end));
        }
        let nested: RangeTree[] | undefined = parentToNested.get(parentIndex);
        if (nested === undefined) {
          nested = [];
          parentToNested.set(parentIndex, nested);
        }
        nested.push(child);
      } else {
        startingChildren.push([parentIndex, child]);
        if (maxStartingChild === undefined || child.end > maxStartingChild.end) {
          maxStartingChild = child;
        }
      }
    }

    if (maxStartingChild !== undefined) {
      for (const [parentIndex, child] of startingChildren) {
        if (child.end < maxStartingChild.end) {
          let nested: RangeTree[] | undefined = parentToNested.get(parentIndex);
          if (nested === undefined) {
            nested = [];
            parentToNested.set(parentIndex, nested);
          }
          nested.push(child);
        } else {
          flatChildren[parentIndex].push(child);
        }
      }
      if (openTree === undefined || maxStartingChild.end > openTree.end) {
        openTree = maxStartingChild;
      }
    }
  }
  for (let parentIndex: number = 0; parentIndex < parentTrees.length; parentIndex++) {
    const flat: RangeTree[] = flatChildren[parentIndex];
    const wrapped: RangeTree[] = wrappedChildren[parentIndex];
    const merged: RangeTree[] = [];

    let nextFlatIndex: number = 0;
    let nextWrappedIndex: number = 0;
    while (nextFlatIndex < flat.length || nextWrappedIndex < wrapped.length) {
      const nextFlat: RangeTree | undefined = flat[nextFlatIndex];
      const nextWrapped: RangeTree | undefined = wrapped[nextWrappedIndex];
      if (nextFlat === undefined) {
        merged.push(nextWrapped);
        nextWrappedIndex++;
      } else if (nextWrapped === undefined) {
        merged.push(nextFlat);
        nextFlatIndex++;
      } else if (nextWrapped.start < nextFlat.start) {
        merged.push(nextWrapped);
        nextWrappedIndex++;
      } else {
        merged.push(nextFlat);
        nextFlatIndex++;
      }
    }

    parentTrees[parentIndex].children = merged;
  }
}

function getChildEvents(trees: Iterable<RangeTree>): number[] {
  const eventSet: Set<number> = new Set();
  for (const parentTree of trees) {
    for (const tree of parentTree.children) {
      eventSet.add(tree.start);
      eventSet.add(tree.end);
    }
  }
  const events: number[] = [...eventSet];
  events.sort(compareNumbers);
  return events;
}

function compareNumbers(a: number, b: number): number {
  return a - b;
}
