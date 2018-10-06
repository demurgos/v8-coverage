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
    functions.push(mergeFunctionCovs(funcCovs)!);
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
export function mergeFunctionCovs(funcCovs: ReadonlyArray<FunctionCov>): FunctionCov | undefined {
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

class StartEvent {
  readonly offset: number;
  readonly trees: [number, RangeTree][];

  constructor(offset: number, trees: [number, RangeTree][]) {
    this.offset = offset;
    this.trees = trees;
  }

  static compare(a: StartEvent, b: StartEvent): number {
    return a.offset - b.offset;
  }
}

class StartEventQueue {
  private readonly queue: StartEvent[];
  private nextIndex: number;
  private pendingOffset: number;
  private pendingTrees: [number, RangeTree][] | undefined;

  private constructor(queue: StartEvent[]) {
    this.queue = queue;
    this.nextIndex = 0;
    this.pendingOffset = 0;
    this.pendingTrees = undefined;
  }

  static fromParentTrees(parentTrees: ReadonlyArray<RangeTree>): StartEventQueue {
    const startToTrees: Map<number, [number, RangeTree][]> = new Map();
    for (const [parentIndex, parentTree] of parentTrees.entries()) {
      for (const child of parentTree.children) {
        let trees: [number, RangeTree][] | undefined = startToTrees.get(child.start);
        if (trees === undefined) {
          trees = [];
          startToTrees.set(child.start, trees);
        }
        trees.push([parentIndex, child]);
      }
    }
    const queue: StartEvent[] = [];
    for (const [startOffset, trees] of startToTrees) {
      queue.push(new StartEvent(startOffset, trees));
    }
    queue.sort(StartEvent.compare);
    return new StartEventQueue(queue);
  }

  setPendingOffset(offset: number): void {
    this.pendingOffset = offset;
  }

  pushPendingTree(tree: [number, RangeTree]): void {
    if (this.pendingTrees === undefined) {
      this.pendingTrees = [];
    }
    this.pendingTrees.push(tree);
  }

  next(): StartEvent | undefined {
    const pendingTrees: [number, RangeTree][] | undefined = this.pendingTrees;
    const nextEvent: StartEvent | undefined = this.queue[this.nextIndex];
    if (pendingTrees === undefined) {
      this.nextIndex++;
      return nextEvent;
    } else if (nextEvent === undefined) {
      this.pendingTrees = undefined;
      return new StartEvent(this.pendingOffset, pendingTrees);
    } else {
      if (this.pendingOffset < nextEvent.offset) {
        this.pendingTrees = undefined;
        return new StartEvent(this.pendingOffset, pendingTrees);
      } else {
        if (this.pendingOffset === nextEvent.offset) {
          this.pendingTrees = undefined;
          for (const tree of pendingTrees) {
            nextEvent.trees.push(tree);
          }
        }
        this.nextIndex++;
        return nextEvent;
      }
    }
  }
}

// tslint:disable-next-line:cyclomatic-complexity
function extendChildren(parentTrees: ReadonlyArray<RangeTree>): void {
  const flatChildren: RangeTree[][] = [];
  const wrappedChildren: RangeTree[][] = [];
  // tslint:disable-next-line:prefer-for-of
  for (let i: number = 0; i < parentTrees.length; i++) {
    flatChildren.push([]);
    wrappedChildren.push([]);
  }

  const startEventQueue: StartEventQueue = StartEventQueue.fromParentTrees(parentTrees);
  const parentToNested: Map<number, RangeTree[]> = new Map();
  let openRange: { start: number; end: number } | undefined;

  function closeOpenRange() {
    for (const [parentIndex, nested] of parentToNested) {
      const wrapper: RangeTree = new RangeTree(
        openRange!.start,
        openRange!.end,
        0,
        nested,
      );
      wrappedChildren[parentIndex].push(wrapper);
    }
    parentToNested.clear();
    openRange = undefined;
  }

  function insertNested(parentIndex: number, tree: RangeTree): void {
    let nested: RangeTree[] | undefined = parentToNested.get(parentIndex);
    if (nested === undefined) {
      nested = [];
      parentToNested.set(parentIndex, nested);
    }
    nested.push(tree);
  }

  while (true) {
    const event: StartEvent | undefined = startEventQueue.next();
    if (event === undefined) {
      break;
    }
    if (openRange !== undefined && openRange.end <= event.offset) {
      closeOpenRange();
    }
    if (openRange === undefined) {
      let openRangeEnd: number = event.offset + 1;
      for (const [_, tree] of event.trees) {
        openRangeEnd = Math.max(openRangeEnd, tree.end);
      }
      for (const [parentIndex, tree] of event.trees) {
        if (tree.end === openRangeEnd) {
          flatChildren[parentIndex].push(tree);
        } else {
          insertNested(parentIndex, tree);
        }
      }
      startEventQueue.setPendingOffset(openRangeEnd);
      openRange = {start: event.offset, end: openRangeEnd};
    } else {
      for (const [parentIndex, tree] of event.trees) {
        if (tree.end > openRange.end) {
          startEventQueue.pushPendingTree([parentIndex, tree.split(openRange.end)]);
        }
        insertNested(parentIndex, tree);
      }
    }
  }
  if (openRange !== undefined) {
    closeOpenRange();
  }

  for (let parentIndex: number = 0; parentIndex < parentTrees.length; parentIndex++) {
    parentTrees[parentIndex].children = mergeForests(flatChildren[parentIndex], wrappedChildren[parentIndex]);
  }
}

function mergeForests(a: RangeTree[], b: RangeTree[]): RangeTree[] {
  const merged: RangeTree[] = [];

  let nextIndexA: number = 0;
  let nextIndexB: number = 0;
  while (nextIndexA < a.length || nextIndexB < b.length) {
    const nextA: RangeTree | undefined = a[nextIndexA];
    const nextB: RangeTree | undefined = b[nextIndexB];
    if (nextA === undefined) {
      merged.push(nextB);
      nextIndexB++;
    } else if (nextB === undefined) {
      merged.push(nextA);
      nextIndexA++;
    } else if (nextB.start < nextA.start) {
      merged.push(nextB);
      nextIndexB++;
    } else {
      merged.push(nextA);
      nextIndexA++;
    }
  }

  return merged;
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
