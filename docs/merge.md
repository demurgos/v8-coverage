# Merge

This document describes the merge algorithm.

The merge algorithm takes a list of process coverages (or smaller items) and
outputs a single object combining the information in the inputs. The goal is
to simulate the result V8 would have returned if all the code was executed by
the same process instead of multiple processes. Basically, we want to sum the
counts.

You can actually do an experiment to see what the merged result should look
like. Write a library and multiple entry points using this library. First run
each entry point in its own process. Then create a "super" entry point that
requires all the other ones and run it. The process coverage you get there
corresponds to the merged coverages obtained from the individual entry points.

The algorithm in this repo only depends on the individual process coverages: it
does not use the source text or Abstract Syntax Tree (AST). This means that the
algorithm has less information than the V8 profiler.

Since the algorithm has less information, the result is usually different from
what you get experimentally. The experimental result may have more and/or
smaller ranges (it is more granular). Still, these results should be compatible.
If you apply both to the same source text, they should return the same counts
for each AST node. The result produced by the algorithm is simply more general
than the experimental result.

The lack of source text information is also the reason for one the main
unproven assumptions of the algorithm: the **left bias rule**. It will be
detailed further down, but it relates to how partially overlapping ranges are
handled. There are two choices "left bias" or "right bias". Choosing the wrong
one may break the validity of the coverage but there is no way to decide without
the source text. I know cases where you need to use the "left bias", but wasn't
able to find (or create) cases where the "right bias" is required. Because of
this, the algorithm uses the "left bias" variant. If a case is ever found where
the "right bias" must be used, it would imply that merging coverages without the
source text is ambiguous. If the left bias rule does not hold, merging without
the source text is impossible.

The algorithm is associative and commutative. It means that the result does
not depend on the order of the inputs and that you can have intermediate values.
All of the following return the same result:
- `merge([a, b, c, d])`
- `[b, c, d].reduce(a, (acc, next) => merge([acc, next]))`
- `[a, b, c].reduceRight(d, (acc, next) => merge([next, acc]))`
- `merge([merge([a, b]), merge([c, d])])`

The algorithm is designed to be fast. It should be able to handle the Node and
npm test suites. These generates thousands of process coverages (adding up to
hundreds of megabytes). The initial implementation took roughly 50 seconds on
my computer to process them. Careful changes to the algorithm and implementation
took this time down to about 3 seconds.
These times correspond to the Node.js implementation. I also wrote a Rust
implementation to compare performance and force me to "double check" the
algorithm. Single threaded Rust takes 4 seconds (1.2s with multithreading).
Following this, I am very impressed by the V8 engine! (Disclaimer: I'm good at
Node but only a beginner at Rust, help to improve the performance is welcome).

## Overview

The algorithm has two main main steps: function matching and range merging.
The functions are the main units of coverage. The first step finds function
coverages corresponding to the same block of code. The second step is the harder
part: it takes the `ranges` from matching functions and outputs a single list
that represents the sum of the counts for all the AST nodes in the function.

## Function matching

The coverages have a hierarchical structure: process coverages contain script
coverages which contain function coverages. The function matching step searches
`FunctionCov` values from different coverages that are corresponding to the same
block of code. A function is matching another one if it is in the same file and
covers the same span of source text.

The algorithm first matches scripts across process coverages: two scripts are
matching if they have the same `url`. The `scriptId` is ignored because this
value is not reliable. It depends on the load order so the presence of
dynamically loaded modules (optional dependencies, conditional dependencies,
etc.) affects it.

Then, for each set of matching script coverages, the functions are matched
based on their span. The functions are characterized by their root range:
`ranges[0]`. `ranges[0].count` is the number of times the function was called
and the offsets correspond the whole function: from the first token (e.g.
the `function` keyword) to the last one (e.g. the final closing brace `}`).
V8 treats all the statements at the root of the file as being part of a
single `FunctionCov` covering the entire file.

The functions are matched with the `startOffset` and `endOffset` of their root
range. The `functionName` is ignored because it is not that reliable (multiple
functions can have the same name inside the same script).

