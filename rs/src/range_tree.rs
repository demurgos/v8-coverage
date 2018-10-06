use coverage::RangeCov;
use std::iter::Peekable;

#[derive(Eq, PartialEq, Clone, Debug)]
pub struct RangeTree {
  pub start: usize,
  pub end: usize,
  pub count: i64,
  pub children: Vec<RangeTree>,
}

impl RangeTree {
  pub fn new(start: usize, end: usize, count: i64, children: Vec<RangeTree>) -> RangeTree {
    Self {
      start,
      end,
      count,
      children,
    }
  }

  pub fn split(self, value: usize) -> (Self, Self) {
    let mut left_children: Vec<Self> = Vec::new();
    let mut right_children: Vec<Self> = Vec::new();
    for child in self.children {
      if child.end <= value {
        left_children.push(child);
      } else if value <= child.start {
        right_children.push(child);
      } else {
        let (left_child, right_child) = child.split(value);
        left_children.push(left_child);
        right_children.push(right_child);
      }
    }

    let left = RangeTree::new(self.start, value, self.count, left_children);
    let right = RangeTree::new(value, self.end, self.count, right_children);
    (left, right)
  }

  pub fn normalize(mut self) -> Self {
    self.children = {
      let mut children: Vec<RangeTree> = Vec::new();
      let mut chain: Vec<RangeTree> = Vec::new();
      for child in self.children.into_iter() {
        let is_chain_end: bool = match chain.last().map(|tree| (tree.count, tree.end)) {
          Some((count, chain_end)) => (count, chain_end) != (child.count, child.start),
          None => false,
        };
        if is_chain_end {
          let mut chain_iter = chain.drain(..);
          let mut head: RangeTree = chain_iter.next().unwrap();
          for tree in chain_iter {
            head.end = tree.end;
            head.children.extend(tree.children.into_iter());
          }
          children.push(head.normalize());
        }
        chain.push(child)
      }
      if !chain.is_empty() {
        let mut chain_iter = chain.drain(..);
        let mut head: RangeTree = chain_iter.next().unwrap();
        for tree in chain_iter {
          head.end = tree.end;
          head.children.extend(tree.children.into_iter());
        }
        children.push(head.normalize());
      }

      if children.len() == 1 && children[0].start == self.start && children[0].end == self.end {
        let child = children.remove(0);
        self.count = child.count;
        children = child.children;
      }

      children
    };

    self
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

  pub fn from_sorted_ranges(ranges: &[RangeCov]) -> Option<RangeTree> {
    Self::from_sorted_ranges_inner(&mut ranges.iter().peekable(), ::std::usize::MAX)
  }

  fn from_sorted_ranges_inner<'a, 'b: 'a>(ranges: &'a mut Peekable<impl Iterator<Item=&'b RangeCov>>, parent_end: usize) -> Option<RangeTree> {
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
    let mut children: Vec<RangeTree> = Vec::new();
    while let Some(child) = Self::from_sorted_ranges_inner(ranges, end) {
      children.push(child);
    }
    Some(RangeTree::new(start, end, count, children))
  }
}
