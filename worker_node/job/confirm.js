const Base = require('./base');
const Ain = require('@ainblockchain/ain-js').default;
const request = require('../../util/request');

class Confirm extends Base {
  static configProps = [
    'ainUrl',
    'startBlockNumber',
    'finishBlockNumber',
  ];
  #ain;

  constructor(config) {
    super(config, Confirm.configProps);
    this.output = {
      message: '',
      statistics: {
        tps: null,
        lossRate: null,
      },
    };
    this.#ain = new Ain(this.config.ainUrl);
    this.#ain.provider.setDefaultTimeoutMs(60 * 1000);
  }

  async requestTransactionList(from, to) {
    const transactionList = [];
    for (let number = from; number <= to; number++) {
      const block = await this.#ain.getBlock(number, true);
      transactionList.push(...block.transactions.map(tx => {
        return {
          blockNumber: number,
          hash: tx.hash,
          nonce: tx.nonce,
          timestamp: tx.timestamp,
          operation: tx.operation,
        };
      }));
    }
    return transactionList;
  }

  async calculateDuration(from, to) {
    const startTime = (await this.#ain.getBlock(from)).timestamp;
    const finishTime = (await this.#ain.getBlock(to)).timestamp;
    return finishTime - startTime; // ms
  }

  async calculateLossRate() {
    const ref = this.config.transactionOperationRef;
    if (!ref) {
      return null;
    }
    const response = await request({
      method: 'post',
      baseURL: this.config.ainUrl,
      url: '/json-rpc',
      data: {
        jsonrpc: '2.0',
        id: 1,
        method: 'ain_get',
        params: {
          type: 'GET_VALUE',
          ref: ref,
          is_global: true,
          protoVer: '0.1.0'
        },
      }
    });

    const sendSuccess = this.config.sendSuccess;
    const count = response.data.result.result;
    if (!count) {
      return null;
    }

    return (1 - (count / sendSuccess)).toFixed(5) * 100 + '%';
  }

  async process() {
    const startBlockNumber = this.config.startBlockNumber;
    const finishBlockNumber = this.config.finishBlockNumber;
    const transactionList = await this.requestTransactionList(startBlockNumber, finishBlockNumber);
    const duration = await this.calculateDuration(startBlockNumber, finishBlockNumber);
    const tps = transactionList.length / (duration / 1000);
    const lossRate = await this.calculateLossRate();

    this.output.statistics.tps = tps;
    this.output.statistics.lossRate = lossRate;
    this.output.statistics.duration = duration;
    this.output.statistics.startBlockNumber = startBlockNumber;
    this.output.statistics.finishBlockNumber = finishBlockNumber;
    this.output.transactionList = transactionList;

    return this.output;
  }
}

module.exports = Confirm;