I am assuming that the source text does not change between process coverages.
There are some special cases where it may happen, but in practice they
correspond to dynamically generated modules that aren't covered.
Assuming the source text is not dynamically modified, the matching is
unambiguous.

<sub>There could be one edge case if the whole source text is a
single function definition without anything outside (no assignation,
no import/expert, no semicolon, no new line). I haven't tried it yet, but it
may cause two `FunctionCov` with the same root range in the same `ScriptCov`.
In this situation, the algorithm simply matches the two `FunctionCov`.</sub>

When a list of `FunctionCov` is matched (=corresponds to the same block of
code), it is passed to the "range merging" phase to produce a single
`FunctionCov`. This process is applied for each set of matching `FunctionCov`.
The matching `ScriptCov` are then simply replaced by a `ScriptCov` with the
same `url` and list of merged `FunctionCov`. The `scriptId` is just chosen
to be unique.
A bit of normalization is applied to improve determinism: the scripts are sorted
by `url`, and the functions by their root range (increasing `startOffset` then
decreasing `endOffset`).

## Range merging

This phase is the meat of algorithm: it sums lists of ranges.

I will first give more details about the structure of `ranges` in a
`FunctionCov`, then explain the expected results (including the _left bias
rule_), and finally outline the algorithm.

### Ranges

Inside each `FunctionCov`, `ranges` is a list of pre-order sorted nodes from a
tree covering the AST.

Let me go with an example. Here is a small function with its offsets:

```
(foo) => { for (const _ of "rgb") { alert(foo ?  0 : 1) } return foo ? "true" : "false"}
|                                 |           |   |      |           |       |          |
0                                 34          46  50     57          69      77         88
```

Calling this function once with the argument `false` produces this `FunctionCov`:

```json
{
  "functionName": "",
  "ranges": [
    {"startOffset":  0, "endOffset": 88, "count": 1},
    {"startOffset": 34, "endOffset": 57, "count": 3},
    {"startOffset": 46, "endOffset": 50, "count": 0},
    {"startOffset": 69, "endOffset": 77, "count": 0}
  ],
  "isBlockCoverage": true,
}
```

The easiest way to visualize the ranges is to draw them under the function.
Their representation starts and ends at the corresponding offsets, the number
corresponds to the count.

```
(foo) => { for (const _ of "rgb") { alert(foo ?  0 : 1) } return foo ? "true" : "false"}
|                                 |           |   |      |           |       |          |
0                                 34          46  50     57          69      77         88
|                                 |           |   |      |           |       |          |
[1-------------------------------------------------------------------------------------)
                                  [3--------------------)            [0-----)
                                              [0-)
```

When drawn this way, the tree formed by the ranges becomes apparent. The ranges
inside a `FunctionCov` either nest or are disjoint: based on the inclusion
relation, you can form a tree. The first range is always the root: it includes
all the other ones. There is no partial overlap inside a `FunctionCov`: the
ranges either nest (ancestor/descendant relationship) or are disjoint.

I call this tree of ranges the **range tree**.

[Pre-order tree traversal][wiki-tree-traversal-pre-order] means that you start
at the root and traverse the tree by always going to the left-most node that
you haven't visited yet. Every time you enter a node for the first time, you
emit it. The ranges are sorted according this traversal.
Another way to state it is that **the ranges are sorted by increasing
`startOffset` then decreasing `endOffset`**.

The range tree is "covering" the Abstract Syntax Tree (AST). I mean two things:
**the count of an AST node corresponds to the smallest range containing it**,
and a single range can correspond to multiple AST nodes.

For example, the `alert(...)` expression is contained by two ranges: the root
range and range with a count of `3`. The latter is the smaller one, so the
count associated to `alert(...)` is `3`: `alert` was called three times.
The root range corresponds to both the `for` and `return` statements (count of
`1`).

The merge algorithm handles the ranges as a tree. Converting from a flat list
to a tree is the first step of the algorithm. It then merges the trees and
flattens the result back to a list.

### Expected behavior

This section is about detailing the expected behavior when merging two range
trees. The high level goal is to produce merged coverages compatible with
the ones produced experimentally: they should sum the counts.

