const fsExtra = require("fs-extra");
const path = require("path");
const {getBenches, mergeBench} = require("../benches");

const ROOT = path.join(__dirname, "..", "..");
const OUT_DIR = path.join(ROOT, "test-data", "merge", "benches");

async function generateMergeBenchSnapshots() {
  for await (const bench of getBenches()) {
    const name = path.basename(bench);
    console.error(`Generating snapshot for: ${name}`);
    const merged = await mergeBench(bench);
    const outPath = path.join(OUT_DIR, `${name}.json`);
    await writeJson(outPath, merged);
  }
}

async function writeJson(p, data) {
  await fsExtra.outputFile(p, JSON.stringify(data, null, 2), {encoding: "UTF-8"});
}

module.exports = {generateMergeBenchSnapshots};

if (require.main === module) {
  generateMergeBenchSnapshots();
}
