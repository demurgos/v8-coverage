import fs from "fs";
import path from "path";
import url from "url";
import { parseFunctionRanges, parseOffsets } from "./ascii.mjs";
import { LineReader } from "./line-reader.mjs";

const TEST_ROOT = path.dirname(url.fileURLToPath(import.meta.url));
const MERGE_DIR = path.join(TEST_ROOT, "merge");

async function main() {
  await buildMergeTests();
}

async function buildMergeTests() {
  const mergeTests = await getMergeTests();
  for (const mergeTest of mergeTests) {
    await buildMergeTest(mergeTest);
  }
}

/**
 * @typedef {object} MergeTest
 *
 * @property {string} name
 * @property {string} root
 * @property {string} testPath
 * @property {object | undefined} src
 */

/**
 * @returns {Promise<MergeTest[]>}
 */
async function getMergeTests() {
  /**
   * @type {MergeTest[]}
   */
  const tests = [];
  for (const dirEnt of fs.readdirSync(MERGE_DIR, {withFileTypes: true})) {
    if (!dirEnt.isDirectory() || dirEnt.name.startsWith(".") || dirEnt.name === "node_modules") {
      continue;
    }
    const name = dirEnt.name;
    const root = path.join(MERGE_DIR, name);
    const testPath = path.join(root, "test.json");
    const src = getMergeTestSource(root);
    tests.push({name, root, testPath, src});
  }
  return tests;
}

function getMergeTestSource(root) {
  let srcPath = path.join(root, "src", "test.txt");
  if (fs.existsSync(srcPath)) {
    return {type: "ascii-range", test: srcPath};
  }
  return undefined;
}

/**
 *
 * @param test {MergeTest}
 * @returns {Promise<void>}
 */
async function buildMergeTest(test) {
  if (test.src === undefined) {
    return;
  }
  switch (test.src.type) {
    case "ascii-range": {
      return buildAsciiRangeMergeTest(test, test.src);
    }
    default: {
      throw new Error(`Unexpected source type: ${test.src.type}`);
    }
  }
}

async function buildAsciiRangeMergeTest(test, src) {
  const text = fs.readFileSync(src.test, {encoding: "UTF-8"});
  const items = parseRangeSourceFile(text);
  await writeJson(test.testPath, items);
}

// async function generateMergeRanges() {
//   for await (const sourceFile of getSourceFiles()) {
//     const text = await fs.promises.readFile(sourceFile, {encoding: "UTF-8"});
//     const items = parseRangeSourceFile(text);
//     const relPath = path.relative(SRC_DIR, sourceFile);
//     const outPath = replaceExt(path.join(OUT_DIR, relPath), ".json");
//     await writeJson(outPath, items);
//   }
// }
//
async function writeJson(p, data) {
  return new Promise((resolve, reject) => {
    fs.writeFile(p, JSON.stringify(data, null, 2), {encoding: "UTF-8"}, (err) => {
      if (err !== null) {
        reject(err);
      } else {
        resolve();
      }
    })
  })
}

// function getSourceFiles() {
//   return getSourcesFrom(SRC_DIR);
//
//   async function* getSourcesFrom(dir) {
//     const names = await fs.promises.readdir(dir);
//     for (const name of names) {
//       const resolved = path.join(dir, name);
//       const stat = await fs.promises.stat(resolved);
//       if (stat.isDirectory()) {
//         yield* getSourcesFrom(dir);
//       } else {
//         yield resolved;
//       }
//     }
//   }
// }
//

