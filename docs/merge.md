# Merge

This document describes the merge algorithm.

The merge algorithm takes a list of process coverages (or smaller items) and
outputs a single object combining the information in the inputs. The goal is
to simulate the result V8 would have returned if the coverages were executed
sequentially inside the same process instead of their own processes (so the
counts are summed).

This algorithm depends only on the input coverages: it does not use the source
text or Abstract Syntax Tree (AST) of the covered scripts. This means that
the algorithm does not have as much information as the V8 profiler.

If you do an experiment and run the V8 profiler on two entry points in their
own process and then in the same process (experimental merging), you will get
different results than if you use the merge algorithm. The experimental result
may have more or smaller ranges, but both results should be compatible. In both
cases, using the count of the smallest range containing an AST node should
return the same result. (This is what I call "coverage inclusion": one is more
general than the other but they yield the same results when applied on the
source text).

This lack of source text information is also the reason for one the main
unproven assumptions of the algorithm: the **left bias rule**. It will be
detailed further down, but it relates to how partially overlapping ranges are
handled. There are two choices "left bias" or "right bias". Choosing the wrong
may break the validity of the coverage but there is no way to decide without
the source text. I know cases where you need to use the "left bias", but wasn't
able to find (or create) cases where the "right bias" is required. Because of
this, the algorithm applies the rule of always using the "left bias". If a case
is ever found where the "right bias" must be used, it would imply that merging
coverages without the source text is ambiguous. If the left bias rule does not
hold, merging without the source text is impossible.

The algorithm has the following properties (if you find a counter example,
please file an issue):
- Commutativity: If your list has two items, their order does not matter.
  Both `merge([a, b])` and `merge([b, a])` return the same result.
- Associativity: You can reduce your input list by calling the algorithm on any
  contiguous subset of the input and get the same result. All of the following
  return the same result:
  - `merge([a, b, c, d])`
  - `[b, c, d].reduce(a, (acc, next) => merge([acc, next]))`
  - `[a, b, c].reduceRight(d, (acc, next) => merge([next, acc]))`
  - `merge([merge([a, b]), merge([c, d])])`

These two properties together mean that the order of the inputs and calls does
not matter: the final result will always be the same.

## Overview

The algorithm has two main main steps: function matching and range merging.
The functions are the main units of coverage. The first step corresponds to
group function coverages coming from different process coverages if they
relate to the same function in the source text. The second step is the harder
part: it takes lists of range coverages and returns a single list that
represents the sum of the counts for all the AST nodes in the function.

## Function matching

The coverages have a hierarchical structure: process coverages contain script
coverages which contain function coverages. The function matching step searches
`FunctionCov` values from different coverages that are corresponding to the same
function. A function is matching another one if it is in the same file and
covers the same span of source text.

This means that we are assuming that the source text of the scripts does not
change between process coverages. In case the program is that dynamic, there's
no easy way to merge coverages so it's usually a pretty good assumption.

The algorithm first matches scripts: across process coverages, it takes
scripts with the same `url` value. The `scriptId` is ignored because this value
depends on the load order and is not relied in the presence of dynamically
loaded modules (optional dependencies, conditional dependencies, etc.).

Then inside each list of matching scripts, it matches functions based on their
span, or _root range_. For each function coverage, `ranges[0]` is defined
and corresponds to the whole span of the function: from just before the
`function` keyword to just after the closing brace `}` (`ranges[0].count` is
the number of times the function was called). For `FunctionCov` values
corresponding to the whole module, the span simply covers the entire file.

Inside a script, the functions are matched with the `startOffset` and
`endOffset` of their root range. The `functionName` is ignored because it
is not that reliable (multiple functions can have the same name inside the
same script).

Assuming the source text is not dynamically modified, this method of matching
is unambiguous. There could be one edge case if the whole source text is a
single function definition without anything outside (no assignation,
no import/expert, no semicolon, no new line). I haven't tried it yet, but it
may cause two `FunctionCov` with the same root range in the same `ScriptCov`.
In this situation, the algorithm simply matches the two `FunctionCov`.

