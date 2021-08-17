const { JobStatus, JobType } = require('../constants');
const SendJob = require('./job/send');
const ConfirmJob = require('./job/confirm');
const CrossShardTestJob = require('./job/cross_shard_test');
const CallJob = require('./job/call');

class Worker {
  #jobList; // [{ status, input, output }]
  #currentJobId;
  #nextJobId;

  constructor() {
    this.#jobList = {};
    this.#currentJobId = 0;
    this.#nextJobId = 1;
  }

  /**
   * @param {String} id
   * @return {Object}
   */
  getJob(id) {
    if (!this.#jobList.hasOwnProperty(id)) {
      throw Error(`Can't find ${id}`);
    }
    return this.#jobList[id];
  }

  /**
   * @param {Object} jobInput
   * @return {Base}
   */
  initJob(jobInput) {
    if (this.#currentJobId) {
      throw Error(`Worker is busy now (job:${this.#currentJobId})`);
    }
    const jobInstance = this.getJobInstance(jobInput);
    this.#currentJobId = this.#nextJobId++;
    this.#jobList[this.#currentJobId] = {
      status: JobStatus.PROGRESS,
      input: jobInput,
      output: {},
    };
    return jobInstance;
  }

  /**
   * @param {String} id
   */
  deleteJob(id) {
    if (!this.#jobList[id]) {
      throw Error(`Job ID ${id} is not exist`);
    }

    if (!this.#jobList[id].status === JobStatus.DELETE) {
      throw Error(`Already deleted`);
    }

    this.#jobList[id].input = {};
    this.#jobList[id].output = {};
    this.#jobList[id].status = JobStatus.DELETE;
  }

  /**
   * @param {Object} jobInput
   * @return {Base}
   */
  getJobInstance(jobInput) {
    let jobInstance = null;
    if (jobInput.type === JobType.SEND) {
      jobInstance = new SendJob(jobInput.config);
    } else if (jobInput.type === JobType.CONFIRM) {
      jobInstance = new ConfirmJob(jobInput.config);
    } else if (jobInput.type === JobType.CROSS_SHARD_TEST) {
      jobInstance = new CrossShardTestJob(jobInput.config);
    } else if (jobInput.type === JobType.CALL) {
      jobInstance = new CallJob(jobInput.config);
    } else {
      throw Error(`Unknown job type (${jobInput.type})`);
    }
    return jobInstance;
  }

  /**
   * @param {Base} jobInstance
   */
  processJob(jobInstance) {
    const id = this.#currentJobId;
    console.log(`Start ${id} job`);
    jobInstance.process().then(result => {
      this.#jobList[id].output = result;
      this.#jobList[id].status = JobStatus.SUCCESS;
      console.log(`Finish ${id} job`);
    }).catch(err => {
      this.#jobList[id].output.message = err.message;
      this.#jobList[id].status = JobStatus.FAIL;
      console.log(`Fail ${id} job`);
    }).finally(() => {
      this.#currentJobId = 0;
    });
  }

  /**
   * @param {Object} jobInput
   * @return {Number}
   */
  startJob(jobInput) {
    const jobInstance = this.initJob(jobInput);
    this.processJob(jobInstance);

    return this.#currentJobId;
  }
}

module.exports = new Worker();
