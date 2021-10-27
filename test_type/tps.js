// TODO(csh): Need refactoring
const request = require('../util/request');
const {getMonitoringInfoFromGoogleCloud} = require('../util/monitoring');
const fs = require('fs');
const moment = require('moment-timezone');
const { JobStatus, JobType } = require('../constants');
const delay = (time) => new Promise(resolve => setTimeout(resolve, time));
const debugMode = !!process.env.DEBUG;
const startTime = new Date().getTime();

function delayForMonitoring(benchmarkConfig, time) {
  const monitoringConfig = benchmarkConfig.monitoring;
  if (!monitoringConfig || !monitoringConfig.enable) {
    return delay(time);
  }
}

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
        numberOfTransactions: benchmarkConfig.numberOfTransactions,
        saveTxs: benchmarkConfig.saveTxs || false,
        monitoring: {
          ...benchmarkConfig.monitoring,
        },
        ...target,
      },
      jobList: [],
    };
    testList.push(test);
  }

  return testList;
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
        sendStartTime: test.jobList[prevJobIndex].output.sendStartTime,
        startBlockNumber: test.jobList[prevJobIndex].output.startBlockNumber,
        finishBlockNumber: test.jobList[prevJobIndex].output.finishBlockNumber,
        transactionOperationRef: test.jobList[prevJobIndex].input.config.transactionOperation.ref,
        sendSuccess: test.jobList[prevJobIndex].output.statistics.success,
        saveTxs: test.config.saveTxs,
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

function getNumberOfShards(testList) {
  if (!testList) {
    return 0;
  }
  const pathTable = {};
  for (const test of testList) {
    const path = test.config.ainUrl;
    pathTable[path] = true;
  }
  return Object.keys(pathTable).length;
}

function printJobResult(testList, jobIndex) {
  console.log(`\n- Finish '${testList[0].jobList[jobIndex].input.type}' job [${getRunningTime()}]`);
  for (const [i, test] of testList.entries()) {
    const job = test.jobList[jobIndex];
    let additionalInfo = '';
    if (job.status === JobStatus.SUCCESS) {
      if (job.input.type === JobType.SEND) {
        additionalInfo = `, send: ${job.output.statistics.success}` +
            `, pass: ${job.output.statistics.pass}` +
            `, error: ${job.output.statistics.error}` +
            `, startBlockNumber: ${job.output.startBlockNumber}` +
            `, finishBlockNumber: ${job.output.finishBlockNumber}`;
      } else if (job.input.type === JobType.CONFIRM) {
        additionalInfo = `, tps: ${job.output.statistics.tps}` +
            `, lossRate: ${job.output.statistics.lossRate}` +
            `, sendStartTime: ${job.output.statistics.sendStartTime}` +
            `, finishBlockFinalizedAt: ${job.output.statistics.finishBlockFinalizedAt}`;
      }
    } else if (job.status === JobStatus.FAIL) {
      additionalInfo = `, error message: ${job.output.message})`;
    }
    console.log(`[Worker ${i + 1}] status: ${job.status}, target: ${test.config.ainUrl}${additionalInfo}`);
  }
  console.log('');
}

