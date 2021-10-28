const request = require('../util/request');
const fs = require('fs');
const { JobStatus } = require('../constants');
const { JobType } = require('../constants');
const delay = require('../util/delay');
const moment = require('moment-timezone');
const startTime = new Date().getTime();

function initOutputDirectory(outputDirName) {
  if (!fs.existsSync(outputDirName)) {
    fs.mkdirSync(outputDirName);
  }
}

function makeTestList(benchmarkConfig) {
  const testList = [];

  for (const target of benchmarkConfig.targetList) {
    const test = {
      config: {
        duration: benchmarkConfig.duration,
        numberOfCalls: benchmarkConfig.numberOfCalls,
        ...target,
      },
      jobList: [],
    };
    testList.push(test);
  }

  return testList;
}

function addCallJob(testList) {
  const timestamp = Date.now();
  for (const test of testList) {
    test.jobList.push({
      workerUrl: test.config.workerUrl,
      input: {
        type: JobType.CALL,
        config: {
          ...test.config,
          timestamp,
        },
      },
      output: {},
    });
  }
}

function getRunningTime() {
  return moment(new Date().getTime() - startTime).format('mm:ss');
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
    console.log(`Error while request job (${err.message})`);
    job.status = JobStatus.FAIL;
    job.output.message = err.message;
  }
}

async function processJob(testList, jobIndex) {
  console.log(`- Start to process '${testList[0].jobList[jobIndex].input.type}' job`);
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
        `(${testList.length - unfinishedCount}/${testList.length}) [${getRunningTime()}]`);
    await delay(10000);
  } while (true);
}

async function processQpsTest(testList) {
  addCallJob(testList);
  await processJob(testList, 0);
}


function assembleTestResult(testList) {
  console.log(`- Finish all jobs [${getRunningTime()}]`);
  console.log(`\n- Statistics`);

  let totalQps = 0;
  let totalSuccess = 0;
  let totalError = 0;

  for (const [i, test] of testList.entries()) {
    const callJob = test.jobList[0];
    const ainUrl = test.config.ainUrl;

    console.log(`[Shard ${i + 1}] endpoint: ${ainUrl}, method: ${test.config.method}, body: ${JSON.stringify(test.config.body)}, ` +
        `startCallTime: ${callJob.output.statistics.startCallTime}, finishCallTime: ${callJob.output.statistics.finishCallTime}`);
    if (callJob.status !== JobStatus.SUCCESS) {
      console.log(`Error: ${callJob.output.message} [${ainUrl}]`);
    } else {
      const qps = callJob.output.statistics.qps;
      totalQps += qps;
      totalSuccess += callJob.output.statistics.success;
      totalError += callJob.output.statistics.error;
      console.log(`QPS: ${Number(qps).toFixed(5)} (${callJob.output.statistics.success} calls / ${callJob.output.statistics.totalCallTime / 1000} secs)`);
    }
    console.log();
  }
  totalQps = Number(totalQps.toFixed(5));
  console.log(`Total QPS : ${totalQps}`);
  console.log(`Total call success count (A) : ${totalSuccess}`);
  console.log(`Total call error count (B) : ${totalError}`);
  return {
    totalQps,
    totalSuccess,
    totalError,
    testList,
  }
}

function writeTestResult(testResult, testList, outputDirName) {
  const outputFilePath = `${outputDirName}/result.json`;
  fs.writeFileSync(outputFilePath, JSON.stringify(testResult, null, 2));
  console.log(`- Save result in '${outputDirName}'`);
}

async function start(benchmarkConfig, outputDirName) {
  const testList = makeTestList(benchmarkConfig);
  initOutputDirectory(outputDirName);
  await processQpsTest(testList);
  await waitJob(testList, 0);

  // Output
  const testResult = assembleTestResult(testList);
  writeTestResult(testResult, testList, outputDirName);
}

module.exports = {
  start,
};
