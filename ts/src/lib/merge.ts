import { RangeTree } from "./range-tree";
import { FunctionCov, ProcessCov, RangeCov, ScriptCov } from "./types";

/**
 * Merges a list of process coverages.
 *
 * @param processes Process coverages to merge.
 * @return Merged process coverage, or `undefined` if the input list was empty.
 */
export function mergeProcesses(processes: ReadonlyArray<ProcessCov>): ProcessCov | undefined {
  if (processes.length <= 1) {
    return processes[0];
  }
  const urlToScripts: Map<string, ScriptCov[]> = new Map();
  for (const process of processes) {
    for (const script of process.result) {
      let scripts: ScriptCov[] | undefined = urlToScripts.get(script.url);
      if (scripts === undefined) {
        scripts = [];
        urlToScripts.set(script.url, scripts);
      }
      scripts.push(script);
    }
  }
  const result: ScriptCov[] = [];
  let scriptId: number = 1;
  for (const scripts of urlToScripts.values()) {
    // assert: `scripts.length > 0`
    const merged: ScriptCov = mergeScripts(scripts)!;
    merged.scriptId = scriptId.toString(10);
    scriptId++;
    result.push(merged);
  }
  return {result};
}

/**
 * Merges a list of matching script coverages.
 *
 * @param scripts Script coverages to merge.
 * @return Merged script coverage, or `undefined` if the input list was empty.
 */
export function mergeScripts(scripts: ReadonlyArray<ScriptCov>): ScriptCov | undefined {
  if (scripts.length <= 1) {
    return scripts[0];
  }
  const first: ScriptCov = scripts[0];
  const rangeToFns: Map<string, FunctionCov[]> = new Map();
  for (const script of scripts) {
    for (const fn of script.functions) {
      const hash: string = hashFunction(fn);
      let fns: FunctionCov[] | undefined = rangeToFns.get(hash);
      if (fns === undefined) {
        fns = [];
        rangeToFns.set(hash, fns);
      }
      fns.push(fn);
    }
  }
  const functions: FunctionCov[] = [];
  for (const fns of rangeToFns.values()) {
    // assert: `fns.length > 0`
    functions.push(mergeFunctions(fns)!);
  }
  return {
    scriptId: first.scriptId,
    url: first.url,
    functions,
  };
}

/**
 * Merges a list of matching function coverages.
 *
 * @param fns Function coverages to merge.
 * @return Merged function coverage, or `undefined` if the input list was empty.
 */
export function mergeFunctions(fns: ReadonlyArray<FunctionCov>): FunctionCov | undefined {
  if (fns.length <= 1) {
    return fns[0];
  }
  const first: FunctionCov = fns[0];
  const trees: RangeTree[] = [];
  for (const fn of fns) {
    // assert: `fn.ranges.length > 0`
    // assert: `fn.ranges` is sorted
    const tree: RangeTree = RangeTree.fromSortedRanges(fn.ranges)!;
    trees.push(tree);
  }
  // assert: `trees.length > 0`
  const mergedTree: RangeTree = mergeRangeTrees(trees)!;
  mergedTree.normalize();
  const ranges: RangeCov[] = mergedTree.toRanges();
  const isBlockCoverage: boolean = !(ranges.length === 1 && ranges[0].count === 0);
  return {
    functionName: first.functionName,
    ranges,
    isBlockCoverage,
  };
}

/**
 * Returns a string identifying a function inside a script.
 *
 * This string is the same for matching functions from matching script
 * coverages.
 * This string is derived from the start and end offsets of the root range of
 * the function.
 * This string is unique without collisions, assuming the inputs are valid.
 *
 * @param fn
 */
function hashFunction(fn: Readonly<FunctionCov>): string {
  return JSON.stringify([fn.ranges[0].startOffset, fn.ranges[0].endOffset]);
}

/**
 * @precondition Same `start` and `end` for all the trees
 */
function mergeRangeTrees(trees: ReadonlyArray<RangeTree>): RangeTree | undefined {
  if (trees.length <= 1) {
    return trees[0];
  }
  const first: RangeTree = trees[0];
  let count: number = 0;
  for (const tree of trees) {
    count += tree.count;
  }
  const children: RangeTree[] = mergeRangeTreeChildren(trees);
  return new RangeTree(first.start, first.end, count, children, 0, 0);
}

function mergeRangeTreeChildren(parentTrees: ReadonlyArray<RangeTree>): RangeTree[] {
  extendChildren(parentTrees);
  const events: number[] = getChildEvents(parentTrees);
  const nextTreeIndexes: number[] = new Array(parentTrees.length).fill(0);

  const result: RangeTree[] = [];
  for (let eventIndex: number = 0; eventIndex < events.length - 1; eventIndex++) {
    const event: number = events[eventIndex];
    const childTrees: RangeTree[] = [];
    let parentAcc: number = 0;
    for (let parentIdx: number = 0; parentIdx < parentTrees.length; parentIdx++) {
      const parentTree: RangeTree = parentTrees[parentIdx];
      const nextTreeIndex: number = nextTreeIndexes[parentIdx];
      const nextTree: RangeTree = parentTree.children[nextTreeIndex];
      if (nextTree !== undefined && nextTree.start === event) {
        nextTreeIndexes[parentIdx] = nextTreeIndex + 1;
        childTrees.push(nextTree);
      } else {
        parentAcc += parentTree.count;
      }
    }
    const merged: RangeTree | undefined = mergeRangeTrees(childTrees);
    if (merged !== undefined) {
      merged.addCount(parentAcc);
      result.push(merged);
    }
  }
  return result;
}

