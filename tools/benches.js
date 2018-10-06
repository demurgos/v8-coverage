const fs = require("fs");
const path = require("path");
const nodeLib = require("../node");
const tsLib = require("../ts");

const ROOT = path.join(__dirname, "..");
const BENCHES_DIR = path.join(ROOT, "benches");

async function* getBenches() {
  const names = await fs.promises.readdir(BENCHES_DIR);
  for (const name of names) {
    const resolved = path.join(BENCHES_DIR, name);
    const stat = await fs.promises.stat(resolved);
    if (stat.isDirectory()) {
      yield resolved;
    }
  }
}

async function mergeBench(dirOrName, lib = "ts", debug = false) {
  const startTime = Date.now();
  const dir = path.isAbsolute(dirOrName) ? dirOrName : path.join(BENCHES_DIR, name);
  const names = await fs.promises.readdir(dir);
  const bufferPromises = [];
  for (const name of names) {
    const resolved = path.join(dir, name);
    bufferPromises.push(fs.promises.readFile(resolved));
  }
  const buffers = await Promise.all(bufferPromises);
  const readTime = Date.now();
  if (debug) {
    console.error(`Read: ${(readTime - startTime) / 1000}s`);
  }
  let merged, endTime;
  switch (lib) {
    case "node": {
      let merged = nodeLib.mergeProcessCovBuffersSync(buffers);
      if (merged !== undefined) {
        merged = JSON.parse(merged);
      }
      endTime = Date.now();
      if (debug) {
        console.error(`Rust round-trip: ${(endTime - readTime) / 1000}s`);
      }
      break;
    }
    case "ts": {
      const processCovs = [];
      for (const buffer of buffers) {
        processCovs.push(JSON.parse(buffer.toString("UTF-8")));
      }
      const parsedTime = Date.now();
      if (debug) {
        console.error(`Parse: ${(parsedTime - readTime) / 1000}s`);
      }
      const merged = tsLib.mergeProcesses(processCovs);
      endTime = Date.now();
      if (debug) {
        console.error(`Merge: ${(endTime - parsedTime) / 1000}s`);
      }
      break;
    }
    default:
      throw new Error(`Unexpected lib: ${lib}`);
  }

  if (debug) {
    console.error(`Overall: ${(endTime - startTime) / 1000}s`);
  }
  return merged;
}

module.exports = {getBenches, mergeBench};
