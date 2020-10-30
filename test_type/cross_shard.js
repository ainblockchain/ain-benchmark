const request = require('../util/request');
const delay = (time) => new Promise(resolve => setTimeout(resolve, time));
const _ = require('lodash');
const moment = require('moment-timezone');
const fs = require('fs');
const { JobStatus, JobType } = require('../constants');
const startTime = new Date().getTime();
const resultDir = `result_${moment().tz('Asia/Seoul').format('MM-DD_HH:mm:SS')}`;

function initResultDirectory() {
  if (!fs.existsSync(resultDir)) {
    fs.mkdirSync(resultDir);
  }
}

function timestampToString(timestamp) {
  return moment(timestamp).format('mm:ss:S');
}

function getRunningTime() {
  return moment(new Date().getTime() - startTime).format('mm:ss');
}

function makeTestList(benchmarkConfig) {
  const testList = [];
  let index = 0;
  const testStartTime = Date.now() + (20 * 1000);

  for (const target of benchmarkConfig.targetList) {
    // For incremental stress test
    const rate = Number((1 - (index / benchmarkConfig.targetList.length)).toFixed(2));
    const duration = Math.floor(benchmarkConfig.duration * rate);
    const numberOfTransactions = Math.floor(benchmarkConfig.numberOfTransactions * rate);
    const wait = benchmarkConfig.duration - duration;
    const startTime = testStartTime + (wait * 1000);

    const test = {
      config: {
        duration: duration,
        numberOfTransactions: numberOfTransactions,
        wait: wait,
        startRound: index + 1,
        startTime: startTime,
        ...target,
      },
      jobList: [],
    };
    testList.push(test);
    index++;
  }
  return testList;
}

