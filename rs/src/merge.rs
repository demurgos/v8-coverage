use coverage::{FunctionCov, ProcessCov};
use coverage::RangeCov;
use coverage::ScriptCov;
use range_tree::RangeTree;
use range_tree::RangeTreeRef;
use std::cell::Ref;
use std::cell::RefCell;
use std::collections::BTreeSet;
use std::collections::HashMap;
use std::hash::Hash;
use std::rc::Rc;

pub fn merge_processes(processes: &Vec<ProcessCov>) -> Option<ProcessCov> {
  match processes.len() {
    0 => return None,
    1 => return Some(processes[0].clone()),
    _ => {}
  }
  let mut url_to_scripts: HashMap<String, Vec<ScriptCov>> = HashMap::new();
  for process_cov in processes {
    for script_cov in &process_cov.result {
      let mut scripts = url_to_scripts.entry(script_cov.url.clone()).or_insert(Vec::new());
      scripts.push(script_cov.clone());
    }
  }
  let mut result: Vec<ScriptCov> = Vec::new();
  let mut script_id: u64 = 1;
  for (_, scripts) in url_to_scripts.iter() {
    let mut merged: ScriptCov = merge_scripts(scripts).unwrap();
    merged.script_id = script_id.to_string();
    script_id += 1;
    result.push(merged)
  }

  Some(ProcessCov { result })
}

pub fn merge_scripts(scripts: &Vec<ScriptCov>) -> Option<ScriptCov> {
  match scripts.len() {
    0 => return None,
    1 => return Some(scripts[0].clone()),
    _ => {}
  }
  let first: &ScriptCov = &scripts[0];
  let mut range_to_funcs: HashMap<Range, Vec<FunctionCov>> = HashMap::new();
  for script_cov in scripts {
    for func_cov in &script_cov.functions {
      let root_range_cov: &RangeCov = &func_cov.ranges[0];
      let root_range = Range { start: root_range_cov.start_offset, end: root_range_cov.end_offset };
      let mut funcs = range_to_funcs.entry(root_range).or_insert(Vec::new());
      funcs.push(func_cov.clone());
    }
  }

  let mut functions: Vec<FunctionCov> = Vec::new();
  for (_, funcs) in range_to_funcs.iter() {
    let merged: FunctionCov = merge_functions(funcs).unwrap();
    functions.push(merged)
  }

  Some(ScriptCov { script_id: first.script_id.clone(), url: first.url.clone(), functions })
}

#[derive(Eq, PartialEq, Hash, Copy, Clone, Debug)]
struct Range {
  start: usize,
  end: usize,
}

pub fn merge_functions(funcs: &Vec<FunctionCov>) -> Option<FunctionCov> {
  match funcs.len() {
    0 => return None,
    1 => return Some(funcs[0].clone()),
    _ => {}
  }
  let first: &FunctionCov = &funcs[0];
  let mut trees: Vec<RangeTreeRef> = Vec::new();
  for func in funcs {
    let tree = RangeTree::from_sorted_ranges(&func.ranges);
    let tree = tree.unwrap();
    trees.push(tree);
  }
  let merged = merge_range_trees(&trees);
  let merged = merged.unwrap();
  let ranges = merged.to_ranges();
  let is_block_coverage: bool = !(ranges.len() == 1 && ranges[0].count == 0);

  Some(FunctionCov { function_name: first.function_name.clone(), ranges, is_block_coverage })
}

fn merge_range_trees(trees: &Vec<RangeTreeRef>) -> Option<RangeTree> {
  if trees.is_empty() {
    return None;
  }
  let first: Ref<RangeTree> = trees[0].borrow();
  let mut count: i64 = 0;
  for tree in trees {
    count += tree.borrow().count;
  }
  let children = merge_range_tree_children(trees);

  Some(RangeTree::new(
    first.start,
    first.end,
    count,
    children,
  ))
}

