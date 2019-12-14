import chai from "chai";
import fs from "fs";
import sysPath from "path";
import path from "path";
import { mergeProcesses, ProcessCov } from "../lib";

const REPO_ROOT: string = path.join(__dirname, "..", "..", "..", "..");
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
  for (const mergeTest of getMergeTests()) {
    it(mergeTest.name, test);

    function test(this: Mocha.Context) {
      this.timeout(MERGE_TIMEOUT);
      const items: MergeTestItem[] = JSON.parse(fs.readFileSync(mergeTest.testPath, {encoding: "UTF-8"}));
      for (const item of items) {
        const actual: ProcessCov | undefined = mergeProcesses(item.inputs);
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