function addCrossShardTestJob(testList) {
  for (const test of testList) {
    test.jobList.push({
      workerUrl: test.config.workerUrl,
      input: {
        type: JobType.CROSS_SHARD_TEST,
        config: {
          ...test.config,
        },
      },
      output: {},
    });
  }
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
  const requestList = [];
  for (const test of testList) {
    requestList.push(requestJob(test.jobList[jobIndex]));
  }
  await Promise.all(requestList);
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

async function processCrossShardTestJob(testList) {
  addCrossShardTestJob(testList);
  await processJob(testList, 0);
  await waitJob(testList, 0);
}

function makeRoundList(testList) {
  // Make dataPool
  const dataPool = [];
  for (const [index, test] of testList.entries()) {
    if (!test.jobList[0].output.matchedList) {
      continue;
    }
    for (const matchedData of test.jobList[0].output.matchedList) {
      matchedData.shardNumber = index + 1;
      dataPool.push(matchedData);
    }
  }
  dataPool.sort((a, b) => {
    return a.sentAt < b.sentAt ? -1 : a.sentAt > b.sentAt ? 1 : 0;
  });

  // Slice by time zone
  const roundList = [];
  for (const test of testList) {
    const startTime = _.get(test, 'jobList[0].output.matchedList[0].sentAt', 0);
    const round = {
      startTime: startTime ? startTime - 1000 : 0,
      finishTime: 0,
      averageOfFinalizationTime: 0,
      checkinTxCount: 0,
      matchedList: [],
    };
    roundList.push(round);
  }

  for (const [index, round] of roundList.entries()) {
    const startTime = round.startTime;
    let nextStartTime = 0;
    if (index === roundList.length - 1) {
      nextStartTime = 4102491661000; // 2100/01/01
    } else {
      nextStartTime = roundList[index + 1].startTime;
    }

    round.matchedList.push(...dataPool.filter(data => {
      return data.sentAt >= startTime && data.sentAt < nextStartTime;
    }));

    round.matchedList.sort((a, b) => {
      return a.sentAt < b.sentAt ? -1 : a.sentAt > b.sentAt ? 1 : 0;
    });

    const totalOfFinalizationTime = round.matchedList.reduce((acc, cur) => {
      return acc + cur.durationOfFinalization;
    }, 0);

    round.checkinTxCount = round.matchedList.length;

    if (round.matchedList.length === 0) {
      continue;
    }

    round.startTime = round.matchedList[0].sentAt;
    round.finishTime = round.matchedList[round.matchedList.length - 1].sentAt;
    round.averageOfFinalizationTime = Number((totalOfFinalizationTime / round.matchedList.length).toFixed(2));
    round.totalOfFinalizationTime = totalOfFinalizationTime;
  }

  return roundList;
}

function getTotalAverageOfFinalizationTime(roundList) {
  let totalTime = 0;
  let totalCount = 0;
  for (const round of roundList) {
    totalTime += round.totalOfFinalizationTime;
    totalCount += round.checkinTxCount;
  }
  if (totalCount === 0) {
    return 0;
  }
  return Number((totalTime / totalCount).toFixed(2));
}

function printJobResult(testList, jobIndex) {
  console.log(`\n- Finish '${testList[0].jobList[jobIndex].input.type}' job [${getRunningTime()}]`);
  for (const [i, test] of testList.entries()) {
    const job = test.jobList[jobIndex];
    let additionalInfo = '';
    if (job.status === JobStatus.SUCCESS) {
      if (job.input.type === JobType.CROSS_SHARD_TEST) {
        additionalInfo = `, sendError: ${job.output.statistics.sendError}` +
            `, checkinError: ${job.output.statistics.checkinError}` +
            `, checkinSuccess: ${job.output.statistics.checkinSuccess}`;
      }
    } else if (job.status === JobStatus.FAIL) {
      additionalInfo = `, error message: ${job.output.message})`;
    }
    console.log(`[Worker ${i + 1}] status: ${job.status}, target: ${test.config.ainUrl}${additionalInfo}`);
  }
  console.log('');
}

function printResult(testList, roundList) {
  console.log(`- Finish all jobs [${getRunningTime()}]`);
  for (const [index, round] of roundList.entries()) {
    console.log(`[Round ${index + 1}] averageOfFinalizationTime: ${round.averageOfFinalizationTime}ms, ` +
        `startTime: ${moment(round.startTime).tz('Asia/Seoul').format('HH:mm:SS')}, ` +
        `checkinTxCount: ${round.checkinTxCount}`);
  }
  console.log(`* Total average of finalization time (X): ${getTotalAverageOfFinalizationTime(roundList)}ms`);
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
    const crossShardTestJob = test.jobList[0];
    if (crossShardTestJob.status !== JobStatus.SUCCESS) {
      continue;
    }

    const testDir = resultDir + `/s${(i + 1).toString().padStart(2, '0')}`; // s01, s02 ...
    const transactionsFile = testDir + `/transactions.jsonl`;
    fs.mkdirSync(testDir);
    await writeJsonlFile(transactionsFile, crossShardTestJob.output.transactionList);
  }
}

function writeRoundResult(roundList) {
  for (const [i, round] of roundList.entries()) {
    const roundDir = resultDir + `/r${(i + 1).toString().padStart(2, '0')}`; // r01, r02 ...
    const roundResultFile = roundDir + `/result.json`;
    fs.mkdirSync(roundDir);
    fs.writeFileSync(roundResultFile, JSON.stringify(round, null, 2));
  }
}

async function writeResult(testList, roundList) {
  initResultDirectory();
  await writeTestResult(testList);
  writeRoundResult(roundList);

  console.log(`- Save result in '${resultDir}'`);
}

async function start(benchmarkConfig) {
  const testList = makeTestList(benchmarkConfig);

  await processCrossShardTestJob(testList);
  printJobResult(testList, 0);

  const roundList = makeRoundList(testList);
  printResult(testList, roundList);

  await writeResult(testList, roundList);
}

module.exports = {
  start,
};
