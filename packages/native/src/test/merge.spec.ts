import { testImpl } from "@v8-coverage-tools/mocha";
import { mergeFunctionCovsSync, mergeProcessCovsSync, mergeScriptCovsSync } from "../lib/merge.js";

testImpl({
  mergeProcessCovs: mergeProcessCovsSync,
  mergeScriptCovs: mergeScriptCovsSync,
  mergeFunctionCovs: mergeFunctionCovsSync,
});