function parseRangeSourceFile(text) {
  const lineReader = new LineReader(text);

  const items = [];
  skipEmptyLines();
  while (lineReader.peek() !== null) {
    const item = parseRangeItem();
    if (!item.permut) {
      delete item.permut;
      items.push(item);
    } else {
      for (const permut of generatePermutations(item)) {
        delete permut.permut;
        items.push(permut);
      }
    }
    skipEmptyLines();
  }
  return items;


  function parseRangeItem() {
    const header = parseHeader();
    const offsetMap = parseOffsets(lineReader.next());
    const inputs = [];
    inputs.push(functionCovToProcessCov(parseFunctionCov(offsetMap)));
    let expected;
    while (expected === undefined) {
      const op = lineReader.next().trim();
      switch (op) {
        case "+":
          inputs.push(functionCovToProcessCov(parseFunctionCov(offsetMap)));
          break;
        case "=":
          expected = functionCovToProcessCov(parseFunctionCov(offsetMap));
          break;
        default:
          throw new Error(`Unexpected operator: ${op}`);
      }
    }
    return {...header, inputs, expected};
  }

  function parseHeader() {
    let status = "run";
    let line = lineReader.next();
    const skipRes = applyTag(line, "skip");
    if (skipRes.match) {
      line = skipRes.line;
      status = "skip";
    } else {
      const onlyRes = applyTag(line, "only");
      if (onlyRes.match) {
        line = onlyRes.line;
        status = "only";
      }
    }
    const permutRes = applyTag(line, "permut");
    line = permutRes.line;
    const permut = permutRes.match;
    return {name: line.trim(), status, permut};
  }

  function parseFunctionCov(offsetMap) {
    const isBlockCoverage = parseFunctionIsBlockCoverage();
    const count = isBlockCoverage ? parseFunctionCount() : undefined;
    const ranges = parseRanges(offsetMap);

    const functionCov = {functionName: "test", isBlockCoverage, ranges};
    if (count !== undefined) {
      functionCov.count = count;
    }

    return functionCov;
  }

  function parseFunctionIsBlockCoverage() {
    const line = lineReader.peek();
    if (line !== null && line.trim() === "noBlock") {
      lineReader.next();
      return false;
    }
    return true; // Default to `true`
  }

  function parseFunctionCount() {
    const funcCountRe = /^\d+$/;
    const line = lineReader.peek();
    if (line === null || !funcCountRe.test(line.trim())) {
      return undefined;
    }
    return parseInt(lineReader.next().trim(), 10);
  }

  function parseRanges(offsetMap) {
    const rangeRe = /^(?:\s*\[\d+-*\))+\s*$/;
    const rangeLines = [];
    while (true) {
      const line = lineReader.peek();
      if (line === null || !rangeRe.test(line)) {
        break;
      }
      rangeLines.push(lineReader.next());
    }
    return parseFunctionRanges(rangeLines.join(""), offsetMap);
  }

  function applyTag(line, tag) {
    const re = new RegExp(`(?:\\s*\\[${tag}])|(?:\\[${tag}]\\s*)`);
    const match = re.exec(line);
    if (match) {
      line = line.replace(re, "");
    }
    return {line, match: match !== null};
  }

  function skipEmptyLines() {
    let line = lineReader.peek();
    while (line !== null && line.trim() === "") {
      lineReader.next();
      line = lineReader.peek();
    }
  }
}

function* generatePermutations(item) {
  let i = 0;
  for (const inputs of permute(item.inputs)) {
    yield {...item, name: `${item.name} (permutation ${i++})`, inputs};
  }
}

/**
 * Yield all permutations of `list`.
 *
 * Does not de-duplicate.
 */
function* permute(list) {
  const length = list.length;
  const c = Array(length).fill(0);
  let i = 1;
  let k;
  let p;

  yield list.slice();
  while (i < length) {
    if (c[i] < i) {
      k = i % 2 && c[i];
      p = list[i];
      list[i] = list[k];
      list[k] = p;
      c[i]++;
      i = 1;
      yield list.slice();
    } else {
      c[i] = 0;
      i++;
    }
  }
}

function functionCovToProcessCov(funcCov) {
  return {
    result: [
      {
        scriptId: "0",
        url: "/lib.js",
        functions: [funcCov]
      }]
  };
}

main();
