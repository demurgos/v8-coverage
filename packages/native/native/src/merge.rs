use crate::neon_helpers::NeonNamespace;
use neon::prelude::*;
use std::sync::Arc;
use v8_coverage_tools::{FunctionCov, ProcessCov, ScriptCov};

pub fn create_namespace<'a, C: Context<'a>>(cx: &mut C) -> JsResult<'a, JsObject> {
  let ns = cx.empty_object();
  ns.set_function(cx, "mergeProcessCovsSync", merge_process_covs_sync)?;
  ns.set_function(cx, "mergeScriptCovsSync", merge_script_covs_sync)?;
  ns.set_function(cx, "mergeFunctionCovsSync", merge_function_covs_sync)?;
  Ok(ns)
}

pub fn merge_process_covs_sync(mut cx: FunctionContext) -> JsResult<JsString> {
  let process_covs_json = cx.argument::<JsString>(0)?;

  let process_covs: Vec<ProcessCov> = serde_json::from_str(&process_covs_json.value(&mut cx)).unwrap();

  let merged = v8_coverage_tools::merge_processes(process_covs);

  let merged_json = serde_json::to_string(&merged).unwrap();

  let result = cx.string(merged_json);

  Ok(result)
}

pub fn merge_script_covs_sync(mut cx: FunctionContext) -> JsResult<JsString> {
  let process_covs_json = cx.argument::<JsString>(0)?;

  let process_covs: Vec<ScriptCov> = serde_json::from_str(&process_covs_json.value(&mut cx)).unwrap();

  let merged = v8_coverage_tools::merge_scripts(process_covs);

  let merged_json = serde_json::to_string(&merged).unwrap();

  let result = cx.string(merged_json);

  Ok(result)
}

pub fn merge_function_covs_sync(mut cx: FunctionContext) -> JsResult<JsString> {
  let process_covs_json = cx.argument::<JsString>(0)?;

  let process_covs: Vec<FunctionCov> = serde_json::from_str(&process_covs_json.value(&mut cx)).unwrap();

  let merged = v8_coverage_tools::merge_functions(process_covs);

  let merged_json = serde_json::to_string(&merged).unwrap();

  let result = cx.string(merged_json);

  Ok(result)
}
