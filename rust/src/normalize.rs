use crate::coverage::{FunctionCov, ProcessCov, RangeCov, ScriptCov};
use crate::range_tree::RangeTree;
use crate::range_tree::RangeTreeArena;
use rayon::prelude::*;
use std::collections::BTreeMap;
use std::collections::BTreeSet;
use std::collections::HashMap;
use std::iter::Peekable;

pub fn deep_normalize_proces_cov(process_cov: &mut ProcessCov) {
  for script_cov in process_cov.result.iter_mut() {
    deep_normalize_script_cov(script_cov)
  }
  normalize_proces_cov(process_cov)
}

pub fn normalize_proces_cov(process_cov: &mut ProcessCov) {
  process_cov
    .result
    .sort_unstable_by(|left, right| Ord::cmp(left.url.as_str(), right.url.as_str()));
  for (id, script_cov) in process_cov.result.iter_mut().enumerate() {
    script_cov.script_id = id.to_string();
  }
}

pub fn deep_normalize_script_cov(script_cov: &mut ScriptCov) {
  for func_cov in script_cov.functions.iter_mut() {
    normalize_function_cov(func_cov)
  }
  normalize_script_cov(script_cov)
}

pub fn normalize_script_cov(script_cov: &mut ScriptCov) {
  script_cov.functions.sort_unstable_by_key(|f| f.ranges.get(0).cloned())
}

pub fn normalize_function_cov(func_cov: &mut FunctionCov) {
  // dbg!(&func_cov);
  func_cov.ranges.sort_unstable();
  let rta = RangeTreeArena::new();
  let tree = RangeTree::from_sorted_ranges(&rta, &func_cov.ranges);
  let tree = tree.unwrap();
  let tree = RangeTree::normalize(&rta, tree);
  func_cov.ranges = tree.to_ranges();
  // dbg!(&func_cov);
}
