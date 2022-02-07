import { testImpl } from "@v8-coverage-tools/mocha";
import { mergeFunctionCovsSync, mergeProcessCovsSync, mergeScriptCovsSync } from "../lib/merge.mjs";

testImpl({
  mergeProcessCovs: mergeProcessCovsSync,
  mergeScriptCovs: mergeScriptCovsSync,
  mergeFunctionCovs: mergeFunctionCovsSync,
});
