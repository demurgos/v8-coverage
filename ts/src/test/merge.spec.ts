import fs from "fs";
import path from "path";
import chai from "chai";
import { mergeProcesses, ProcessCov } from "../lib";

const REPO_ROOT: string = path.join(__dirname, "..", "..", "..", "..");
const SRC_DIR: string = path.join(REPO_ROOT, "test-data", "ranges");

interface MergeRangeItem {
  name: string;
  status: "run" | "skip" | "only";
  inputs: ProcessCov[];
  expected: ProcessCov;
}

describe("merge", () => {
  describe("ranges", () => {
    for (const sourceFile of getSourceFiles()) {
      const relPath: string = path.relative(SRC_DIR, sourceFile);
      describe(relPath, () => {
        const content: string = fs.readFileSync(sourceFile, {encoding: "UTF-8"});
        const items: MergeRangeItem[] = JSON.parse(content);
        for (const item of items) {
          const test: () => void = () => {
            const actual: ProcessCov | undefined = mergeProcesses(item.inputs);
            chai.assert.deepEqual(actual, item.expected);
          };
          switch (item.status) {
            case "run":
              it(item.name, test);
              break;
            case "only":
              it.only(item.name, test);
              break;
            case "skip":
              it.skip(item.name, test);
              break;
            default:
              throw new Error(`Unexpected status: ${item.status}`);
          }
        }
      });
    }
  });
});

function getSourceFiles() {
  return getSourcesFrom(SRC_DIR);

  function* getSourcesFrom(dir: string): Iterable<string> {
    const names: string[] = fs.readdirSync(dir);
    for (const name of names) {
      const resolved: string = path.join(dir, name);
      const stat: fs.Stats = fs.statSync(resolved);
      if (stat.isDirectory()) {
        yield* getSourcesFrom(dir);
      } else {
        yield resolved;
      }
    }
  }
}