When a list of `FunctionCov` is matched, it is passed to the "range merging"
phase to produce a single `FunctionCov`. This process is applied for each
group of matching `FunctionCov`.
The matching `ScriptCov` are then simply replaced by a `ScriptCov` with the
same `url` and list of merged `FunctionCov`. The `scriptId` is just chosen
to be unique.
A small normalization is applied to improve determinism: the scripts are sorted
by `url`, and the functions by their root range (increasing `startOffset`,
decreasing `endOffset`).

## Range merging

This phase is the meat of algorithm: it sums lists of ranges.

I will first give more details about the structure of `ranges` in a
`FunctionCov`, then explained the expected results (including the _left bias
rule_), and finally outline the algorithm.

### Ranges

Inside each `FunctionCov`, `ranges` is a list of pre-order sorted nodes of a
tree covering the AST.

Let me go with an example. I'll write a single-line function with its offsets:

```
(foo) => { for (const _ of "rgb") { alert(foo ?  0 : 1) } return foo ? "true" : "false"}
▏                                 ▏           ▏   ▏      ▏           ▏       ▏          ▏
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
▏                                 ▏           ▏   ▏      ▏           ▏       ▏          ▏
0                                 34          46  50     57          69      77         88
▏                                 ▏           ▏   ▏      ▏           ▏       ▏          ▏
[1-------------------------------------------------------------------------------------)
                                  [3---------------------)           [0-----)
                                              [0-)
```

When drawn this way, the tree formed by the ranges becomes apparent. The ranges
inside a `FunctionCov` either nest or are disjoint: based on their inclusion
relation, you can form a tree. The first range is always the root: it is larger
than all of the following ranges. There is never any partial overlap inside
single `FunctionCov`: the ranges either nest (ancestor/descendant relationship)
or are disjoint.

This tree of ranges is called a **range tree**.

[Pre-order tree traversal][wiki-tree-traversal-pre-order] means that you start
at the root and traverse the tree by always going to the left-most node that
you haven't visited yet. Every time you enter a node for the first time, you
emit it. The ranges are sorted according this traversal.
Another way to state that the ranges are pre-order sorted is that they are
sorted by increasing `startOffset` then decreasing `endOffset`.

The range tree is "covering" the Abstract Syntax Tree (AST). I mean two things:
the count of an AST node is the smallest range containing it, and multiple AST
nodes can correspond to the same range tree node.
For exemple, the `alert(...)` expression is contained by two ranges: the root
range and range with a count of `3`. The latter is the smaller one, so the
count associated to `alert(...)` is `3`: `alert` was called three times.
The `for` and `return` statements both correspond to the root range (with a
count of `1`).

The merge algorithm handles the ranges as a tree: converting from a flat list
to a tree is the first step of the algorithm. It then merges the trees and
flattens the result back to a list.

### Expected behavior

The range trees from matching `FunctionCov` can have different structures.
Some can have more nodes, nodes at different offsets, or even with partially
overlapping ranges (across `FunctionCov` values from different process
coverages).

The trees are merged recursively, starting at the root. One of the conditions
for the function coverages to match is that their root ranges all have the
same offsets. In the merged tree, the root also has the same offsets; its
count is the sum of the counts.
For example, if there a 3 process coverages, and the root range of the same
function has respectively `count` values of `1`, `2` and `3` then it means
that in total the function was called 6 times and the merged tree will have
a root with a count of `6`. Pretty straight forward.

The interesting part is when we start handling the children because they can
have different ranges. The merge algorithm merges any number of coverages at
the same time, but it's mostly an optimization. You can think about the
expected result when merging two trees and then generalize it to many trees
processed at the same time.
If you take any two arbitrary children ranges, there are 13 ways to compare
them one relative to the other. Scalars have 3 possibilities: "LesserThan",
"Equal", "GreaterThan"; for ranges there are 13 possibilities. For our purpose,
these possibilities can be grouped into 4 families:

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

