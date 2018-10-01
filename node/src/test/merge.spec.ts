import * as chai from "chai";
import * as lib from "../lib/index";
import { FunctionCov, ProcessCov } from "../lib/types";

describe("merge", () => {
  describe("mergeProcesses", () => {
    it("empty", function () {
      const inputs: ProcessCov[] = [];
      const expected: ProcessCov | undefined = undefined;
      const actual: ProcessCov | undefined = lib.mergeProcesses(inputs);

      chai.assert.deepEqual(actual, expected);
    });
  });
  describe("mergeFunctions", () => {
    it("empty", () => {
      const inputs: FunctionCov[] = [];
      const expected: FunctionCov | undefined = undefined;
      const actual: FunctionCov | undefined = lib.mergeFunctions(inputs);

      chai.assert.deepEqual(actual, expected);
    });

    it("one", () => {
      const inputs: FunctionCov[] = [
        {
          functionName: "foo",
          ranges: [
            {
              startOffset: 62,
              endOffset: 113,
              count: 3,
            },
          ],
          isBlockCoverage: true,
        },
      ];
      const expected: FunctionCov | undefined = {
        functionName: "foo",
        ranges: [
          {
            startOffset: 62,
            endOffset: 113,
            count: 3,
          },
        ],
        isBlockCoverage: true,
      };
      const actual: FunctionCov | undefined = lib.mergeFunctions(inputs);

      chai.assert.deepEqual(actual, expected);
    });
  });
});
