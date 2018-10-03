use coverage::RangeCov;
use std::cell::Cell;
use std::rc::Rc;

#[derive(Eq, PartialEq, Clone, Debug)]
pub struct RangeTree {
  pub start: usize,
  pub end: usize,
  pub count: i64,
  pub children: Vec<Rc<RangeTree>>,
  pub parent_index: Cell<usize>,
}

impl RangeTree {
  pub fn new(start: usize, end: usize, count: i64, children: Vec<Rc<RangeTree>>) -> RangeTree {
    Self {
      start,
      end,
      count,
      children,
      parent_index: Cell::new(0),
    }
  }

  pub fn split(&mut self, value: usize) -> Rc<RangeTree> {
    let mut left_child_len: usize = self.children.len();
    let mut mid: Option<Rc<RangeTree>> = None;
    for (i, child) in self.children.iter_mut().enumerate() {
      if child.start < value && value < child.end {
        mid = Some(Rc::get_mut(child).unwrap().split(value));
        left_child_len = i + i;
        break;
      } else if child.start >= value {
        left_child_len = i;
        break;
      }
    }

    let mut right_children: Vec<Rc<RangeTree>> = Vec::new();
    if let Some(mid) = mid {
      right_children.push(mid);
    }

    right_children.extend(self.children.drain(left_child_len..));

    let right_end: usize = self.end;
    self.end = value;
    Rc::new(RangeTree {
      start: value,
      end: right_end,
      count: self.count,
      children: right_children,
      parent_index: self.parent_index.clone(),
    })
  }

  pub fn to_ranges(&self) -> Vec<RangeCov> {
    let mut ranges: Vec<RangeCov> = Vec::new();
    let mut stack: Vec<&RangeTree> = vec![self];
    while let Some(ref cur) = stack.pop() {
      ranges.push(RangeCov { start_offset: cur.start, end_offset: cur.end, count: cur.count });
      for child in cur.children.iter().rev() {
        stack.push(child.as_ref())
      }
    }
    ranges
  }

  pub fn from_sorted_ranges(ranges: &Vec<RangeCov>) -> Option<Rc<RangeTree>> {
    if ranges.len() == 0 {
      return None;
    }
    let first = ranges[0];
    let root: Rc<RangeTree> = Rc::new(RangeTree::new(
      first.start_offset,
      first.end_offset,
      first.count,
      Vec::new(),
    ));
    {
      let mut stack: Vec<Rc<RangeTree>> = Vec::new();
      stack.push(Rc::clone(&root));

      for range in ranges.iter().skip(1) {
        let parent_idx: usize = get_parent_index(&stack, range.start_offset).unwrap();
        let mut node = Rc::new(RangeTree::new(
          range.start_offset,
          range.end_offset,
          range.count,
          Vec::new(),
        ));
        {
          let parent: &mut RangeTree = Rc::get_mut(&mut stack[parent_idx]).unwrap();
          parent.children.push(Rc::clone(&node));
        }
        stack.push(node);
      }
    }
    Some(root)
  }
}

fn get_parent_index(stack: &Vec<Rc<RangeTree>>, child_start: usize) -> Option<usize> {
  for (i, tree) in stack.iter().enumerate().rev() {
    if child_start < tree.end {
      return Some(i);
    }
  }
  None
}
