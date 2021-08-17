const JobType = Object.freeze({
  SEND: 'SEND',
  CONFIRM: 'CONFIRM',
  CROSS_SHARD_TEST: 'CROSS_SHARD_TEST',
  CALL: 'CALL',
});

const JobStatus = Object.freeze({
  PROGRESS: 'PROGRESS',
  SUCCESS: 'SUCCESS',
  FAIL: 'FAIL',
  PASS: 'PASS',
  DELETE: 'DELETE',
});

const TestType = Object.freeze({
  QPS: 'QPS',
  TPS: 'TPS',
  CROSS_SHARD: 'CROSS_SHARD',
});

module.exports = {
  JobType,
  JobStatus,
  TestType,
};
