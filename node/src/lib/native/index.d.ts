import { FunctionCov, ProcessCov, ScriptCov } from "../types";

export declare function mergeProcessCovBuffersSync(buffers: Buffer[]): Buffer | undefined;

export declare function mergeProcesses(processes: ProcessCov[]): ProcessCov | undefined;

export declare function mergeScripts(scripts: ScriptCov[]): ScriptCov | undefined;

export declare function mergeFunctions(fns: FunctionCov[]): FunctionCov | undefined;
