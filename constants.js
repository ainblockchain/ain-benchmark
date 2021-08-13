const JobType = Object.freeze({
  SEND: 'SEND',
  CONFIRM: 'CONFIRM',
  CROSS_SHARD_TEST: 'CROSS_SHARD_TEST',
});

const JobStatus = Object.freeze({
  PROGRESS: 'PROGRESS',
  SUCCESS: 'SUCCESS',
  FAIL: 'FAIL',
  PASS: 'PASS',
  DELETE: 'DELETE',
});

const TestType = Object.freeze({
  TPS: 'TPS',
  CROSS_SHARD: 'CROSS_SHARD',
});

module.exports = {
  JobType,
  JobStatus,
  TestType,
};
