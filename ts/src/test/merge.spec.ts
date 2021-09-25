import chai from "chai";
import fs from "fs";
import sysPath from "path";
import path from "path";
import url from "url";
import { FunctionCov, mergeFunctionCovs, mergeProcessCovs, mergeScriptCovs, ProcessCov, ScriptCov } from "../lib/index.js";

const REPO_ROOT: string = path.join(url.fileURLToPath(import.meta.url), "..", "..", "..");
const MERGE_TESTS_DIR: string = path.join(REPO_ROOT, "tests", "merge");
const MERGE_TIMEOUT: number = 30000; // 30sec

// `BLACKLIST` can be used to forcefully skip some tests.
const BLACKLIST: ReadonlySet<string> = new Set([
  ...["node-10.11.0", "npm-6.4.1", "yargs-12.0.2"],
  // ...(process.env.CI === "true" ? ["node-10.11.0", "npm-6.4.1"] : []),
]);
// `WHITELIST` can be used to only enable a few tests.
const WHITELIST: ReadonlySet<string> = new Set([
  // "simple",
]);

describe("merge", () => {
  describe("custom", () => {
    it("accepts empty arrays for `mergeProcessCovs`", () => {
      const inputs: ProcessCov[] = [];
      const expected: ProcessCov = {result: []};
      const actual: ProcessCov = mergeProcessCovs(inputs);
      chai.assert.deepEqual(actual, expected);
    });

    it("accepts empty arrays for `mergeScriptCovs`", () => {
      const inputs: ScriptCov[] = [];
      const expected: ScriptCov | undefined = undefined;
      const actual: ScriptCov | undefined = mergeScriptCovs(inputs);
      chai.assert.deepEqual(actual, expected);
    });

    it("accepts empty arrays for `mergeFunctionCovs`", () => {
      const inputs: FunctionCov[] = [];
      const expected: FunctionCov | undefined = undefined;
      const actual: FunctionCov | undefined = mergeFunctionCovs(inputs);
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
      const actual: ProcessCov = mergeProcessCovs(inputs);
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
      const actual: ScriptCov | undefined = mergeScriptCovs(inputs);
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
      const actual: FunctionCov | undefined = mergeFunctionCovs(inputs);
      chai.assert.deepEqual(actual, expected);
    });
  });

  for (const mergeTest of getMergeTests()) {
    it(mergeTest.name, test);

    function test(this: Mocha.Context) {
      this.timeout(MERGE_TIMEOUT);
      const items: MergeTestItem[] = JSON.parse(fs.readFileSync(mergeTest.testPath, {encoding: "utf-8"}));
      for (const item of items) {
        const actual: ProcessCov = mergeProcessCovs(item.inputs);
        chai.assert.deepEqual(actual, item.expected);
      }
    }
  }
});

interface MergeTest {
  name: string;
  testPath: string;
}

interface MergeTestItem {
  name: string;
  inputs: ProcessCov[];
  expected: ProcessCov;
}

function* getMergeTests(): IterableIterator<MergeTest> {
  for (const dirEnt of fs.readdirSync(MERGE_TESTS_DIR, {withFileTypes: true})) {
    if (!dirEnt.isDirectory()) {
      continue;
    }
    const testName: string = dirEnt.name;
    const testDir: string = sysPath.join(MERGE_TESTS_DIR, testName);

    if (BLACKLIST.has(testName)) {
      continue;
    } else if (WHITELIST.size > 0 && !WHITELIST.has(testName)) {
      continue;
    }

    const testPath: string = sysPath.join(testDir, "test.json");

    yield {name: testName, testPath};
  }
}
