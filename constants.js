const JobType = Object.freeze({
  SEND: 'SEND',
  VERIFY: 'VERIFY',
});

const JobStatus = Object.freeze({
  PROGRESS: 'PROGRESS',
  SUCCESS: 'SUCCESS',
  FAIL: 'FAIL',
});

module.exports = {
  JobType,
  JobStatus,
};
