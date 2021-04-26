const Base = require('./base');
const Ain = require('@ainblockchain/ain-js').default;
const { BLOCKCHAIN_PROTOCOL_VERSION } = require('@ainblockchain/ain-js/lib/constants');
const delay = (time) => new Promise(resolve => setTimeout(resolve, time));
const request = require('../../util/request');
const BLOCK_TIME = process.env.BLOCK_TIME || 8000;
const REQUEST_THRESHOLD = process.env.REQUEST_THRESHOLD || 100; // When the threshold is reached, request is temporarily stopped
const RETRY_THRESHOLD = 3;

class Send extends Base {
  static configProps = [
    'duration',
    'numberOfTransactions',
    'ainUrl',
    'ainAddress',
    'ainPrivateKey',
    'transactionOperation',
  ];
  #ain;

  constructor(config) {
    super(config, Send.configProps);
    this.output = {
      message: '',
      statistics: {
        success: 0,
        error: 0,
        pass: 0,
        blockDuration: 0,
      },
      startBlockNumber: 0,
      finishBlockNumber: 0,
    };

    this.#ain = new Ain(this.config.ainUrl);
    this.#ain.wallet.add(this.config.ainPrivateKey);
    this.#ain.wallet.setDefaultAccount(this.config.ainAddress);
    this.#ain.provider.setDefaultTimeoutMs(60 * 1000);

  }

  async getRecentBlockInformation(keyList) {
    let retryCount = 0;
    while (true) {
      try {
        const information = await this.#ain.provider.send('ain_getRecentBlock');
        return keyList.reduce((acc, cur) => {
          acc[cur] = information[cur];
          return acc;
        }, {});
      } catch (err) {
        console.log(`Error while getRecentBlockInformation (${err.message}) (Retry:${retryCount})`);
        if (retryCount >= RETRY_THRESHOLD) {
          console.log(`getRecentBlockInformation: Throw error (${err.message})`);
          throw err;
        }
        retryCount++;
        await delay(2 * BLOCK_TIME);
      }
    }
  }

  async initPermission() {
    const path = this.config.transactionOperation.ref;
    const setOwnerTx = {
      operation: {
        type: 'SET_OWNER',
        ref: path,
        value: {
          '.owner': {
            owners: {
              '*': {
                write_owner: true,
                write_rule: true,
                write_function: true,
                branch_owner: true,
              },
            },
          },
        },
        is_global: true
      },
      nonce: -1,
    };
    const setRuleTx = {
      operation: {
        type: 'SET_RULE',
        ref: path,
        value: {
          '.write': true,
        },
        is_global: true
      },
      nonce: -1,
    };
    const setValueTx = {
      operation: {
        type: 'SET_VALUE',
        ref: path,
        value: 0,
        is_global: true
      },
      nonce: -1,
    };
    await this.#ain.sendTransactionBatch([
      setOwnerTx,
      setRuleTx,
      setValueTx,
    ]);

    await delay(2 * BLOCK_TIME);

    // TODO: update ain-js to support is_global and use ain-js here
    const response = await request({
      method: 'post',
      baseURL: this.config.ainUrl,
      url: '/json-rpc',
      data: {
        method: 'ain_evalRule',
        params: {
          ref: path,
          value: null,
          address: this.config.ainAddress,
          is_global: true,
          protoVer: BLOCKCHAIN_PROTOCOL_VERSION,
        },
        jsonrpc: '2.0',
        id: 0
      }
    });
    if (!response.data.result.result) {
      throw Error(`Can't write database (permission)`);
    }
  }

  makeBaseTransaction() {
    return {
      operation: {
        ...this.config.transactionOperation,
      },
      nonce: -1,
    };
  }

  async sendTxs() {
    const delayTime = this.config.duration / this.config.numberOfTransactions * 1000;
    const sendTxPromiseList = [];
    const consecutivePath = this.config.consecutivePath === true;
    const consecutiveValue = this.config.consecutiveValue === true;

    if (!this.config.timestamp) {
      this.config.timestamp = Date.now();
    }

    // const baseTimestamp = this.config.timestamp;
    const baseTx = this.makeBaseTransaction();
    const timestampSet = new Set();

    for (let i = 0; i < this.config.numberOfTransactions; i++) {
      await delay(delayTime);

      const currTimestamp = Date.now();
      if (timestampSet.has(currTimestamp) ||
          process._getActiveRequests().length >= REQUEST_THRESHOLD) {
        this.output.statistics.pass++;
        continue;
      }

      const tx = JSON.parse(JSON.stringify(baseTx));
      sendTxPromiseList.push(
          new Promise((resolve, reject) => {
            setTimeout((timestamp) => {
              tx.timestamp = timestamp;
              if (consecutivePath) {
                tx.operation.ref = `${tx.operation.ref}/${i}`;
              }
              if (consecutiveValue) {
                tx.operation.value = i;
              }
              this.#ain.sendTransaction(tx).then(result => {
                if (!result || !result.hasOwnProperty('tx_hash')) {
                  throw Error(`Wrong format`);
                } else if (!result.result) {
                  throw Error('result !== true');
                }
                resolve(result.txHash);
              }).catch(err => {
                resolve(err);
              });
            }, 0, currTimestamp + i);
          }),
      );
    }

    const sendTxResultList = await Promise.all(sendTxPromiseList);
    return sendTxResultList;
  }

  checkSendResultList(sendTxResultList) {
    const txHashList = sendTxResultList.filter(sendTxResult => {
      return !(sendTxResult instanceof Error);
    });

    this.output.statistics.success = txHashList.length;
    this.output.statistics.error = this.config.numberOfTransactions - txHashList.length - this.output.statistics.pass;
    return txHashList;
  }

  async process() {
    await this.initPermission();

    const startBlock = await this.getRecentBlockInformation(['timestamp', 'number']);
    if (!startBlock.number) {
      throw Error(`Genesis block was not created! (current block number: ${startBlock.number})`);
    }

    const sendResultList = await this.sendTxs();
    const txHashList = this.checkSendResultList(sendResultList);
    await delay(BLOCK_TIME * 3);
    const finishBlock = await this.getRecentBlockInformation(['timestamp', 'number']);

    this.output.txHashList = txHashList;
    this.output.startBlockNumber = startBlock.number;
    this.output.finishBlockNumber = finishBlock.number;
    this.output.statistics.blockDuration = finishBlock.timestamp - startBlock.timestamp;
    if (this.config.numberOfTransactions && this.output.statistics.success === 0) {
      throw Error('Success rate 0%');
    }
    return this.output;
  }

}

module.exports = Send;
