const JobType = Object.freeze({
  SEND: 'SEND',
  CONFIRM: 'CONFIRM',
});

const JobStatus = Object.freeze({
  PROGRESS: 'PROGRESS',
  SUCCESS: 'SUCCESS',
  FAIL: 'FAIL',
  PASS: 'PASS',
});

module.exports = {
  JobType,
  JobStatus,
};