function assembleTestResult(testList) {
  console.log(`- Finish all jobs [${getRunningTime()}]`);
  console.log(`\n- Statistics`);

  let totalTps = 0;
  let totalTxCount = 0;
  let totalTimeoutTxCount = 0;
  const numberOfShards = getNumberOfShards(testList);

  for (const [i, test] of testList.entries()) {
    const confirmJob = test.jobList[1];
    const ainUrl = test.config.ainUrl;

    console.log(`[Shard ${i + 1}] endpoint: ${ainUrl}, path: ${test.config.transactionOperation.ref}`);
    if (confirmJob.status !== JobStatus.SUCCESS) {
      console.log(`Error: ${confirmJob.output.message} [${ainUrl}]`);
    } else {
      const tps = confirmJob.output.statistics.tps;
      totalTps += tps;
      totalTxCount += confirmJob.output.statistics.transactionCount;
      totalTimeoutTxCount += confirmJob.output.statistics.timeoutTransactionCount;
      console.log(`TPS: ${Number(tps).toFixed(5)} ` +
          ` <= ${confirmJob.output.statistics.transactionCount} txs ` +
          `/ ${confirmJob.output.statistics.sendDuration / 1000} secs)`);
    }
    console.log();
  }
  totalTps = Number(totalTps.toFixed(5));
  const lossRate = Number((totalTimeoutTxCount / totalTxCount * 100).toFixed(5));
  console.log(`Total TPS : ${totalTps}`);
  console.log(`Number of shards (sharding paths) : ${numberOfShards}`);
  console.log(`Total timeout transaction count (A) : ${totalTimeoutTxCount}`);
  console.log(`Total transaction count (B) : ${totalTxCount}`);
  console.log(`Total lose rate (Y): ${lossRate}%`);
  return {
    totalTps,
    totalTimeoutTxCount,
    totalTxCount,
    lossRate,
    testList,
  }
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

async function writeTestResult(testResult, testList, outputDirName) {
  const outputFilePath = `${outputDirName}/result.json`;
  await fs.writeFileSync(outputFilePath, JSON.stringify(testResult, null, 2));
  for (const [i, test] of testList.entries()) {
    const confirmJob = test.jobList[1];
    if (confirmJob.status !== JobStatus.SUCCESS) {
      continue;
    }
    if (!test.config.saveTxs) {
      continue;
    }
    const testDir = outputDirName + `/s${(i + 1).toString().padStart(2, '0')}`; // s01, s02 ...
    const transactionsFile = testDir + `/transactions.jsonl`;
    fs.mkdirSync(testDir);
    await writeJsonlFile(transactionsFile, confirmJob.output.transactionList);
    confirmJob.output.transactionList = undefined;
    await delay(1000);
  }
  console.log(`- Save result in '${outputDirName}'`);
}

async function clear(testList) {
  console.log(`- Request workers to cleanup data`);
  for (const test of testList) {
    for (let i = 0; i < 2; i++) {
      const job = test.jobList[i];
      if (job.status !== JobStatus.SUCCESS) {
        continue;
      }
      try {
        await requestToDeleteJob(job);
      } catch (err) {
        console.log(`Fail to cleanup data (${err.message}) [${test.config.ainUrl}]`);
      }
    }
  }
  console.log(`- Finish to cleanup data`);
}

async function getMonitoringInfo(benchmarkConfig, startTime, endTime) {
  const monitoringConfig = benchmarkConfig.monitoring;
  if (!monitoringConfig || !monitoringConfig.enable) {
    return;
  }
  if (!monitoringConfig.projectId || !monitoringConfig.instanceName ||
      !monitoringConfig.keyFilename) {
    console.log(`Invalid monitoring config`);
    return;
  }

  return await getMonitoringInfoFromGoogleCloud(monitoringConfig.projectId,
      monitoringConfig.instanceName, monitoringConfig.keyFilename, startTime, endTime);
}

async function start(benchmarkConfig, outputDirName) {
  const testList = makeTestList(benchmarkConfig);
  initOutputDirectory(outputDirName);

  await delayForMonitoring(60 * 1000);
  const testStartTime = Date.now();
  await delayForMonitoring(60 * 1000);

  // 'SEND' job
  await processSendJob(testList);
  await waitJob(testList, 0);
  printJobResult(testList, 0);

  await delayForMonitoring(180 * 1000);
  const sendEndTime = Date.now();
  await delayForMonitoring(60 * 1000);

  // 'CONFIRM' job
  await processConfirmJob(testList);
  await waitJob(testList, 1);
  printJobResult(testList, 1);

  // Wait (GCP is delayed by 3 minutes)
  await delayForMonitoring(4 * 60 * 1000);

  // Output
  const testResult = assembleTestResult(testList);
  testResult.monitoring = await getMonitoringInfo(benchmarkConfig, testStartTime, sendEndTime, testResult);
  await writeTestResult(testResult, testList, outputDirName);

  if (!debugMode) {
    await clear(testList);
  }
}

module.exports = {
  start,
};
