const {getBenches, mergeBench} = require("./benches");

async function runRoughBenchmarks() {
  for await (const bench of getBenches()) {
    console.error(`Running: ${bench}`);
    await mergeBench(bench, "ts", true);
  }
}

module.exports = {runRoughBenchmarks};

if (require.main === module) {
  runRoughBenchmarks();
}
