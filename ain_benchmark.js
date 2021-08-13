const TpsTest = require('./test_type/tps');
const CrossShardTest = require('./test_type/cross_shard');
const { TestType } = require('./constants');
const fs = require('fs');
const moment = require('moment-timezone');

process.on('uncaughtException', (err) => {
  console.log(`uncaughtException: ${JSON.stringify(err, null, 2)}`);
});

function checkArgs() {
  if (process.argv.length < 3 || process.argv.length > 4) {
    console.log('Usage: node ain_benchmark.js <config file>');
    throw Error('Invalid arguments');
  }
}

function readFile(filename) {
  const str = fs.readFileSync(filename, 'utf8');
  return JSON.parse(str);
}

async function startTest(benchmarkConfig, outputDirName) {
  const testType = benchmarkConfig.testType;
  let startFunc;
  if (!outputDirName) {
    outputDirName = `result_${moment().tz('Asia/Seoul').format('MM-DD_HH:mm:SS')}`;
  }

  if (testType === TestType.TPS) {
    startFunc = TpsTest.start;
  } else if (testType === TestType.CROSS_SHARD) {
    startFunc = CrossShardTest.start;
  } else {
    console.log(`testType config is missing. Proceed with default test type (TPS)`);
    startFunc = TpsTest.start;
  }

  if (!startFunc) {
    console.log(`Unavailable testType ('SHARD', 'CROSS_SHARD')`);
    process.exit(0);
  }

  await startFunc(benchmarkConfig, outputDirName);
}

async function main() {
  checkArgs();
  const benchmarkConfig = readFile(process.argv[2]);
  await startTest(benchmarkConfig, process.argv[3]);
}

main().catch(err => {
  console.error(err);
});
