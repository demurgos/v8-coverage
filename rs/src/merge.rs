use coverage::{FunctionCov, ProcessCov};
use coverage::RangeCov;
use coverage::ScriptCov;
use range_tree::RangeTree;
use std::collections::HashMap;
use std::ops::Deref;

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
  let mut trees: Vec<Box<RangeTree>> = Vec::new();
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

fn merge_range_trees<T>(trees: &Vec<T>) -> Option<RangeTree> where T: Deref<Target=RangeTree> {
  if trees.is_empty() {
    return None;
  }
  let first: &T = &trees[0];
  let mut count: i64 = 0;
  for tree in trees {
    count += tree.count;
  }
  let children = merge_range_tree_children(trees);

  Some(RangeTree {
    start: first.start,
    end: first.end,
    count,
    children,
  })
}

fn merge_range_tree_children<T>(trees: &Vec<T>) -> Vec<Box<RangeTree>> where T: Deref<Target=RangeTree> {
  Vec::new()
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
