const _ = require('lodash');
const Base = require('./base');
const request = require('../../util/request');
const delay = require('../../util/delay');

class Call extends Base {
  static configProps = [
      'duration',
      'numberOfCalls',
      'ainUrl',
      'method',
      'body',
  ];

  constructor(config) {
    super(config, Call.configProps);
    this.output = {
      message: '',
      statistics: {
        qps: null,
        success: 0,
        error: 0,
      },
      callResultList: null,
    };
  }

  async startCall() {
    const callPromiseList = [];
    const targetTestEndTime = Date.now() + (this.config.duration * 1000);
    for (let i = 0; i < this.config.numberOfCalls; i++) {
      const now = Date.now();
      const delayTimeMs = (targetTestEndTime - now) / (this.config.numberOfCalls - i);
      if (delayTimeMs > 0) {
        await delay(delayTimeMs);
      }
      callPromiseList.push(
        request({
          method: this.config.method,
          baseURL: this.config.ainUrl,
          data: this.config.body,
        }).then(res => {
          this.output.statistics.success++;
          return {
            timestamp: now,
            response: res.data,
          };
        }).catch(err => {
          this.output.statistics.error++;
          return err.message;
        })
      );
    }

    const callResultList = await Promise.all(callPromiseList);
    return callResultList;
  }

  async process() {
    const startCallTime = Date.now();
    const callResultList = await this.startCall();
    const finishCallTime = Date.now();
    const totalCallTime = finishCallTime - startCallTime;
    const qps = this.output.statistics.success / (totalCallTime / 1000);
    this.output.statistics.startCallTime = startCallTime;
    this.output.statistics.finishCallTime = finishCallTime;
    this.output.statistics.totalCallTime = totalCallTime;
    this.output.callResultList = callResultList;
    this.output.statistics.qps = qps;
    return this.output;
  }
}

module.exports = Call;