Each family describes a configuration between two children nodes. Merge rules
be defined based on how these 4 configurations are handled. These definitions
are based on the `count` of the parent nodes (context) and `count` of the
child nodes. The definition will be given as ASCII drawings. `A` and `B` are
the parent counts, `a` and `b` the children counts.

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
don't split an AST node from the other function coverage).

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
The count for the nodes contained in `[a--)` but not by `[b--)` is `a+B`, but
why introduce an extra nesting level? This avoids introducing extra splits.
Since AST nodes get the count of the smallest range containing them, this
merge result will assign them the correct results.

One may have thought of the following solution instead, with extra split
but without extra layers:

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

But this introduces a closing split and opening split at the marked positions.
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
nested (valid):
--30------------------------------------------------------
                   [21-------------------------)
                             [3-----------)
flat nested (invalid):
--30------------------------------------------------------
                   [21------)[2-----------)[21-)
```

The statement `if(bar) { ... }` is evaluated 21 times in total, but in the
invalid case, the smallest range containing this statement has a count `30`.

#### Partial overlap

Understanding why the "nested" rule introduces an extra layer to avoid nesting
is important to understand the chosen "partial overlap" rule.


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

The partially overlapping configuration is the only configuration where you
need to introduce splits in the merged tree to get matching counts on AST nodes
attached to the leafs of the tree.
The next best solution introduces a single split. The chose rule (above) is
the "left bias" variant because it favors the left range and splits the right
range. The "right bias" variant looks like this:

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

If the merge algorithm was working in the void, there would be no way to decide
which which variant should be used. Without the AST, you don't know which of
the splits is safe and which breaks an AST node. But we're no working on some
imaginary trees, but ones produced based on the JS syntax.

A split usually corresponds to a branch in the control flow graph. This can
be introduced by elements such as `if`, `for`, `&&`, default function
parameters, `return`, `throw`, etc.
Out of those, the first tokens of the node always executed, then there's a body
and then an optional sequence of closing tokens. Because of this syntax, it's
more common to have cases where parent/child ranges and at the same offset
than start at the same offset. Two ranges starting at the same offset mean
the start of a node gets a different count than its parent node.

I found a few cases where two ranges start at the same offset. Most of them
were bugs (that I reported to the V8 team), but some may be legit situations.
If there were no legit cases where two ranges can start at the same offset, it
would have given an easy proof that the "right bias" variant is impossible.
I haven't tried running my tests with the patched V8 version. Maybe all the
cases I found were bugs. For example, [this function](https://github.com/nodejs/node/blob/4f0971d3665e0a946d3799f0398b7a4cfd43bddf/lib/internal/errors.js#L415)
exhibited this behavior.

Since I can't definitely discard the "right bias" rule, I can at least find
cases supporting the "left bias" rule. Here's one such case (slightly
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

Because there exists a case when the left bias must be used, that the right
bias rule seems unlikely (after looking at the JS syntax) and because you must
pick one, I have chose to use the left bias rule.

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

### Overview of the merge algorithm

This section gives an overview of the actual implementation of the algorithm.
Check the actual implementation for the whole details.

This algorithm is designed to be fast. This algorithm should be used to handle
the Node or npm test suites. These generates thousands of process coverages
(adding up to hundreds of megabytes). The initial implementation took roughly
50 seconds on my computer to merge these coverages. Careful changes to the
algorithm and implementation took this time down to about 3 seconds.
These times are for the Node implementation. I also wrote a Rust implementation
to compare the performance (and have another implementation to double check).
I only managed to go down to 4 seconds with single-threaded Rust (1.2s with
multithreading). I was very impressed that V8 managed to run the algorithm as
fast (or faster) as native code. (Disclaimer: I'm good at Node, not so much at
Rust, tips are welcome).

TODO: Actually explain the algorithm:
- Tree construction
- Delta counts
- Scan line
- Start events
- Open range
- Wrappers
- Tree normalization
- Flattening

[wiki-tree-traversal-pre-order]: https://en.wikipedia.org/wiki/Tree_traversal#Pre-order_(NLR)
