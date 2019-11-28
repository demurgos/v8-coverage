import chai from "chai";
import fs from "fs";
import path from "path";
import { mergeProcessCovBuffersSync, mergeProcesses, ProcessCov } from "../lib";

const REPO_ROOT: string = path.join(__dirname, "..", "..", "..", "..");
const BENCHES_INPUT_DIR: string = path.join(REPO_ROOT, "benches");
const BENCHES_DIR: string = path.join(REPO_ROOT, "test-data", "merge", "benches");
const RANGES_DIR: string = path.join(REPO_ROOT, "test-data", "merge", "ranges");
const BENCHES_TIMEOUT: number = 60000; // 60 seconds

interface MergeRangeItem {
  name: string;
  status: "run" | "skip" | "only";
  inputs: ProcessCov[];
  expected: ProcessCov;
}

describe("merge", () => {
  describe("benches", () => {
    for (const bench of getBenches()) {
      const name: string = path.basename(bench);
      it(name, async function (this: Mocha.Context) {
        this.timeout(BENCHES_TIMEOUT);

        const inputFileNames: string[] = await fs.promises.readdir(bench);
        const inputPromises: Promise<Buffer>[] = [];
        for (const inputFileName of inputFileNames) {
          const resolved: string = path.join(bench, inputFileName);
          inputPromises.push(fs.promises.readFile(resolved));
        }
        const inputs: Buffer[] = await Promise.all(inputPromises);
        const expectedPath: string = path.join(BENCHES_DIR, `${name}.json`);
        const expectedContent: string = await fs.promises.readFile(expectedPath, {encoding: "UTF-8"}) as string;
        const expected: ProcessCov = JSON.parse(expectedContent);
        const startTime: number = Date.now();
        const actualBuffer: Buffer | undefined = mergeProcessCovBuffersSync(inputs);
        const actual: ProcessCov | undefined = actualBuffer !== undefined
          ? JSON.parse(actualBuffer.toString("UTF-8"))
          : undefined;
        const endTime: number = Date.now();
        console.error(`Time (${name}): ${(endTime - startTime) / 1000}`);
        chai.assert.deepEqual(actual, expected);
        console.error(`OK: ${name}`);
      });
    }
  });

  describe("ranges", () => {
    for (const sourceFile of getSourceFiles()) {
      const relPath: string = path.relative(RANGES_DIR, sourceFile);
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
  return getSourcesFrom(RANGES_DIR);

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

function* getBenches(): Iterable<string> {
  const names: string[] = fs.readdirSync(BENCHES_INPUT_DIR);
  for (const name of names) {
    const resolved: string = path.join(BENCHES_INPUT_DIR, name);
    const stat: fs.Stats = fs.statSync(resolved);
    if (stat.isDirectory()) {
      yield resolved;
    }
  }
}
