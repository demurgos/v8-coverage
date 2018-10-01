use coverage::{FunctionCov, ProcessCov};
use coverage::ScriptCov;

pub fn merge_processes(mut processes: Vec<ProcessCov>) -> Option<ProcessCov> {
  match processes.len() {
    0 => return None,
    1 => return Some(processes.remove(0)),
    _ => {}
  }
  Some(ProcessCov { value: Vec::new() })
}

pub fn merge_scripts(mut scripts: Vec<ScriptCov>) -> Option<ScriptCov> {
  match scripts.len() {
    0 => return None,
    1 => return Some(scripts.remove(0)),
    _ => {}
  }
  Some(ScriptCov { script_id: String::from("foo"), url: String::from("foo"), functions: Vec::new() })
}

pub fn merge_functions(mut funcs: Vec<FunctionCov>) -> Option<FunctionCov> {
  match funcs.len() {
    0 => return None,
    1 => return Some(funcs.remove(0)),
    _ => {}
  }
  Some(FunctionCov { function_name: String::from("foo"), ranges: Vec::new(), is_block_coverage: true })
}


#[cfg(test)]
mod tests {
  use coverage::ProcessCov;
  use super::merge_processes;

  #[test]
  fn empty() {
    let inputs: Vec<ProcessCov> = Vec::new();
    let expected: Option<ProcessCov> = None;

    assert_eq!(merge_processes(inputs), expected);
  }
}