The range trees from matching `FunctionCov` can have different structures.
V8 is trying to reduce the number of `ranges` in its coverages to reduce the
file sizes. This "compression" is for example achieved by fusing together
contiguous ranges with the same counts. Due to this, the structure of the tree
depends on how the function was called. The same block of code can produce
trees with different offsets, different amounts of nodes, or even partially
overlapping ranges (when comparing trees produced by different processes). The
only range guaranteed to match is the root range.

The trees are merged recursively, starting at the root. Since all the trees
have the same root, merging it consists simply in summing the counts of all
the root ranges.

The interesting part is when we start handling the children because they can
have different ranges. The merge algorithm merges any number of coverages at
the same time, but it's mostly an optimization. You can think about the
expected result when merging two trees and then generalize it to many trees
processed at the same time.

If you compare two numbers, there are 3 possibilities: "LesserThan", "Equal"
and "GreaterThan". If you take any two arbitrary ranges, there are 13 ways to
compare them one relative to the other. For our purpose, these possibilities
can be grouped into 4 families (or configurations):

```
Configuration "equal":
        [1---------)            (Reference)
        [2---------)            Equal

Configuration "disjoint":
        [1---------)            (Reference)
[2-----)                        BeforeAdjacent
[2-)                            BeforeStrict
                    [2-----)    AfterAdjacent
                        [2-)    AfterStrict

Configuration "nested":
        [1---------)            (Reference)
[2-------------------------)    OverlapStrict
[2-----------------)            OverlapEqualEnd
        [2-----------------)    OverlapEqualStart
        [2-----)                ContainedEqualStart
            [2-----)            ContainedEqualEnd
            [2-)                ContainedStrict

Configuration "partial overlap":
        [1---------)            (Reference)
[2-------------)                PartialOverlapStart
            [2-------------)    PartialOverlapEnd
```

Each family describes a configuration between two children nodes (for example,
we want to merge the first child of each root range).
The merge algorithm can be defined based on how these 4 configurations are
handled.
For each of these configurations, there is a "merge rule": a description of how
the counts in the result are related to the inputs. These depend on the count
of the two child nodes we are merging (`a` and `b`) and the counts of their
parent (`A` and `B`). The rules are given as ASCII diagrams.

#### Equal

```
--A---------------------------
         [a---------)
+
--B---------------------------
         [b---------)
=
--A+B-------------------------
         [a+b-------)
```

This is the easiest situation: if both trees have the same structure, you just
sum the corresponding counts.

#### Disjoint

```
--A---------------------------
       [a-----)
+
--B---------------------------
                  [b-----)
=
--A+B-------------------------
       [a+B---)   [A+b---)
```

