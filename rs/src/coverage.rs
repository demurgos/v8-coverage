use serde::{Deserialize, Serialize};

#[derive(Eq, PartialEq, Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessCov {
  pub result: Vec<ScriptCov>,
}

#[derive(Eq, PartialEq, Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScriptCov {
  pub script_id: String,
  pub url: String,
  pub functions: Vec<FunctionCov>,
}

#[derive(Eq, PartialEq, Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FunctionCov {
  pub function_name: String,
  pub ranges: Vec<RangeCov>,
  pub is_block_coverage: bool,
  //  #[serde(skip_serializing_if = "Option::is_none")]
  //  pub count: Option<i64>,
}

#[derive(Eq, PartialEq, Copy, Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RangeCov {
  pub start_offset: usize,
  pub end_offset: usize,
  pub count: i64,
}
