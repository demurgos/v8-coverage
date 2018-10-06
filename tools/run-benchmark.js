const {getBenches, mergeBench} = require("./benches");

async function runBenchmark() {
  for await (const bench of getBenches()) {
    console.error(`Running: ${bench}`);
    await mergeBench(bench);
  }
}

module.exports = {runBenchmark};

if (require.main === module) {
  runBenchmark();
}
