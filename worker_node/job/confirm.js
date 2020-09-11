const Base = require('./base');
const Ain = require('@ainblockchain/ain-js').default;

class Confirm extends Base {
  static configProps = [
    'ainUrl',
    'startBlockNumber',
    'finishBlockNumber',
    'txHashList',
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

  async requestTxHashList(from, to) {
    const txHashList = [];
    for (let number = from; number <= to; number++) {
      const block = await this.#ain.getBlock(number, true);
      txHashList.push(...block.transactions.map(it => it.hash));
    }
    return txHashList;
  }

  async calculateDuration(from, to) {
    const startTime = (await this.#ain.getBlock(from)).timestamp;
    const finishTime = (await this.#ain.getBlock(to)).timestamp;
    return finishTime - startTime; // ms
  }

  async process() {
    const startBlockNumber = this.config.startBlockNumber;
    const finishBlockNumber = this.config.finishBlockNumber;
    const txHashListInRange = await this.requestTxHashList(startBlockNumber, finishBlockNumber);
    const durationInRange = await this.calculateDuration(startBlockNumber, finishBlockNumber);
    const tps = txHashListInRange.length / (durationInRange / 1000);

    this.output.statistics.tps = tps;
    this.output.statistics.durationInRange = durationInRange;

    return this.output;
  }
}

module.exports = Confirm;