Any AST node contained by the range `[a--)` will have a count of `B` in the
the second function coverage (inherited from the parent). Summing both, we
get the count `a+B`. The same reasoning applies to the other child range.
Notice that the original trees had a single child each, but the merged tree
has two. These children do not break the "AST coverage" property because their
boundaries have the same offsets and "orientation" as in the input trees (they
don't split any new AST node).

#### Nested

```
--A---------------------------
      [a---------------)
+
--B---------------------------
           [b-----)
=
--A+B-------------------------
      [a+B-------------)
           [a+b---)
```

The `[a+b--)` result comes from the same argument as for the "disjoint"
configuration (AST nodes contained in `[b--)` have a count of `a` in the other
coverage).
Using a similar reasoning, we can find that the count for the nodes contained
in `[a--)` but not by `[b--)` is `a+B`.
This count is attached to a layer between the parent and `[a+b--)`. Adding this
nesting layer allows to not introduce new splits. It's important to understand
why increasing nesting is required in this situation.

One may have thought of the following solution instead, with extra split
but without an extra layers:

```
--A---------------------------
      [a---------------)
+
--B---------------------------
           [b-----)
=
--A+B-------------------------
      [a+B)[a+b---)[a+B)
          ^        ^
```

This rule introduces a closing split and opening split at the marked positions.
Those splits were not present in the original trees so it's not safe to add
them. Here is an example where this would not work:


```
/* ... */ if (foo) { if(bar) { doAction() }    } /* ... */
--10------------------------------------------------------
                   [1--------------------------)
+
--20------------------------------------------------------
                             [2-----------)

```

(first case: called 9 times with `{foo: false}` and once with
`{foo: true, bar: true}`; second case: called 18 times with
`{foo: true, bar: false}` and twice with `{foo: true, bar: true}`)

The valid "nested" rule and invalid "flat nested" rule would produce:
```
/* ... */ if (foo) { if(bar) { doAction() }    } /* ... */
valid "nested" rule:
--30------------------------------------------------------
                   [21-------------------------)
                             [3-----------)
invalid "flat" rule:
--30------------------------------------------------------
                   [21------)[3-----------)[21-)
```

The statement `if(bar) { ... }` is evaluated 21 times in total, but in the
invalid case, the smallest range containing this statement has a count `30`.

<sub>I don't remember well, but I also think that there were issues with
associativity when using the invalid variant.</sub>

It is not safe to introduce splits. That's why you need to add an extra layer.
this matches experimental results.

#### Partial overlap

```
--A---------------------------
      [a----------)
+
--B---------------------------
           [b----------)
=
--A+B-------------------------
      [a+B--------)[A+b)
           [a+b---)
```

Understanding why the "nested" rule introduces an extra layer to avoid splits
is important to understand the chosen "partial overlap" rule.

The partially overlapping configuration is the only configuration where you
need to introduce splits in the merged tree to get matching counts on AST nodes
attached to the leafs of the tree.
The next best solution introduces a single split. The chosen rule (above) is
the "left bias" variant because it favors the left range. The left range is
untouched, but the right range is split in two. The "right bias" variant looks
like this:

```
--A---------------------------
      [a----------)
+
--B---------------------------
           [b----------)
=
--A+B-------------------------
      [a+B)[A+b--------)
           [a+b---)
```

If the merge algorithm was working in a vacuum, there would be no way to decide
which variant to use. Without the AST, you don't know which of the splits
are safe and which break new AST nodes. But we're no working on some
imaginary trees: they come from JS code.

A split usually corresponds to a branch in the control flow graph. It can be
caused by elements such as `if`, `for`, `&&`, default function parameters,
`return`, `throw`, etc.
Out of those, the first tokens of the node is always executed, then there's a
body and then an optional sequence of closing tokens. Because of this grammar,
it's more common to have cases where parent/child ranges with the same
`endOffset` rather than the same `startOffset`. Two ranges starting at the same
offset mean the start of a node gets a different count than its parent.

I found a few cases where two ranges (from the same tree) start at the same
offset. Most of them were bugs (that I reported to the V8 team), but some may be
legitimate situations: there were too much in my samples to check them all. I
haven't checked yet using the patched V8 version. For example, [this function](https://github.com/nodejs/node/blob/4f0971d3665e0a946d3799f0398b7a4cfd43bddf/lib/internal/errors.js#L415)
had many ranges with the same start offsets.
If it turns out that it is impossible to have two ranges starting at the same
offset in the same tree, it would easily prove that the "right bias" variant is
always invalid. As it stands, **I am unable to completely rule out the "right
bias" variant**.

The algorithm can only have one rule (because it does not have access to the
AST). I can't definitely discard the "right bias" rule, but I can exhibit cases
where the "left bias" rule is required. Here's one such case (slightly
simplified to remove an irrelevant range over whitespace):

```
(n) => { if (n > 0) { if (true) { return true; console.log('foo') } } return false; }

[1----------------------------------------------------------------------------------)
                    [0----------------------------------------------)
+
[2----------------------------------------------------------------------------------)
                                 [0----------------------------------------------)
```

(first case: called once with `{n: 0}`; second case: called twice with
`{n: 1}`)

Here is what you get depending on the variant:
```
(n) => { if (n > 0) { if (true) { return true; console.log('foo') } } return false; }
left bias:
[3----------------------------------------------------------------------------------)
                    [2----------------------------------------------)[1----------)
                                             [0-------------------)
right bias:
[3----------------------------------------------------------------------------------)
                    [2----------------------)[1----------------------------------)
                                             [0-------------------)
```

