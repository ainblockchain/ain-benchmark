const request = require('./util/request');
const fs = require('fs');
const moment = require('moment-timezone');
const { JobStatus, JobType } = require('./constants');
const delay = (time) => new Promise(resolve => setTimeout(resolve, time));
const debugMode = !!process.env.DEBUG;
const resultDir = `result_${moment().tz('Asia/Seoul').format('MM-DD_HH:mm:SS')}`;

function initResultDirectory() {
  if (!fs.existsSync(resultDir)) {
    fs.mkdirSync(resultDir);
  }
}

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

function makeTestList(benchmarkConfig) {
  const testList = [];

  for (const target of benchmarkConfig.targetList) {
    const test = {
      config: {
        duration: benchmarkConfig.duration,
        numberOfTransactions: benchmarkConfig.numberOfTransactions,
        ...target,
      },
      jobList: [],
    };
    testList.push(test);
  }

  return testList;
}

async function requestJob(job) {
  if (job.status === JobStatus.PASS) {
    return;
  }

  try {
    const response = await request({
      method: 'post',
      baseURL: job.workerUrl,
      url: '/job',
      data: job.input,
    });
    job.status = JobStatus.PROGRESS;
    job.id = response.data.id;
  } catch (err) {
    console.log(err.message);
    job.status = JobStatus.FAIL;
    job.output.message = err.message;
  }
}

async function requestToDeleteJob(job) {
  try {
    const response = await request({
      method: 'delete',
      baseURL: job.workerUrl,
      url: `/job/${job.id}`,
    });
    job.input = {};
    job.output = {};
    job.status.status = JobStatus.DELETE;
  } catch (err) {
    console.log(err.message);
  }
}

async function processJob(testList, jobIndex) {
  console.log(`Start to process '${testList[0].jobList[jobIndex].input.type}' job`);
  for (const test of testList) {
    await requestJob(test.jobList[jobIndex]);
  }
}

async function waitJob(testList, jobIndex) {
  let unfinishedCount;
  const jobType = testList[0].jobList[jobIndex].input.type;

  do {
    unfinishedCount = 0;

    for (const test of testList) {
      const job = test.jobList[jobIndex];

      if (job.status !== JobStatus.PROGRESS) {
        continue;
      }

      try {
        const response = await request({
          method: 'get',
          baseURL: job.workerUrl,
          url: `/job/${job.id}`,
        });

        job.status = response.data.status;
        job.output = response.data.output;
        if (job.status === JobStatus.PROGRESS) {
          unfinishedCount++;
        }
      } catch (err) {
        job.status = JobStatus.FAIL;
        job.output.message = err.message;
      }
    }
    if (unfinishedCount === 0) {
      break;
    }
    console.log(`${unfinishedCount} workers are still processing '${jobType}' job ` +
        `(${testList.length - unfinishedCount}/${testList.length})`);
    await delay(10000);
  } while (true);
}

function addSendJob(testList) {
  const timestamp = Date.now();
  for (const test of testList) {
    test.jobList.push({
      workerUrl: test.config.workerUrl,
      input: {
        type: JobType.SEND,
        config: {
          ...test.config,
          timestamp,
        },
      },
      output: {},
    });
  }
}

function addConfirmJob(testList) {
  for (const test of testList) {

    const job = {
      workerUrl: test.config.workerUrl,
      input: {
        type: JobType.CONFIRM,
      },
      output: {},
    };

    const prevJobIndex = test.jobList.length - 1;

    try {
      if (test.jobList[prevJobIndex].status === JobStatus.FAIL) {
        throw Error('Previous job failed');
      }
      if (test.jobList[prevJobIndex].type === JobType.SEND) {
        throw Error(`Previous job is not 'SEND' type`);
      }

      job.input.config = {
        ainUrl: test.config.ainUrl,
        startBlockNumber: test.jobList[prevJobIndex].output.startBlockNumber,
        finishBlockNumber: test.jobList[prevJobIndex].output.finishBlockNumber,
        transactionOperationRef: test.jobList[prevJobIndex].input.config.transactionOperation.ref,
        sendSuccess: test.jobList[prevJobIndex].output.statistics.success,
      };
    } catch (err) {
      job.status = JobStatus.PASS;
      job.output.message = err.message;
    }
    test.jobList.push(job);
  }
}

async function processSendJob(testList) {
  addSendJob(testList);
  await processJob(testList, 0);
}

