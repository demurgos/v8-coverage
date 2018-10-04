use coverage::RangeCov;
use std::cell::RefCell;
use std::rc::Rc;

pub type RangeTreeRef = Rc<RefCell<RangeTree>>;

#[derive(Eq, PartialEq, Clone, Debug)]
pub struct RangeTree {
  pub start: usize,
  pub end: usize,
  pub count: i64,
  pub children: Vec<RangeTreeRef>,
}

impl RangeTree {
  pub fn new(start: usize, end: usize, count: i64, children: Vec<RangeTreeRef>) -> RangeTree {
    Self {
      start,
      end,
      count,
      children,
    }
  }

  pub fn split(&mut self, value: usize) -> RangeTreeRef {
    let mut left_child_len: usize = self.children.len();
    let mut mid: Option<RangeTreeRef> = None;
    for (i, child) in self.children.iter().enumerate() {
      let mut child = child.borrow_mut();
      if child.start < value && value < child.end {
        mid = Some(child.split(value));
        left_child_len = i + i;
        break;
      } else if child.start >= value {
        left_child_len = i;
        break;
      }
    }

    let mut right_children: Vec<RangeTreeRef> = Vec::new();
    if let Some(mid) = mid {
      right_children.push(mid);
    }

    right_children.extend(self.children.drain(left_child_len..));

    let right_end: usize = self.end;
    self.end = value;
    Rc::new(RefCell::new(RangeTree {
      start: value,
      end: right_end,
      count: self.count,
      children: right_children,
    }))
  }

  pub fn add_count(&mut self, value: i64) -> () {
    self.count += value;
    for child in &self.children {
      child.borrow_mut().add_count(value);
    }
  }

  pub fn to_ranges(&self) -> Vec<RangeCov> {
    let mut ranges: Vec<RangeCov> = Vec::new();
    let mut stack: Vec<RangeTreeRef> = Vec::new();
    ranges.push(RangeCov { start_offset: self.start, end_offset: self.end, count: self.count });
    for child in self.children.iter().rev() {
      stack.push(Rc::clone(child))
    }
    while let Some(ref cur) = stack.pop() {
      let cur = cur.borrow();
      ranges.push(RangeCov { start_offset: cur.start, end_offset: cur.end, count: cur.count });
      for child in cur.children.iter().rev() {
        stack.push(Rc::clone(child))
      }
    }
    ranges
  }

  pub fn from_sorted_ranges(ranges: &Vec<RangeCov>) -> Option<RangeTreeRef> {
    if ranges.len() == 0 {
      return None;
    }
    let first = ranges[0];
    let root: RangeTreeRef = Rc::new(RefCell::new(RangeTree::new(
      first.start_offset,
      first.end_offset,
      first.count,
      Vec::new(),
    )));
    {
      let mut stack: Vec<RangeTreeRef> = Vec::new();
      stack.push(Rc::clone(&root));

      for range in ranges.iter().skip(1) {
        let parent_idx: usize = get_parent_index(&stack, range.start_offset).unwrap();
        stack.truncate(parent_idx + 1);
        let mut node: RangeTreeRef = Rc::new(RefCell::new(RangeTree::new(
          range.start_offset,
          range.end_offset,
          range.count,
          Vec::new(),
        )));
        {
          stack[parent_idx].borrow_mut().children.push(Rc::clone(&node));
        }
        stack.push(node);
      }
    }
    Some(root)
  }
}

fn get_parent_index(stack: &Vec<RangeTreeRef>, child_start: usize) -> Option<usize> {
  for (i, tree) in stack.iter().enumerate().rev() {
    if child_start < tree.borrow().end {
      return Some(i);
    }
  }
  None
}
