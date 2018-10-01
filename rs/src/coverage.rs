#[derive(Eq, PartialEq, Clone, Debug)]
pub struct ProcessCov {
  pub result: Vec<ScriptCov>
}

#[derive(Eq, PartialEq, Clone, Debug)]
pub struct ScriptCov {
  pub script_id: String,
  pub url: String,
  pub functions: Vec<FunctionCov>,
}

#[derive(Eq, PartialEq, Clone, Debug)]
pub struct FunctionCov {
  pub function_name: String,
  pub ranges: Vec<RangeCov>,
  pub is_block_coverage: bool,
}

#[derive(Eq, PartialEq, Copy, Clone, Debug)]
pub struct RangeCov {
  pub start_offset: usize,
  pub end_offset: usize,
  pub count: i64,
}
