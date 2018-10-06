const fs = require("fs");
const path = require("path");
const v8Coverage = require("../node");

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

async function mergeBench(dirOrName) {
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
  console.error(`Read: ${(readTime - startTime) / 1000}`);
  // const processCovs = [];
  // for (const buffer of buffers) {
  //   processCovs.push(JSON.parse(buffer.toString("UTF-8")));
  // }
  // const parsedTime = Date.now();
  // console.error(`Parse: ${(parsedTime - readTime) / 1000}`);
  const merged = v8Coverage.mergeProcessCovBuffersSync(buffers);
  const endTime = Date.now();
  console.error(`Merge: ${(endTime - readTime) / 1000}`);
  console.error(`All: ${(endTime - startTime) / 1000}`);
  return merged;
}

module.exports = {getBenches, mergeBench};
