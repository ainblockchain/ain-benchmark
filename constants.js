const JobType = Object.freeze({
  SEND: 'SEND',
  CONFIRM: 'CONFIRM',
});

const JobStatus = Object.freeze({
  PROGRESS: 'PROGRESS',
  SUCCESS: 'SUCCESS',
  FAIL: 'FAIL',
  PASS: 'PASS',
  DELETE: 'DELETE',
});

module.exports = {
  JobType,
  JobStatus,
};
