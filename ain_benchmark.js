const ShardTest = require('./test_type/shard');
const CrossShardTest = require('./test_type/cross_shard');
const { TestType } = require('./constants');
const fs = require('fs');

process.on('uncaughtException', (err) => {
  console.log(`uncaughtException: ${JSON.stringify(err, null, 2)}`);
});

function checkArgs() {
  if (process.argv.length !== 3) {
    console.log('Usage: node ain_benchmark.js <config file>');
    throw Error('Invalid arguments');
  }
}

function readFile(filename) {
  const str = fs.readFileSync(filename, 'utf8');
  return JSON.parse(str);
}

async function startTest(benchmarkConfig) {
  const testType = benchmarkConfig.testType;
  let startFunc;

  if (testType === TestType.SHARD) {
    startFunc = ShardTest.start;
  } else if (testType === TestType.CROSS_SHARD) {
    startFunc = CrossShardTest.start;
  } else {
    console.log(`testType config is missing. Proceed with default test type (SHARD)`);
    startFunc = ShardTest.start;
  }

  if (!startFunc) {
    console.log(`Unavailable testType ('SHARD', 'CROSS_SHARD')`);
    process.exit(0);
  }

  await startFunc(benchmarkConfig);
}

async function main() {
  checkArgs();
  const benchmarkConfig = readFile(process.argv[2]);
  await startTest(benchmarkConfig);
}

main().catch(err => {
  console.error(err);
});
