const {generateMergeBenchSnapshots} = require("./merge-bench-snapshots");
const {generateMergeRanges} = require("./merge-ranges");

async function generateAll() {
  await generateMergeBenchSnapshots();
  await generateMergeRanges();
}

module.exports = {generateAll};

if (require.main === module) {
  generateAll();
}
