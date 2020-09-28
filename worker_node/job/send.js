const Base = require('./base');
const Ain = require('@ainblockchain/ain-js').default;
const delay = (time) => new Promise(resolve => setTimeout(resolve, time));
const axios = require('axios');
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
        duration: 0,
      },
      startBlockNumber: 0,
      finishBlockNumber: 0,
    };

    this.#ain = new Ain(this.config.ainUrl);
    this.#ain.wallet.add(this.config.ainPrivateKey);
    this.#ain.wallet.setDefaultAccount(this.config.ainAddress);
    this.#ain.provider.setDefaultTimeoutMs(60 * 1000);

    // TODO: remove
    this.httpClient = axios.create();
    this.httpClient.defaults.timeout = 60 * 1000;
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
    const response = await this.httpClient.post(this.config.ainUrl + 'json-rpc', {
      method: 'ain_evalRule',
      params: {
        ref: path,
        value: null,
        address: this.config.ainAddress,
        is_global: true,
        protoVer: '0.1.0'
      },
      jsonrpc: '2.0',
      id: 0
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
      timestamp: this.config.timestamp,
    };
  }

  async sendTxs() {
    const delayTime = this.config.duration / this.config.numberOfTransactions * 1000;
    const sendTxPromiseList = [];

    if (!this.config.timestamp) {
      this.config.timestamp = Date.now();
    }

    const baseTimestamp = this.config.timestamp;
    const baseTx = this.makeBaseTransaction();

    for (let i = 0; i < this.config.numberOfTransactions; i++) {
      await delay(delayTime);

      if (process._getActiveRequests().length >= REQUEST_THRESHOLD) {
        this.output.statistics.pass++;
        continue;
      }

      sendTxPromiseList.push(
          new Promise((resolve, reject) => {
            setTimeout((timestamp) => {
              baseTx.timestamp = timestamp;
              this.#ain.sendTransaction(baseTx).then(result => {
                if (!result || !result.hasOwnProperty('txHash')) {
                  throw Error(`Wrong format`);
                } else if (!result.result) {
                  throw Error('result !== true');
                }
                resolve(result.txHash);
              }).catch(err => {
                resolve(err);
              });
            }, 0, baseTimestamp + i);
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
    await delay(BLOCK_TIME);
    const finishBlock = await this.getRecentBlockInformation(['timestamp', 'number']);

    this.output.statistics.duration = finishBlock.timestamp - startBlock.timestamp;
    this.output.txHashList = txHashList;
    this.output.startBlockNumber = startBlock.number;
    this.output.finishBlockNumber = finishBlock.number;
    if (this.config.numberOfTransactions && this.output.statistics.success === 0) {
      throw Error('Success rate 0%');
    }
    return this.output;
  }

}

module.exports = Send;