// tslint:disable-next-line:cyclomatic-complexity
function extendChildren(parentTrees: ReadonlyArray<RangeTree>): void {
  const events: number[] = getChildEvents(parentTrees);

  // For each end, contains the tree starting the earlier (if is is currently open)
  const openTrees: OpenTreeQueue = new OpenTreeQueue();
  const childStacks: RangeTree[][] = [];
  const flatChildren: RangeTree[][] = [];
  const wrappedChildren: RangeTree[][] = [];
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

  const inclusionTree: Map<RangeTree, Map<number, RangeTree[]>> = new Map();

  for (const event of events) {
    // Next open tree to end (can end during the current event)
    const nextOrCurEnd: number | undefined = openTrees.peekMin();
    // Next open tree to end (but not during the current event)
    const nextEnd: number | undefined = nextOrCurEnd === event ? openTrees.peekNextMin() : nextOrCurEnd;
    // Starting tree to end the last
    let lateStart: RangeTree | undefined;

    const startChildren: RangeTree[] = [];
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
      startChildren.push(child);
      child.parentIndex = parentIndex;
      if (nextEnd !== undefined && child.end > nextEnd) {
        childStack.push(child.split(nextEnd));
      }
      if (lateStart === undefined || child.end > lateStart.end) {
        lateStart = child;
      }
    }

    if (lateStart !== undefined) {
      // Open tree to end the last (can end during the current event)
      const lateOpen: RangeTree | undefined = openTrees.peekMax();

      for (const startChild of startChildren) {
        let superTree: RangeTree | undefined;
        if (lateOpen !== undefined && startChild.end <= lateOpen.end) {
          superTree = lateOpen;
        } else if (startChild.end < lateStart.end) {
          superTree = lateStart;
        }
        const parentIndex: number = startChild.parentIndex;
        if (superTree !== undefined) {
          let parentToNested: Map<number, RangeTree[]> | undefined = inclusionTree.get(superTree);
          if (parentToNested === undefined) {
            parentToNested = new Map();
            inclusionTree.set(superTree, parentToNested);
          }
          let nested: RangeTree[] | undefined = parentToNested.get(parentIndex);
          if (nested === undefined) {
            nested = [];
            parentToNested.set(parentIndex, nested);
          }
          nested.push(startChild);
        } else {
          flatChildren[parentIndex].push(startChild);
        }
      }
    }
    if (nextOrCurEnd === event) {
      openTrees.popMin();
    }
    for (const startChild of startChildren) {
      openTrees.pushIfNew(startChild);
    }
  }
  for (const [superTree, parentToNested] of inclusionTree) {
    for (const [parentIndex, descendants] of parentToNested) {
      const wrapper: RangeTree = new RangeTree(
        superTree.start,
        superTree.end,
        parentTrees[parentIndex].count,
        descendants,
        0,
        parentIndex,
      );
      wrappedChildren[parentIndex].push(wrapper);
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

/**
 * Min heap of `RangeTree`, ordered by `end`.
 */
class OpenTreeQueue {
  private minHeap: number[];
  private max: RangeTree | undefined;
  private keys: Set<number>;

  constructor() {
    this.minHeap = [];
    this.max = undefined;
    this.keys = new Set();
  }

  pushIfNew(tree: RangeTree): void {
    const end: number = tree.end;
    if (this.keys.has(end)) {
      return;
    }
    this.keys.add(end);
    minHeapPush(this.minHeap, end);
    if (this.max === undefined || end > this.max.end) {
      this.max = tree;
    }
  }

  peekMax(): RangeTree | undefined {
    return this.max;
  }

  peekMin(): number | undefined {
    return this.minHeap.length > 0 ? this.minHeap[0] : undefined;
  }

  peekNextMin(): number | undefined {
    if (this.minHeap.length > 2) {
      return Math.min(this.minHeap[1], this.minHeap[2]);
    } else {
      return this.minHeap.length > 1 ? this.minHeap[1] : undefined;
    }
  }

  popMin(): void {
    const minKey: number | undefined = minHeapPop(this.minHeap);
    if (minKey !== undefined) {
      this.keys.delete(minKey);
      if (this.minHeap.length === 0) {
        this.max = undefined;
      }
    }
  }
}

/**
 * Inserts a key to the binary min-heap.
 *
 * @param heap Binary min-heap
 * @param key Key to push
 */
function minHeapPush(heap: number[], key: number): void {
  let idx: number = heap.length;
  heap.push(key);
  while (idx > 0) {
    const parentIdx: number = Math.floor((idx - 1) / 2);
    const parentKey: number = heap[parentIdx];
    if (parentKey <= key) {
      break;
    }
    heap[parentIdx] = key;
    heap[idx] = parentKey;
    idx = parentIdx;
  }
}

function minHeapPop(heap: number[]): number | undefined {
  if (heap.length <= 1) {
    return heap.length > 0 ? heap.pop() : undefined;
  }
  let idx: number = 0;
  const minKey: number = heap[0];
  const heapLen: number = heap.length;
  while (true) {
    const leftIdx: number = 2 * idx + 1;
    if (leftIdx >= heapLen) {
      break;
    }
    const leftKey: number = heap[leftIdx];
    const rightIdx: number = leftIdx + 1;
    if (rightIdx >= heapLen) {
      heap[idx] = leftKey;
      heap[leftIdx] = minKey;
      idx = leftIdx;
      break;
    }
    const rightKey: number = heap[rightIdx];
    if (leftKey < rightKey) {
      heap[idx] = leftKey;
      heap[leftIdx] = minKey;
      idx = leftIdx;
    } else {
      heap[idx] = rightKey;
      heap[rightIdx] = minKey;
      idx = rightIdx;
    }
  }
  if (idx !== heapLen - 1) {
    heap[idx] = heap[heapLen - 1];
    heap[heapLen - 1] = minKey;
  }
  return heap.pop();
}
