#[macro_use]
extern crate neon;
extern crate serde_json;
extern crate v8_coverage;

use neon::prelude::*;
use v8_coverage::{FunctionCov, ProcessCov, RangeCov, ScriptCov};

pub fn merge_process_cov_buffers_sync(mut cx: FunctionContext) -> JsResult<JsValue> {
  let buffers_js: Handle<JsArray> = cx.argument::<JsArray>(0)?;

  let processes: NeonResult<Vec<ProcessCov>> = buffers_js
    .to_vec(&mut cx)?
    .iter()
    .map(|buffer_js| -> NeonResult<ProcessCov> {
      let buffer: Handle<JsBuffer> = buffer_js.downcast::<JsBuffer>().or_throw(&mut cx)?;
      cx.borrow(&buffer, |data| {
        let slice: &[u8] = data.as_slice::<u8>();
        let result: serde_json::Result<ProcessCov> = serde_json::from_slice(slice);
        Ok(result.unwrap())
      })
    })
    .collect();

  let processes = processes?;

  match v8_coverage::merge_processes(processes) {
    None => Ok(JsUndefined::new().as_value(&mut cx)),
    Some(merged) => {
      let data = serde_json::to_vec(&merged).unwrap();
      let mut buffer: Handle<JsBuffer> = cx.buffer(data.len() as u32)?;
      cx.borrow_mut(&mut buffer, |bytes| {
        bytes.as_mut_slice().copy_from_slice(&data)
      });
      Ok(buffer.as_value(&mut cx))
    }
  }
}

pub fn merge_processes(mut cx: FunctionContext) -> JsResult<JsValue> {
  let processes_js: Handle<JsArray> = cx.argument::<JsArray>(0)?;
  let processes: Vec<ProcessCov> = process_cov_vec_from_js(&mut cx, &processes_js)?;

  match v8_coverage::merge_processes(processes) {
    None => Ok(JsUndefined::new().as_value(&mut cx)),
    Some(merged) => Ok(process_cov_to_js(&mut cx, &merged)?.as_value(&mut cx))
  }
}

pub fn merge_scripts(mut cx: FunctionContext) -> JsResult<JsValue> {
  let scripts_js: Handle<JsArray> = cx.argument::<JsArray>(0)?;
  let scripts: Vec<ScriptCov> = script_cov_vec_from_js(&mut cx, &scripts_js)?;

  match v8_coverage::merge_scripts(scripts) {
    None => Ok(JsUndefined::new().as_value(&mut cx)),
    Some(merged) => Ok(script_cov_to_js(&mut cx, &merged)?.as_value(&mut cx))
  }
}

pub fn merge_functions(mut cx: FunctionContext) -> JsResult<JsValue> {
  let funcs_js: Handle<JsArray> = cx.argument::<JsArray>(0)?;
  let funcs: Vec<FunctionCov> = function_cov_vec_from_js(&mut cx, &funcs_js)?;

  match v8_coverage::merge_functions(funcs) {
    None => Ok(JsUndefined::new().as_value(&mut cx)),
    Some(merged) => Ok(function_cov_to_js(&mut cx, &merged)?.as_value(&mut cx))
  }
}

fn process_cov_vec_from_js<'a, C: Context<'a>>(cx: &mut C, processes: &Handle<'a, JsArray>) -> NeonResult<Vec<ProcessCov>> {
  processes
    .to_vec(cx)?
    .iter()
    .map(|process| process_cov_from_js(cx, process))
    .collect()
}

fn process_cov_from_js<'a, C: Context<'a>>(cx: &mut C, process: &Handle<'a, JsValue>) -> NeonResult<ProcessCov> {
  let process: Handle<JsObject> = process.downcast::<JsObject>().or_throw(cx)?;
  let scripts_js: Handle<JsArray> = process.get(cx, "result")?.downcast::<JsArray>().or_throw(cx)?;
  let result: Vec<ScriptCov> = script_cov_vec_from_js(cx, &scripts_js)?;
  Ok(ProcessCov { result })
}

fn script_cov_vec_from_js<'a, C: Context<'a>>(cx: &mut C, scripts: &Handle<'a, JsArray>) -> NeonResult<Vec<ScriptCov>> {
  scripts
    .to_vec(cx)?
    .iter()
    .map(|script| script_cov_from_js(cx, script))
    .collect()
}

fn script_cov_from_js<'a, C: Context<'a>>(cx: &mut C, script: &Handle<'a, JsValue>) -> NeonResult<ScriptCov> {
  let script: Handle<JsObject> = script.downcast::<JsObject>().or_throw(cx)?;
  let script_id: String = script.get(cx, "scriptId")?.downcast::<JsString>().or_throw(cx)?.value();
  let url: String = script.get(cx, "url")?.downcast::<JsString>().or_throw(cx)?.value();
  let funcs_js: Handle<JsArray> = script.get(cx, "functions")?.downcast::<JsArray>().or_throw(cx)?;
  let functions: Vec<FunctionCov> = function_cov_vec_from_js(cx, &funcs_js)?;
  Ok(ScriptCov { script_id, url, functions })
}

fn function_cov_vec_from_js<'a, C: Context<'a>>(cx: &mut C, funcs: &Handle<'a, JsArray>) -> NeonResult<Vec<FunctionCov>> {
  funcs
    .to_vec(cx)?
    .iter()
    .map(|func| function_cov_from_js(cx, func))
    .collect()
}

