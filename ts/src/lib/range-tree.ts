import { RangeCov } from "./types";

export class RangeTree {
  start: number;
  end: number;
  count: number;
  children: RangeTree[];
  parentIndex: number;
  private lazyCount: number;

  constructor(
    start: number,
    end: number,
    count: number,
    children: RangeTree[],
    lazyCount: number,
    parentIndex: number,
  ) {
    this.start = start;
    this.end = end;
    this.count = count;
    this.children = children;
    this.lazyCount = lazyCount;
    this.parentIndex = parentIndex;
  }

  /**
   * @precodition `ranges` are well-formed and pre-order sorted
   */
  static fromSortedRanges(ranges: ReadonlyArray<RangeCov>): RangeTree | undefined {
    let root: RangeTree | undefined;
    const stack: RangeTree[] = [];
    for (const range of ranges) {
      const node: RangeTree = new RangeTree(range.startOffset, range.endOffset, range.count, [], 0, 0);
      if (root === undefined) {
        root = node;
        stack.push(node);
        continue;
      }
      let top: RangeTree;
      while (true) {
        // assert: `top.length > 0`
        top = stack[stack.length - 1];
        if (range.startOffset >= top.end) {
          stack.pop();
          top = stack[stack.length - 1];
        } else {
          break;
        }
      }
      top.children.push(node);
      stack.push(node);
    }
    return root;
  }

  normalize(): void {
    if (this.lazyCount !== 0) {
      this.count += this.lazyCount;
      for (const child of this.children) {
        child.lazyCount += this.lazyCount;
      }
      this.lazyCount = 0;
    }

    const children: RangeTree[] = [];
    let curEnd: number;
    let head: RangeTree | undefined;
    const tail: RangeTree[] = [];
    for (const child of this.children) {
      if (head === undefined) {
        head = child;
      } else if ((child.count + child.lazyCount) === (head.count + head.lazyCount) && child.start === curEnd!) {
        tail.push(child);
      } else {
        endChain();
        head = child;
      }
      curEnd = child.end;
    }
    if (head !== undefined) {
      endChain();
    }

    if (children.length === 1) {
      const child: RangeTree = children[0];
      if (child.start === this.start && child.end === this.end) {
        this.count = child.count;
        this.children = child.children;
        // `.lazyCount` is zero for both (both are after normalization)
        // `.parentIndex` is irrelevant
        return;
      }
    }

    this.children = children;

    function endChain(): void {
      if (tail.length !== 0) {
        head!.end = tail[tail.length - 1].end;
        for (const tailTree of tail) {
          for (const subChild of tailTree.children) {
            subChild.lazyCount += tailTree.lazyCount - head!.lazyCount;
            head!.children.push(subChild);
          }
        }
        tail.length = 0;
      }
      head!.normalize();
      children.push(head!);
    }
  }

  /**
   * @precondition `tree.start < value && value < tree.end`
   * @return RangeTree Right part
   */
  split(value: number): RangeTree {
    let leftEnd: number = this.children.length;
    let mid: RangeTree | undefined;

    // TODO(perf): Binary search (check overhead)
    for (let i: number = 0; i < this.children.length; i++) {
      const child: RangeTree = this.children[i];
      if (child.start < value && value < child.end) {
        mid = child.split(value);
        leftEnd = i + 1;
        break;
      } else if (child.start >= value) {
        leftEnd = i;
        break;
      }
    }

    const rightLen: number = this.children.length - leftEnd;
    const rightChildren: RangeTree[] = this.children.splice(leftEnd, rightLen);
    if (mid !== undefined) {
      rightChildren.unshift(mid);
    }
    const result: RangeTree = new RangeTree(
      value,
      this.end,
      this.count,
      rightChildren,
      this.lazyCount,
      this.parentIndex,
    );
    this.end = value;
    return result;
  }

  /**
   * Get the range coverages corresponding to the tree.
   *
   * The ranges are pre-order sorted.
   */
  toRanges(): RangeCov[] {
    const ranges: RangeCov[] = [];
    const stack: RangeTree[] = [this];
    while (stack.length > 0) {
      const cur: RangeTree = stack.pop()!;
      ranges.push({startOffset: cur.start, endOffset: cur.end, count: cur.count});
      for (let i: number = cur.children.length - 1; i >= 0; i--) {
        stack.push(cur.children[i]);
      }
    }
    return ranges;
  }

  /**
   * Increases the count of the current tree and all its descendants.
   *
   * The tree and its descendants become invalidated: you need to normalize it
   * before reading it.
   *
   * @param n Value to add.
   */
  addCount(n: number): void {
    this.lazyCount += n;
  }
}
