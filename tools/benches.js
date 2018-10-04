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
  const dir = path.isAbsolute(dirOrName) ? dirOrName : path.join(BENCHES_DIR, name);
  const names = await fs.promises.readdir(dir);
  const processCovs = [];
  for (const name of names) {
    const resolved = path.join(dir, name);
    processCovs.push(JSON.parse(await fs.promises.readFile(resolved, {encoding: "UTF-8"})));
  }
  return v8Coverage.mergeProcesses(processCovs);
}

module.exports = {getBenches, mergeBench};
