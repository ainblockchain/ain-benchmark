const Base = require('./base');
const Ain = require('@ainblockchain/ain-js').default;

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
        lossRate: null, // TODO(sanghee)
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
          blockNumber: tx.block_number,
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

  async process() {
    const startBlockNumber = this.config.startBlockNumber;
    const finishBlockNumber = this.config.finishBlockNumber;
    const transactionList = await this.requestTransactionList(startBlockNumber, finishBlockNumber);
    const duration = await this.calculateDuration(startBlockNumber, finishBlockNumber);
    const tps = transactionList.length / (duration / 1000);

    this.output.statistics.tps = tps;
    this.output.statistics.duration = duration;
    this.output.statistics.startBlockNumber = startBlockNumber;
    this.output.statistics.finishBlockNumber = finishBlockNumber;
    this.output.transactionList = transactionList;

    return this.output;
  }
}

module.exports = Confirm;
