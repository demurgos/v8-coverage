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
  const hashToFns: Map<string, FunctionCov[]> = new Map();
  for (const script of scripts) {
    for (const fn of script.functions) {
      const hash: string = hashFunction(fn);
      let fns: FunctionCov[] | undefined = hashToFns.get(hash);
      if (fns === undefined) {
        fns = [];
        hashToFns.set(hash, fns);
      }
      fns.push(fn);
    }
  }
  const functions: FunctionCov[] = [];
  for (const fns of hashToFns.values()) {
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
    const startChildren: RangeTree[] = [];
    for (let parentIndex: number = 0; parentIndex < parentTrees.length; parentIndex++) {
      const childStack: RangeTree[] = childStacks[parentIndex];
      let child: RangeTree | undefined = childStack[childStack.length - 1];
      if (child !== undefined && child.end === event) {
        childStack.pop();
        child = childStack[childStack.length - 1];
      }
      if (child !== undefined && child.start === event) {
        startChildren.push(child);
        child.parentIndex = parentIndex;
      }
    }

    // Next open tree to end (can end during the current event)
    const nextEnd: RangeTree | undefined = openTrees.peekMin();

    if (startChildren.length > 0) {
      // Next open tree to end (but not during the current event)
      const nextEarlyOpenTree: RangeTree | undefined = (nextEnd !== undefined && nextEnd.end === event)
        ? openTrees.peekNextMin()
        : nextEnd;
      // Open tree to end the last (can end during the current event)
      const lateOpen: RangeTree | undefined = openTrees.peekMax();
      // Start tree to end the last
      let lateStart: RangeTree = startChildren[0];
      for (const startChild of startChildren) {
        if (nextEarlyOpenTree !== undefined && startChild.end > nextEarlyOpenTree.end) {
          const startRight: RangeTree = startChild.split(nextEarlyOpenTree.end);
          const startChildStack: RangeTree[] = childStacks[startChild.parentIndex];
          startChildStack[startChildStack.length - 1] = startRight;
          startChildStack.push(startChild);
        }
        if (startChild.end > lateStart.end) {
          lateStart = startChild;
        }
      }

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
    if (nextEnd !== undefined && nextEnd.end === event) {
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
  private minHeap: RangeTree[];
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
    minHeapPush(this.minHeap, tree);
    if (this.max === undefined || end > this.max.end) {
      this.max = tree;
    }
  }

  peekMax(): RangeTree | undefined {
    return this.max;
  }

  peekMin(): RangeTree | undefined {
    return this.minHeap[0];
  }

  peekNextMin(): RangeTree | undefined {
    if (this.minHeap.length > 2) {
      const left: RangeTree = this.minHeap[1];
      const right: RangeTree = this.minHeap[2];
      return left.end < right.end ? left : right;
    } else {
      return this.minHeap[1];
    }
  }

  popMin(): RangeTree | undefined {
    const result: RangeTree | undefined = minHeapPop(this.minHeap);
    if (result !== undefined) {
      this.keys.delete(result.end);
      if (this.max !== undefined && result.end === this.max.end) {
        this.max = undefined;
      }
    }
    return result;
  }
}

/**
 * Inserts a range tree in a min-heap.
 *
 * @param heap Binary min-heap
 * @param value Range tree to push
 */
function minHeapPush(heap: RangeTree[], value: RangeTree): void {
  const key: number = value.end;
  let idx: number = heap.length;
  heap.push(value);
  while (idx > 0) {
    const parentIdx: number = Math.floor((idx - 1) / 2);
    const parent: RangeTree = heap[parentIdx];
    if (parent.end <= key) {
      break;
    }
    heap[parentIdx] = value;
    heap[idx] = parent;
    idx = parentIdx;
  }
}

function minHeapPop(heap: RangeTree[]): RangeTree | undefined {
  if (heap.length <= 1) {
    return heap.pop();
  }
  let idx: number = 0;
  const value: RangeTree = heap[0];
  const minHeapLen: number = heap.length;
  while (true) {
    const leftIdx: number = 2 * idx + 1;
    if (leftIdx >= minHeapLen) {
      break;
    }
    const left: RangeTree = heap[leftIdx];
    const rightIdx: number = leftIdx + 1;
    if (rightIdx >= minHeapLen) {
      heap[idx] = left;
      heap[leftIdx] = value;
      break;
    }
    const right: RangeTree = heap[rightIdx];
    if (left.end < right.end) {
      heap[idx] = left;
      heap[leftIdx] = value;
      idx = leftIdx;
    } else {
      heap[idx] = right;
      heap[rightIdx] = value;
      idx = rightIdx;
    }
  }
  return heap.pop();
}
