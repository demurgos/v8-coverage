const benchmark = require("benchmark");
const tsLib = require("../ts");

const {getBenchNames, getBenchProcessCovs} = require("./benches");

async function runBenchmarks() {
  for await (const benchName of getBenchNames()) {
    await runBenchmark(benchName);
  }
}

async function runBenchmark(benchName) {
  console.error(`Loading: ${benchName}`);
  const processCovs = [];
  for await (const processCov of getBenchProcessCovs(benchName)) {
    processCovs.push(processCov);
  }
  console.error(`Starting benchmark: ${benchName}`);
  const suite = new benchmark.Suite();
  suite.add("Typescript", () => tsLib.mergeProcessCovs(processCovs));
  suite.on("cycle", (event) => {
    const summary = event.target.toString();
    const timePerCycle = event.target.times.cycle;
    console.log(`${summary} - ${timePerCycle} secs/op`);
  });
  suite.on("error", (event) => {
    console.error(event);
  });
  suite.run({"async": true});

  return new Promise((resolve) => {
    suite.on("complete", () => resolve());
  });
}

module.exports = {runBenchmarks};

if (require.main === module) {
  runBenchmarks();
}