fn function_cov_from_js<'a, C: Context<'a>>(cx: &mut C, func: &Handle<'a, JsValue>) -> NeonResult<FunctionCov> {
  let func: Handle<JsObject> = func.downcast::<JsObject>().or_throw(cx)?;
  let function_name: String = func.get(cx, "functionName")?.downcast::<JsString>().or_throw(cx)?.value();
  let ranges_js: Handle<JsArray> = func.get(cx, "ranges")?.downcast::<JsArray>().or_throw(cx)?;
  let ranges: Vec<RangeCov> = range_cov_vec_from_js(cx, &ranges_js)?;
  let is_block_coverage: bool = func.get(cx, "isBlockCoverage")?.downcast::<JsBoolean>().or_throw(cx)?.value();
  Ok(FunctionCov { function_name, ranges, is_block_coverage })
}

fn range_cov_vec_from_js<'a, C: Context<'a>>(cx: &mut C, ranges: &Handle<'a, JsArray>) -> NeonResult<Vec<RangeCov>> {
  ranges
    .to_vec(cx)?
    .iter()
    .map(|range| range_cov_from_js(cx, range))
    .collect()
}

fn range_cov_from_js<'a, C: Context<'a>>(cx: &mut C, range: &Handle<'a, JsValue>) -> NeonResult<RangeCov> {
  let range: Handle<JsObject> = range.downcast::<JsObject>().or_throw(cx)?;
  let start_offset: usize = range.get(cx, "startOffset")?.downcast::<JsNumber>().or_throw(cx)?.value() as usize;
  let end_offset: usize = range.get(cx, "endOffset")?.downcast::<JsNumber>().or_throw(cx)?.value() as usize;
  let count: i64 = range.get(cx, "count")?.downcast::<JsNumber>().or_throw(cx)?.value() as i64;
  Ok(RangeCov { start_offset, end_offset, count })
}

fn process_cov_to_js<'a, C: Context<'a>>(cx: &mut C, process: &ProcessCov) -> JsResult<'a, JsObject> {
  let result: Handle<JsObject> = cx.empty_object();
  let scripts: Handle<JsArray> = script_cov_vec_to_js(cx, &process.result)?;
  result.set(cx, "result", scripts)?;
  Ok(result)
}

fn script_cov_vec_to_js<'a, C: Context<'a>>(cx: &mut C, scripts: &Vec<ScriptCov>) -> JsResult<'a, JsArray> {
  let scripts_js: Handle<JsArray> = JsArray::new(cx, scripts.len() as u32);
  for (i, script) in scripts.iter().enumerate() {
    let script_js: Handle<JsObject> = script_cov_to_js(cx, script)?;
    scripts_js.set(cx, i as u32, script_js)?;
  }
  Ok(scripts_js)
}

fn script_cov_to_js<'a, C: Context<'a>>(cx: &mut C, script: &ScriptCov) -> JsResult<'a, JsObject> {
  let result: Handle<JsObject> = cx.empty_object();
  let script_id: Handle<JsString> = cx.string(&script.script_id);
  let url: Handle<JsString> = cx.string(&script.url);
  let functions: Handle<JsArray> = function_cov_vec_to_js(cx, &script.functions)?;
  result.set(cx, "scriptId", script_id)?;
  result.set(cx, "url", url)?;
  result.set(cx, "functions", functions)?;
  Ok(result)
}

fn function_cov_vec_to_js<'a, C: Context<'a>>(cx: &mut C, funcs: &Vec<FunctionCov>) -> JsResult<'a, JsArray> {
  let funcs_js: Handle<JsArray> = JsArray::new(cx, funcs.len() as u32);
  for (i, func) in funcs.iter().enumerate() {
    let func_js: Handle<JsObject> = function_cov_to_js(cx, func)?;
    funcs_js.set(cx, i as u32, func_js)?;
  }
  Ok(funcs_js)
}

fn function_cov_to_js<'a, C: Context<'a>>(cx: &mut C, func: &FunctionCov) -> JsResult<'a, JsObject> {
  let result: Handle<JsObject> = cx.empty_object();
  let function_name: Handle<JsString> = cx.string(&func.function_name);
  let ranges: Handle<JsArray> = range_cov_vec_to_js(cx, &func.ranges)?;
  let is_block_coverage: Handle<JsBoolean> = cx.boolean(func.is_block_coverage);
  result.set(cx, "functionName", function_name)?;
  result.set(cx, "ranges", ranges)?;
  result.set(cx, "isBlockCoverage", is_block_coverage)?;
  Ok(result)
}

fn range_cov_vec_to_js<'a, C: Context<'a>>(cx: &mut C, ranges: &Vec<RangeCov>) -> JsResult<'a, JsArray> {
  let ranges_js: Handle<JsArray> = JsArray::new(cx, ranges.len() as u32);
  for (i, range) in ranges.iter().enumerate() {
    let range_js: Handle<JsObject> = range_cov_to_js(cx, range)?;
    ranges_js.set(cx, i as u32, range_js)?;
  }
  Ok(ranges_js)
}

fn range_cov_to_js<'a, C: Context<'a>>(cx: &mut C, func: &RangeCov) -> JsResult<'a, JsObject> {
  let result: Handle<JsObject> = cx.empty_object();
  let start_offset: Handle<JsNumber> = cx.number(func.start_offset as f64);
  let end_offset: Handle<JsNumber> = cx.number(func.end_offset as f64);
  let count: Handle<JsNumber> = cx.number(func.count as f64);
  result.set(cx, "startOffset", start_offset)?;
  result.set(cx, "endOffset", end_offset)?;
  result.set(cx, "count", count)?;
  Ok(result)
}

register_module!(mut cx, {
    cx.export_function("mergeProcessCovBuffersSync", merge_process_cov_buffers_sync)?;
    cx.export_function("mergeProcesses", merge_processes)?;
    cx.export_function("mergeScripts", merge_scripts)?;
    cx.export_function("mergeFunctions", merge_functions)?;
    Ok(())
});
