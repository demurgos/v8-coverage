use coverage::RangeCov;
use std::iter::Peekable;
use typed_arena::Arena;

pub struct RangeTreeArena<'a>(Arena<RangeTree<'a>>);

impl<'a> RangeTreeArena<'a> {
  pub fn new() -> Self {
    RangeTreeArena(Arena::new())
  }

  pub fn with_capacity(n: usize) -> Self {
    RangeTreeArena(Arena::with_capacity(n))
  }

  pub fn alloc(&'a self, value: RangeTree<'a>) -> &'a mut RangeTree<'a> {
    self.0.alloc(value)
  }
}

#[derive(Eq, PartialEq, Debug)]
pub struct RangeTree<'a> {
  pub start: usize,
  pub end: usize,
  pub count: i64,
  pub children: Vec<&'a mut RangeTree<'a>>,
}

impl<'rt> RangeTree<'rt> {
  pub fn new<'a>(start: usize, end: usize, count: i64, children: Vec<&'a mut RangeTree<'a>>) -> RangeTree<'a> {
    RangeTree {
      start,
      end,
      count,
      children,
    }
  }

  pub fn split<'a>(rta: &'a RangeTreeArena<'a>, tree: &'a mut RangeTree<'a>, value: usize) -> (&'a mut RangeTree<'a>, &'a mut RangeTree<'a>) {
    let mut left_children: Vec<&'a mut RangeTree<'a>> = Vec::new();
    let mut right_children: Vec<&'a mut RangeTree<'a>> = Vec::new();
    for child in tree.children.iter_mut() {
      if child.end <= value {
        left_children.push(child);
      } else if value <= child.start {
        right_children.push(child);
      } else {
        let (left_child, right_child) = Self::split(rta, child, value);
        left_children.push(left_child);
        right_children.push(right_child);
      }
    }

    let left = RangeTree::new(tree.start, value, tree.count, left_children);
    let right = RangeTree::new(value, tree.end, tree.count, right_children);
    (rta.alloc(left), rta.alloc(right))
  }

  pub fn normalize<'a>(rta: &'a RangeTreeArena<'a>, tree: &'a mut RangeTree<'a>) -> &'a mut RangeTree<'a> {
    tree.children = {
      let mut children: Vec<&'a mut RangeTree<'a>> = Vec::new();
      let mut chain: Vec<&'a mut RangeTree<'a>> = Vec::new();
      for child in tree.children.drain(..) {
        let is_chain_end: bool = match chain.last().map(|tree| (tree.count, tree.end)) {
          Some((count, chain_end)) => (count, chain_end) != (child.count, child.start),
          None => false,
        };
        if is_chain_end {
          let mut chain_iter = chain.drain(..);
          let mut head: &'a mut RangeTree<'a> = chain_iter.next().unwrap();
          for tree in chain_iter {
            head.end = tree.end;
            head.children.extend(tree.children.drain(..));
          }
          children.push(RangeTree::normalize(rta, head));
        }
        chain.push(child)
      }
      if !chain.is_empty() {
        let mut chain_iter = chain.drain(..);
        let mut head: &'a mut RangeTree<'a> = chain_iter.next().unwrap();
        for tree in chain_iter {
          head.end = tree.end;
          head.children.extend(tree.children.drain(..));
        }
        children.push(RangeTree::normalize(rta, head));
      }

      if children.len() == 1 && children[0].start == tree.start && children[0].end == tree.end {
        let child = children.remove(0);
        tree.count = child.count;
        children = child.children.drain(..).collect();
      }

      children
    };

    tree
  }

  pub fn add_count(&mut self, value: i64) -> () {
    self.count += value;
    for child in self.children.iter_mut() {
      child.add_count(value);
    }
  }

  pub fn to_ranges(&self) -> Vec<RangeCov> {
    let mut ranges: Vec<RangeCov> = Vec::new();
    let mut stack: Vec<&RangeTree> = vec![self];
    while let Some(ref cur) = stack.pop() {
      ranges.push(RangeCov { start_offset: cur.start, end_offset: cur.end, count: cur.count });
      for child in cur.children.iter().rev() {
        stack.push(child)
      }
    }
    ranges
  }

  pub fn from_sorted_ranges<'a>(rta: &'a RangeTreeArena<'a>, ranges: &[RangeCov]) -> Option<&'a mut RangeTree<'a>> {
    Self::from_sorted_ranges_inner(rta, &mut ranges.iter().peekable(), ::std::usize::MAX)
  }

  fn from_sorted_ranges_inner<'a, 'b, 'c: 'b>(rta: &'a RangeTreeArena<'a>, ranges: &'b mut Peekable<impl Iterator<Item=&'c RangeCov>>, parent_end: usize) -> Option<&'a mut RangeTree<'a>> {
    let has_range: bool = match ranges.peek() {
      None => false,
      Some(ref range) => range.start_offset < parent_end,
    };
    if !has_range {
      return None;
    }
    let range = ranges.next().unwrap();
    let start: usize = range.start_offset;
    let end: usize = range.end_offset;
    let count: i64 = range.count;
    let mut children: Vec<&mut RangeTree> = Vec::new();
    while let Some(child) = Self::from_sorted_ranges_inner(rta, ranges, end) {
      children.push(child);
    }
    Some(rta.alloc(RangeTree::new(start, end, count, children)))
  }
}

#[cfg(test)]
mod tests {
  use coverage::RangeCov;
  use super::RangeTree;
  use super::RangeTreeArena;

  #[test]
  fn from_sorted_ranges_empty() {
    let rta = RangeTreeArena::new();
    let inputs: Vec<RangeCov> = vec![
      RangeCov { start_offset: 0, end_offset: 9, count: 1 },
    ];
    let actual: Option<&mut RangeTree> = RangeTree::from_sorted_ranges(&rta, &inputs);
    let expected: Option<&mut RangeTree> = Some(rta.alloc(RangeTree::new(0, 9, 1, Vec::new())));

    assert_eq!(actual, expected);
  }
}