async function processConfirmJob(testList) {
  addConfirmJob(testList);
  await processJob(testList, 1);
}

function printJobResult(testList, jobIndex) {
  console.log(`\n'${testList[0].jobList[jobIndex].input.type}' job result`);
  for (const [i, test] of testList.entries()) {
    const job = test.jobList[jobIndex];
    let additionalInfo = '';
    if (job.status === JobStatus.SUCCESS) {
      additionalInfo = `(${JSON.stringify(job.output.statistics)})`;
    } else if (job.status === JobStatus.FAIL) {
      additionalInfo = `(${job.output.message})`;
    }
    console.log(`[Worker ${i + 1}] ${job.status} ${additionalInfo}`);
  }
  console.log('');
}

function getTpsList(testList) {
  const tpsList = {};
  for (const test of testList) {
    const confirmJob = test.jobList[1];
    const ainUrl = test.config.ainUrl;
    tpsList[ainUrl] = 0;

    if (confirmJob.status === JobStatus.SUCCESS) {
      const tps = confirmJob.output.statistics.tps;
      if (!tpsList[ainUrl] || tpsList[ainUrl] < tps) {
        tpsList[ainUrl] = tps;
      }
    }
  }
  return tpsList;
}

function calculateTotalTps(tpsList) {
  return Object.keys(tpsList).reduce((acc, cur) => {
    acc += tpsList[cur];
    return acc;
  }, 0);
}

function printTestResult(testList) {
  console.log(`Finish all jobs`);

  for (const test of testList) {
    console.log(`\n[Worker: ${test.jobList[0].workerUrl}, AIN: ${test.config.ainUrl}]`);

    for (let i = 0; i < 2; i++) {
      const job = test.jobList[i];
      if (job.status === JobStatus.SUCCESS) {
        console.log(`Type: ${job.input.type}, Status: ${job.status}, ` +
            `Statistics: ${JSON.stringify(job.output.statistics)}`);
      } else {
        console.log(`Type: ${job.input.type}, Status: ${job.status}, Error message: ${job.output.message}`);
      }
    }
  }

  console.log(`\nStatistics of TPS`);
  const tpsList = getTpsList(testList);
  console.log(JSON.stringify(tpsList, null, 4));
  console.log(`Total TPS: ${calculateTotalTps(tpsList)}`);
}

function writeJsonlFile(filename, dataList) {
  return new Promise((resolve, reject) => {
    const writeStream = fs.createWriteStream(filename);

    writeStream.on('finish', _ => {
      resolve(dataList.length);
    });

    writeStream.on('error', err => {
      reject(err);
    });

    for (const data of dataList) {
      writeStream.write(`${JSON.stringify(data)}\n`);
    }

    writeStream.end();
  });
}

async function writeTestResult(testList) {
  for (const [i, test] of testList.entries()) {
    const confirmJob = test.jobList[1];
    if (confirmJob.status !== JobStatus.SUCCESS) {
      continue;
    }

    const testDir = resultDir + `/s${(i + 1).toString().padStart(2, '0')}`; // s01, s02 ...
    const transactionsFile = testDir + `/transactions.jsonl`;
    fs.mkdirSync(testDir);
    await writeJsonlFile(transactionsFile, confirmJob.output.transactionList);
    confirmJob.output.transactionList = undefined;
    await delay(1000);
  }
}

async function clear(testList) {
  for (const test of testList) {
    for (let i = 0; i < 2; i++) {
      const job = test.jobList[i];
      if (job.status !== JobStatus.SUCCESS) {
        continue;
      }
      try {
        await requestToDeleteJob(job);
      } catch (err) {
        console.log(`Fail to delete job (${err.message})`);
      }
    }
  }
}

async function main() {
  checkArgs();
  const benchmarkConfig = readFile(process.argv[2]);
  const testList = makeTestList(benchmarkConfig);
  initResultDirectory();

  // 'SEND' job
  await processSendJob(testList);
  await waitJob(testList, 0);
  printJobResult(testList, 0);

  // 'CONFIRM' job
  await processConfirmJob(testList);
  await waitJob(testList, 1);
  printJobResult(testList, 1);

  // Output
  printTestResult(testList);
  await writeTestResult(testList);

  if (!debugMode) {
    await clear(testList);
  }
}

main().catch(err => {
  console.error(err);
});