The `if (true) { ... }` statement is evaluated twice. You get this result using
the left bias rule, but using the right-bias variant you get a count of `3`.
When generating the merged result experimentally (performing the calls inside
the same process), V8 returns coverage matching the left bias rule. It confirms
that it's the right one in this case.

I couldn't find cases where the "right bias" variant was required. Either the
bias was irrelevant, or "left bias" was required. Because of this, partially
overlapping child nodes are merged with the left bias rule.

If a case is ever found when the left bias rule produces invalid results (so
the right bias variant should have been used), it means that it is impossible
to decide which variant to use without the source text and the whole algorithm
is invalid.

#### Summary

Here are all the merge rules together:

```
--A---------------------------
         [a---------)
+
--B---------------------------
         [b---------)
=
--A+B-------------------------
         [a+b-------)
```

```
--A---------------------------
       [a-----)
+
--B---------------------------
                  [b-----)
=
--A+B-------------------------
       [a+B---)   [A+b---)
```

```
--A---------------------------
      [a---------------)
+
--B---------------------------
           [b-----)
=
--A+B-------------------------
      [a+B-------------)
           [a+b---)
```

```
--A---------------------------
      [a----------)
+
--B---------------------------
           [b----------)
=
--A+B-------------------------
      [a+B--------)[A+b)
           [a+b---)
```

Some observations:
- If you scan the children from the left, the first one you hit is never split
  or moved to a deeper layer: it always corresponds a child in the output.
- You can decompose a "partially overlapping" configuration as a "nested"
  configuration followed by a "disjoint" configuration by splitting `b`
  beforehand:
  ```
  --A---------------------------
        [a----------)
  +
  --B---------------------------
             [b----------)
  =
  --A---------------------------
        [a----------)
  +
  --B---------------------------
             [b-----)[b--)
  =
  --A+B-------------------------
        [a+B--------)[A+b)
             [a+b---)
  ```
- You can decompose a "nested" configuration to an "equal" configuration by
  nesting `b` beforehand:

  ```
  --A---------------------------
        [a---------------)
  +
  --B---------------------------
             [b-----)
  =
  --A---------------------------
        [a---------------)
  +
  --B---------------------------
        [b---------------)
             [b-----)
  =
  --A+B-------------------------
        [a+B-------------)
             [a+b---)
  ```

### Overview of the merge algorithm

This section gives an overview of the actual implementation of the algorithm.
Check the code if you want to go into more details.

The general strategy to merge lists of `ranges` is the following:
1. Convert each list to a range tree.
2. Convert each range tree to a "delta" range tree. Instead of storing absolute
   `count` values, store the difference between the child count and parent count
   ("delta count").
3. Recursively merge nodes with the same offsets (starting from the roots,
   which have the same offsets by definition).
   1. The merged delta count is the sum of the individual delta counts.
   2. Group and sort the children by `startOffset`.
   3. Scan the children from the left until you hit one: it becomes the current
      "open range". If many nodes have the same `startOffset`, keep the largest
      one.
   4. Collect all the other children that have a `startOffset` inside the open
      range.
   5. If their `endOffset` is outside the open range, we have a partial overlap:
      perform a split. Keep the part inside the open range and put the other
      part back with the unprocessed children.
   6. For all the ranges that are strictly included in the open range, add an
      intermediate node ("wrapper") with the same offsets as the open range and
      a delta count of `0`.
   7. All the collected ranges should now have the same offsets as the open
      range: they were either already equal or are wrapper containing smaller
      nodes. Merge them (recursion).
   8. Continue scanning the remaining children (go to the third step).
4. Normalize the tree: fuse contiguous ranges with the same counts, remove
   nodes with a "delta count" of 0, fuse children and parents with the same
   offsets.
5. Convert the delta range tree back to a range tree with absolute counts.
6. Flatten the range tree to a list.

TODO: Give more details about the algorithm:
- Tree construction
- Delta counts
- Scan line
- Start events
- Open range
- Wrappers
- Tree normalization
- Flattening

[wiki-tree-traversal-pre-order]: https://en.wikipedia.org/wiki/Tree_traversal#Pre-order_(NLR)
