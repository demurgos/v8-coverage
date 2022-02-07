import { default as native } from "#native";
import { FunctionCov, ProcessCov, ScriptCov } from "@v8-coverage-tools/core";

export function mergeProcessCovsSync(covs: readonly ProcessCov[]): ProcessCov {
  const rawCovs: string = JSON.stringify(covs);
  const rawOut = native.merge.mergeProcessCovsSync(rawCovs);
  if (rawOut === "null") {
    return {result: []};
  }
  return JSON.parse(rawOut);
}
export function mergeScriptCovsSync(covs: readonly ScriptCov[]): ScriptCov | undefined {
  const rawCovs: string = JSON.stringify(covs);
  const rawOut = native.merge.mergeScriptCovsSync(rawCovs);
  if (rawOut === "null") {
    return undefined;
  }
  return JSON.parse(rawOut);
}

export function mergeFunctionCovsSync(covs: readonly FunctionCov[]): FunctionCov | undefined {
  const rawCovs: string = JSON.stringify(covs);
  const rawOut = native.merge.mergeFunctionCovsSync(rawCovs);
  if (rawOut === "null") {
    return undefined;
  }
  return JSON.parse(rawOut);
}
