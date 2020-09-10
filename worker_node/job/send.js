const Base = require('./base');
const Ain = require('@ainblockchain/ain-js').default;
const delay = (time) => new Promise(resolve => setTimeout(resolve, time));
const BLOCK_TIME = 8000;

class Send extends Base {
  #ain;

  constructor(config) {
    super(config);
    this.output = {
      message: '',
      statistics: {
        success: 0,
        fail: 0,
        runningTime: 0,
      },
      txHashList: [],
      startBlockNumber: 0,
      finishBlockNumber: 0,
    };
    this.#ain = new Ain(this.config.ainUrl);
    this.#ain.wallet.add(this.config.ainPrivateKey);
    this.#ain.wallet.setDefaultAccount(this.config.ainAddress);
  }

  async getRecentBlockInformation(keyList) {
    try {
      const information = await this.#ain.provider.send('ain_getRecentBlock');
      return keyList.reduce((acc, cur) => {
        acc[cur] = information[cur];
        return acc;
      }, {});
    } catch (err) {
      console.log(`Error while getRecentBlockInformation (${err.message})`);
      throw err;
    }
  }

  async sendTxs() {
    const delayTime = this.config.time / this.config.number * 1000;
    const sendTxPromiseList = [];

    if (!this.config.timestamp) {
      this.config.timestamp = Date.now();
    }

    for (let i = 0; i < this.config.number; i++) {
      const tx = Object.assign({}, this.config.baseTx);
      tx.timestamp = this.config.timestamp + i;

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
    const startBlock = await this.getRecentBlockInformation(['timestamp', 'number']);
    const sendResultList = await this.sendTxs();
    const txHashList = this.checkSendResultList(sendResultList);
    await delay(BLOCK_TIME);
    const finishBlock = await this.getRecentBlockInformation(['timestamp', 'number']);

    this.output.statistics.timeFromStartToFinish = finishBlock.timestamp - startBlock.timestamp;
    this.output.txHashList = txHashList;
    this.output.startBlockNumber = startBlock.number;
    this.output.finishBlockNumber = finishBlock.number;
    if (this.config.number && this.output.statistics.success === 0) {
      throw Error('Success rate 0%');
    }
    return this.output;
  }

}

module.exports = Send;
