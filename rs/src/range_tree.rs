use coverage::RangeCov;

#[derive(Eq, PartialEq, Clone, Debug)]
pub struct RangeTree {
  pub start: usize,
  pub end: usize,
  pub count: i64,
  pub children: Vec<Box<RangeTree>>,
}

impl RangeTree {
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

  pub fn from_sorted_ranges(ranges: &Vec<RangeCov>) -> Option<Box<RangeTree>> {
    if ranges.len() == 0 {
      return None;
    }
    let first = ranges[0];
    let mut root: Box<RangeTree> = Box::new(RangeTree {
      start: first.start_offset,
      end: first.end_offset,
      count: first.count,
      children: Vec::new(),
    });
    {
      let mut stack: Vec<*mut RangeTree> = Vec::new();
      stack.push(&mut *root);

      for range in ranges.iter().skip(1) {
        let parent_idx: usize = get_parent_index(&stack, range.start_offset).unwrap();
        let mut node = Box::new(RangeTree {
          start: range.start_offset,
          end: range.end_offset,
          count: range.count,
          children: Vec::new(),
        });
        let parent_ptr: *mut RangeTree = stack[parent_idx];
        let ptr: *mut RangeTree = &mut *node;
        (unsafe { parent_ptr.as_mut() }).unwrap().children.push(node);
        stack.push(ptr);
      }
    }
    Some(root)
  }
}

fn get_parent_index(stack: &Vec<*mut RangeTree>, child_start: usize) -> Option<usize> {
  for (i, tree) in stack.iter().enumerate().rev() {
    if child_start < (unsafe { tree.as_ref() }).unwrap().end {
      return Some(i);
    }
  }
  None
}
