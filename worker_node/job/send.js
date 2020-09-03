const Base = require('./base');
// const Ain = require('@ainblockchain/ain-js').default;
const Ain = require('../../../ain-js/lib/ain').default;
const delay = (time) => new Promise(resolve => setTimeout(resolve, time));
const moment = require('moment');

class Send extends Base {
  #ain;
  #startTime;
  #finishTime;
  #startBlock; // Todo(sanghee): Implement for verifying
  #finishBlock; // Todo(sanghee): Implement for verifying

  constructor(config) {
    super(config);
    this.output = {
      errorMessage: '',
      statistics: {
        success: 0,
        fail: 0,
        runningTime: 0,
      },
      txHashList: [],
    };
    this.#ain = new Ain(this.config.ainUrl);
    this.#ain.wallet.add(this.config.ainPrivateKey);
    this.#ain.wallet.setDefaultAccount(this.config.ainAddress);
    this.#startTime = 0;
    this.#finishTime = 0;
  }

  async sendTxs() {
    const delayTime = this.config.time / this.config.number * 1000;
    const sendTxPromiseList = [];

    if (!this.config.baseTx.timestamp) {
      this.config.baseTx.timestamp = Date.now();
    }

    for (let i = 0; i < this.config.number; i++) {
      const tx = Object.assign({}, this.config.baseTx);
      tx.timestamp = tx.timestamp + i;
      sendTxPromiseList.push(
          new Promise((resolve, reject) => {
            this.#ain.sendTransaction(tx).then(result => {
              if (!result || !result.hasOwnProperty('txHash')) {
                throw Error(`Wrong format`);
              } else if (!result.result) {
                throw Error('result !== true');
              }
              resolve(result.txHash);
            }).catch(err => {
              resolve(err);
            });
          }),
      );
      await delay(delayTime);
    }

    const sendTxResultList = await Promise.all(sendTxPromiseList);
    return sendTxResultList;
  }

  checkSendResultList(sendTxResultList) {
    const txHashList = sendTxResultList.filter(sendTxResult => {
      return !(sendTxResult instanceof Error);
    });

    this.output.statistics.success = txHashList.length;
    this.output.statistics.fail = this.config.number - txHashList.length;
    return txHashList;
  }

  async process() {
    this.#startTime = new Date().getTime();

    const sendResultList = await this.sendTxs();
    const txHashList = this.checkSendResultList(sendResultList);

    this.#finishTime = new Date().getTime();
    this.output.statistics.runningTime = moment(
        this.#finishTime - this.#startTime).format('mm:ss');
    this.output.txHashList = txHashList;
    if (this.output.statistics.success === 0) {
      throw Error('Success rate 0%');
    }
    return this.output;
  }

}

module.exports = Send;
