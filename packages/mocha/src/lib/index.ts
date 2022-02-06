import { FunctionCov, ProcessCov, ScriptCov, V8CoverageTools } from "@v8-coverage-tools/core";
import chai from "chai";

/**
 * Generate a Mocha test suite for the provided
 * implementation of `v8-coverage-tools`.
 */
export function testImpl(lib: V8CoverageTools) {
  describe("mergeProcessCovs", () => {
    it("accepts empty arrays for `mergeProcessCovs`", () => {
      const inputs: ProcessCov[] = [];
      const expected: ProcessCov = {result: []};
      const actual: ProcessCov = lib.mergeProcessCovs(inputs);
      chai.assert.deepEqual(actual, expected);
    });

    it("accepts arrays with a single item for `mergeProcessCovs`", () => {
      const inputs: ProcessCov[] = [
        {
          result: [
            {
              scriptId: "123",
              url: "/lib.js",
              functions: [
                {
                  functionName: "test",
                  isBlockCoverage: true,
                  ranges: [
                    {startOffset: 0, endOffset: 4, count: 2},
                    {startOffset: 1, endOffset: 2, count: 1},
                    {startOffset: 2, endOffset: 3, count: 1},
                  ],
                },
              ],
            },
          ],
        },
      ];
      const expected: ProcessCov = {
        result: [
          {
            scriptId: "0",
            url: "/lib.js",
            functions: [
              {
                functionName: "test",
                isBlockCoverage: true,
                ranges: [
                  {startOffset: 0, endOffset: 4, count: 2},
                  {startOffset: 1, endOffset: 3, count: 1},
                ],
              },
            ],
          },
        ],
      };
      const actual: ProcessCov = lib.mergeProcessCovs(inputs);
      chai.assert.deepEqual(actual, expected);
    });
  });

  describe("mergeScriptCovs", () => {
    it("accepts empty arrays for `mergeScriptCovs`", () => {
      const inputs: ScriptCov[] = [];
      const expected: ScriptCov | undefined = undefined;
      const actual: ScriptCov | undefined = lib.mergeScriptCovs(inputs);
      chai.assert.deepEqual(actual, expected);
    });

    it("accepts arrays with a single item for `mergeScriptCovs`", () => {
      const inputs: ScriptCov[] = [
        {
          scriptId: "123",
          url: "/lib.js",
          functions: [
            {
              functionName: "test",
              isBlockCoverage: true,
              ranges: [
                {startOffset: 0, endOffset: 4, count: 2},
                {startOffset: 1, endOffset: 2, count: 1},
                {startOffset: 2, endOffset: 3, count: 1},
              ],
            },
          ],
        },
      ];
      const expected: ScriptCov | undefined = {
        scriptId: "123",
        url: "/lib.js",
        functions: [
          {
            functionName: "test",
            isBlockCoverage: true,
            ranges: [
              {startOffset: 0, endOffset: 4, count: 2},
              {startOffset: 1, endOffset: 3, count: 1},
            ],
          },
        ],
      };
      const actual: ScriptCov | undefined = lib.mergeScriptCovs(inputs);
      chai.assert.deepEqual(actual, expected);
    });
  });

  describe("mergeFunctionCovs", () => {
    it("accepts empty arrays for `mergeFunctionCovs`", () => {
      const inputs: FunctionCov[] = [];
      const expected: FunctionCov | undefined = undefined;
      const actual: FunctionCov | undefined = lib.mergeFunctionCovs(inputs);
      chai.assert.deepEqual(actual, expected);
    });

    it("accepts arrays with a single item for `mergeFunctionCovs`", () => {
      const inputs: FunctionCov[] = [
        {
          functionName: "test",
          isBlockCoverage: true,
          ranges: [
            {startOffset: 0, endOffset: 4, count: 2},
            {startOffset: 1, endOffset: 2, count: 1},
            {startOffset: 2, endOffset: 3, count: 1},
          ],
        },
      ];
      const expected: FunctionCov = {
        functionName: "test",
        isBlockCoverage: true,
        ranges: [
          {startOffset: 0, endOffset: 4, count: 2},
          {startOffset: 1, endOffset: 3, count: 1},
        ],
      };
      const actual: FunctionCov | undefined = lib.mergeFunctionCovs(inputs);
      chai.assert.deepEqual(actual, expected);
    });
  });
}
