const Base = require('./base');
const Ain = require('@ainblockchain/ain-js').default;
const TX_TIMEOUT_MS = process.env.TX_TIMEOUT_MS || 3000;

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
        transactionCount: 0,
      },
    };
    this.#ain = new Ain(this.config.ainUrl);
    this.#ain.provider.setDefaultTimeoutMs(60 * 1000);
  }

  async requestTransactionList(from, to) {
    const transactionList = [];
    let timeoutTxCount = 0;
    let totalConfirmedTime = 0;

    for (let number = from; number <= to; number++) {
      const block = await this.#ain.getBlock(number, true);
      this.output.statistics.transactionCount += block.transactions.length;
      if (!this.config.saveTxs) {
        continue;
      }
      transactionList.push(...block.transactions.reduce((acc, tx) => {
        const confirmedTime = block.timestamp - tx.timestamp;
        if (confirmedTime > TX_TIMEOUT_MS) {
          timeoutTxCount++;
        }
        totalConfirmedTime += confirmedTime;
        acc.push({
          blockNumber: number,
          hash: tx.hash,
          nonce: tx.nonce,
          timestamp: tx.timestamp,
          operation: tx.operation,
        });
        return acc;
      }, []));
    }
    this.output.statistics.confirmedTimeAverage = transactionList.length ?
        totalConfirmedTime / transactionList.length : 0;
    this.output.statistics.lossRate = this.calculateLossRate(timeoutTxCount, this.output.statistics.transactionCount);
    this.output.statistics.timeoutTransactionCount = timeoutTxCount;
    return transactionList;
  }

  async calculateDuration(from, to) {
    const startTime = (await this.#ain.getBlock(from)).timestamp;
    const finishTime = (await this.#ain.getBlock(to)).timestamp;
    return finishTime - startTime; // ms
  }

  calculateLossRate(timeoutTxCount, totalTxCount) {
    if (!totalTxCount) {
      return '0%';
    }
    return (timeoutTxCount / totalTxCount * 100).toFixed(5) + '%';
  }

  async process() {
    const startBlockNumber = this.config.startBlockNumber;
    const finishBlockNumber = this.config.finishBlockNumber;
    const transactionList = await this.requestTransactionList(startBlockNumber, finishBlockNumber);
    const blockDuration = await this.calculateDuration(startBlockNumber, finishBlockNumber);
    const tps = this.output.statistics.transactionCount / (blockDuration / 1000);

    this.output.statistics.tps = tps;
    this.output.statistics.blockDuration = blockDuration;
    this.output.statistics.startBlockNumber = startBlockNumber;
    this.output.statistics.finishBlockNumber = finishBlockNumber;
    this.output.transactionList = transactionList;

    return this.output;
  }
}

module.exports = Confirm;