fn merge_range_tree_children(trees: &Vec<RangeTreeRef>) -> Vec<RangeTreeRef> {
  let mut child_stacks: Vec<Vec<RangeTreeRef>> = Vec::new();
  let mut flat_children: Vec<Vec<RangeTreeRef>> = Vec::new();
  let mut wrapped_children: Vec<Vec<RangeTreeRef>> = Vec::new();
  let mut open_tree: Option<RangeTreeRef> = None;

  for tree in trees {
    let mut child_stack: Vec<RangeTreeRef> = Vec::new();
    for child in tree.borrow().children.iter().rev() {
      child_stack.push(Rc::clone(child))
    }
    flat_children.push(Vec::new());
    wrapped_children.push(Vec::new());
    child_stacks.push(child_stack);
  }

  let events: BTreeSet<usize> = get_child_events(trees);

  let _inclusion_tree: HashMap<RefEquality<&RangeTree>, HashMap<usize, Vec<RangeTree>>> = HashMap::new();

  for event in events {
    open_tree = open_tree.filter(|open_tree| open_tree.borrow().end != event);

    match open_tree {
      Some(ref _open_tree) => {}
      None => {
        let mut starting_children: Vec<(usize, RangeTreeRef)> = Vec::new();
        let mut max_starting_child: Option<RangeTreeRef> = None;

        for (parent_idx, child_stack) in child_stacks.iter_mut().enumerate() {
          let is_starting = match child_stack.last() {
            Some(child) => child.borrow().start == event,
            None => false,
          };
          if !is_starting {
            continue;
          }
          let child = child_stack.pop().unwrap();
          max_starting_child = match max_starting_child {
            Some(cur_max) => {
              if child.borrow().end > cur_max.borrow().end {
                Some(Rc::clone(&child))
              } else {
                Some(cur_max)
              }
            }
            None => Some(Rc::clone(&child)),
          };
          starting_children.push((parent_idx, child));
        }

        if let Some(max_starting_child) = max_starting_child {
          for (parent_idx, child) in starting_children {
            if child.borrow().end == max_starting_child.borrow().end {
              flat_children[parent_idx].push(child);
              continue;
            }
            // ...
          }
          open_tree = Some(max_starting_child)
        }
      }
    }
  }

  let child_forests: Vec<Vec<RangeTreeRef>> = flat_children.into_iter()
    .zip(wrapped_children.into_iter())
    .map(|(flat, wrapped)| merge_children_lists(flat, wrapped))
    .collect();

  let events = get_child_events_from_forests(&child_forests);
  let mut next_tree_indexes: Vec<usize> = vec![0; trees.len()];
  let mut result: Vec<RangeTreeRef> = Vec::new();
  for event in events.iter() {
    let mut matching_trees: Vec<RangeTreeRef> = Vec::new();
    let mut parent_counts: i64 = 0;
    for (parent_idx, next_tree_index) in next_tree_indexes.iter_mut().enumerate() {
      let next_tree: Option<&RangeTreeRef> = child_forests[parent_idx].get(*next_tree_index);
      if let Some(next_tree) = next_tree {
        if next_tree.borrow().start == *event {
          *next_tree_index += 1;
          matching_trees.push(Rc::clone(next_tree));
        } else {
          parent_counts += trees[parent_idx].borrow().count;
        }
      }
    }
    if let Some(merged) = merge_range_trees(&matching_trees) {
      let merged: RangeTreeRef = Rc::new(RefCell::new(merged));
      if parent_counts != 0 {
        merged.borrow_mut().add_count(parent_counts);
      }
      result.push(merged);
    }
  }

  result
}

struct RefEquality<'a, T: 'a> (&'a T);

impl<'a, T> ::std::hash::Hash for RefEquality<'a, T> {
  fn hash<H>(&self, state: &mut H)
    where
      H: ::std::hash::Hasher,
  {
    (self.0 as *const T).hash(state)
  }
}

impl<'a, 'b, T> PartialEq<RefEquality<'b, T>> for RefEquality<'a, T> {
  fn eq(&self, other: &RefEquality<T>) -> bool {
    self.0 as *const T == other.0 as *const T
  }
}

impl<'a, T> Eq for RefEquality<'a, T> {}

fn get_child_events(trees: &Vec<RangeTreeRef>) -> BTreeSet<usize> {
  let mut event_set: BTreeSet<usize> = BTreeSet::new();
  for tree in trees {
    for child in &tree.borrow().children {
      event_set.insert(child.borrow().start);
      event_set.insert(child.borrow().end);
    }
  }
  event_set
}

fn get_child_events_from_forests(forests: &Vec<Vec<RangeTreeRef>>) -> BTreeSet<usize> {
  let mut event_set: BTreeSet<usize> = BTreeSet::new();
  for forest in forests {
    for tree in forest {
      event_set.insert(tree.borrow().start);
      event_set.insert(tree.borrow().end);
    }
  }
  event_set
}

// TODO: itertools?
// https://play.integer32.com/?gist=ad2cd20d628e647a5dbdd82e68a15cb6&version=stable&mode=debug&edition=2015
fn merge_children_lists(a: Vec<RangeTreeRef>, b: Vec<RangeTreeRef>) -> Vec<RangeTreeRef> {
  let mut merged: Vec<RangeTreeRef> = Vec::new();
  let mut a = a.into_iter();
  let mut b = b.into_iter();
  let mut next_a = a.next();
  let mut next_b = b.next();
  loop {
    match (next_a, next_b) {
      (Some(tree_a), Some(tree_b)) => {
        if tree_a.borrow().start < tree_b.borrow().start {
          merged.push(tree_a);
          next_a = a.next();
          next_b = Some(tree_b);
        } else {
          merged.push(tree_b);
          next_a = Some(tree_a);
          next_b = b.next();
        }
      }
      (Some(tree_a), None) => {
        merged.push(tree_a);
        merged.extend(a);
        break;
      }
      (None, Some(tree_b)) => {
        merged.push(tree_b);
        merged.extend(b);
        break;
      }
      (None, None) => break,
    }
  }

  merged
}

#[cfg(test)]
mod tests {
  use coverage::ProcessCov;
  use super::merge_processes;

  #[test]
  fn empty() {
    let inputs: Vec<ProcessCov> = Vec::new();
    let expected: Option<ProcessCov> = None;

    assert_eq!(merge_processes(&inputs), expected);
  }
}
