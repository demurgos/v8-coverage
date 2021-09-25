import { FunctionCov, ProcessCov, ScriptCov, V8CoverageTools } from "@v8-coverage-tools/core";
import chai from "chai";

/**
 * Generate a Mocha test suite for the provided
 * implementation of `v8-coverage-tools`.
 */
export function testImpl(lib: V8CoverageTools) {
  describe("merge", () => {
    it("accepts empty arrays for `mergeProcessCovs`", () => {
      const inputs: ProcessCov[] = [];
      const expected: ProcessCov = {result: []};
      const actual: ProcessCov = lib.mergeProcessCovs(inputs);
      chai.assert.deepEqual(actual, expected);
    });

    it("accepts empty arrays for `mergeScriptCovs`", () => {
      const inputs: ScriptCov[] = [];
      const expected: ScriptCov | undefined = undefined;
      const actual: ScriptCov | undefined = lib.mergeScriptCovs(inputs);
      chai.assert.deepEqual(actual, expected);
    });

    it("accepts empty arrays for `mergeFunctionCovs`", () => {
      const inputs: FunctionCov[] = [];
      const expected: FunctionCov | undefined = undefined;
      const actual: FunctionCov | undefined = lib.mergeFunctionCovs(inputs);
      chai.assert.deepEqual(actual, expected);
    });
  });
}
