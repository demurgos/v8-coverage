import * as native from "./native/index";
import { FunctionCov, ProcessCov, RangeCov, ScriptCov } from "./types";

export function mergeProcessCovBuffersSync(buffers: Buffer[]): Buffer | undefined {
  return native.mergeProcessCovBuffersSync(buffers);
}

export function mergeProcesses(processes: ProcessCov[]): ProcessCov | undefined {
  return native.mergeProcesses(processes);
}

export function mergeScripts(scripts: ScriptCov[]): ScriptCov | undefined {
  return native.mergeScripts(scripts);
}

export function mergeFunctions(fns: FunctionCov[]): FunctionCov | undefined {
  return native.mergeFunctions(fns);
}

export { FunctionCov, ProcessCov, RangeCov, ScriptCov };
