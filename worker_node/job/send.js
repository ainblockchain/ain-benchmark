const _ = require('lodash');
const Base = require('./base');
const Ain = require('@ainblockchain/ain-js').default;
const { BLOCKCHAIN_PROTOCOL_VERSION } = require('@ainblockchain/ain-js/lib/constants');
const delay = (time) => new Promise(resolve => setTimeout(resolve, time));
const request = require('../../util/request');
const CommonUtil = require('../../util/common');
const BLOCK_TIME = process.env.BLOCK_TIME || 20000;
const REQUEST_THRESHOLD = process.env.REQUEST_THRESHOLD || 400; // When the threshold is reached, request is temporarily stopped
const RETRY_THRESHOLD = 3;
const MAX_NUM_OF_HEALTH_CHECKS = 10;
const SEND_TX_TIMEOUT = process.env.SEND_TX_TIMEOUT || 60000;

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
    this.#ain.provider.setDefaultTimeoutMs(SEND_TX_TIMEOUT);

  }

  async getLastBlockInformation(keyList) {
    let retryCount = 0;
    while (true) {
      try {
        const information = await this.#ain.provider.send('ain_getLastBlock');
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

  async checkHealth() {
    for (let i = 0; i < MAX_NUM_OF_HEALTH_CHECKS; i++) {
      const res = await request({
        method: 'get',
        baseURL: this.config.ainUrl,
        url: '/health_check',
      });

      if (CommonUtil.isBool(res.data)) {
        return;
      }
      await delay(BLOCK_TIME);
    }
    throw Error(`Failed to health check (${MAX_NUM_OF_HEALTH_CHECKS})`);
  }

  async initPermission() {
    const appName = (this.config.transactionOperation.ref).split('/')[2];
    if (!appName) {
      throw Error(`Can't find appName from transactionOperation.ref ` +
          `(${this.config.transactionOperation.ref})`);
    }
    const stakingAppPath = `/staking/${appName}`;
    const stakingBalance = await this.#ain.db.ref(`${stakingAppPath}/balance_total`).getValue();
    if (stakingBalance === null) {
      const stakingPath = `${stakingAppPath}/${this.config.ainAddress}/0/stake/${Date.now()}/value`;
      const stakingTx = {
        operation: {
          type: 'SET_VALUE',
          ref: stakingPath,
          value: 1,
        },
        nonce: -1,
        gas_price: this.config.gasPrice || 0,
      };
      const stakingTxResult = await this.#ain.sendTransaction(stakingTx);
      if (_.get(stakingTxResult, 'result.code') !== 0) {
        throw Error(`Error while write staking tx (${JSON.stringify(stakingTxResult)})`);
      }
    }

    const manageAppConfigPath = `/manage_app/${appName}/config`;
    const manageAppConfigValue = await this.#ain.db.ref(manageAppConfigPath).getValue();
    if (manageAppConfigValue === null) {
      const manageAppCreateTx = {
        operation: {
          type: 'SET_VALUE',
          ref: `/manage_app/${appName}/create/${Date.now()}`,
          value: {
            admin: { [this.config.ainAddress]: true },
            service: {
              staking: { lockup_duration: 2592000000 },
            },
          },
        },
        nonce: -1,
        gas_price: this.config.gasPrice || 0,
      };
      const manageAppTxResult = await this.#ain.sendTransaction(manageAppCreateTx);
      if (_.get(manageAppTxResult, 'result.code') !== 0) {
        throw Error(`Error while write manage app config (${JSON.stringify(manageAppTxResult)})`);
      }
    }
    await delay(5 * BLOCK_TIME);

    const path = this.config.transactionOperation.ref;
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
      gas_price: this.config.gasPrice || 0,
    };
  }

  async sendTxs() {
    const sendTxPromiseList = [];
    const randomAddressPath = this.config.randomAddressPath === true;
    const consecutivePath = this.config.consecutivePath === true;
    const consecutiveValue = this.config.consecutiveValue === true;
    const randomSuffixValue = this.config.randomSuffixValue === true;
    const pathSuffix = this.config.pathSuffix || null;
    if (!this.config.timestamp) {
      this.config.timestamp = Date.now();
    }

    const startTimestamp = Date.now();
    const baseTx = this.makeBaseTransaction();
    const timestampSet = new Set();
    const targetTestEndTime = Date.now() + (this.config.duration * 1000) - (BLOCK_TIME); // MS

    for (let i = 0; i < this.config.numberOfTransactions; i++) {
      const delayTime = (targetTestEndTime - Date.now()) / (this.config.numberOfTransactions - i);
      if (delayTime > 0) {
        await delay(delayTime);
      }

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
              if (randomAddressPath) {
                tx.operation.ref = `${tx.operation.ref}/${Ain.utils.createAccount().address}`;
              }
              if (consecutivePath) {
                tx.operation.ref = `${tx.operation.ref}/${i}`;
              }
              if (pathSuffix) {
                tx.operation.ref = `${tx.operation.ref}/${pathSuffix}`;
              }
              if (consecutiveValue) {
                tx.operation.value = i;
              } else if (randomSuffixValue) {
                tx.operation.value = `${tx.operation.value}:${startTimestamp + i}`;
              }
              this.#ain.sendTransaction(tx).then(result => {
                if (!result || !result.hasOwnProperty('tx_hash')) {
                  throw Error(`Wrong format (${JSON.stringify(result)}`);
                }
                const code = _.get(result, 'result.code', -1);
                if (code !== 0) {
                  throw Error(`Result code !== 0 (result: ${JSON.stringify(result)})`);
                }
                this.output.statistics.success++;
                resolve(result.tx_hash);
              }).catch(err => {
                this.output.statistics.error++;
                console.log(err);
                resolve(err);
              });
            }, 0, currTimestamp + i);
          }),
      );
    }

    const sendResultList = await Promise.all(sendTxPromiseList);
    return sendResultList.filter(result => {
      return typeof result === 'string'; // NOTE(cshcomcom): Return only transaction hashes
    });
  }

  async getBlockByTxHash(txHash) {
    const txInfo = await this.#ain.getTransaction(txHash);
    if (!txInfo) {
      throw Error(`Can't get txInfo from txHash (txHash: ${txHash})`);
    }
    if (!txInfo.number) {
      throw Error(`Can't find number from txInfo (txInfo: ${JSON.stringify(txInfo)})`);
    }
    const block = await this.#ain.getBlock(txInfo.number);
    if (!block) {
      throw Error(`Can't get block from number (number: ${txInfo.number})`);
    }
    if (!block.hash) {
      throw Error(`Error while getBlockByTxHash (txHash: ${txHash}, ` +
          `txInfo: ${JSON.stringify(txInfo)}, block: ${JSON.stringify(block)})`);
    }
    return block;
  }

  async process() {
    await this.checkHealth();
    if (this.config.transactionOperation.ref.includes('apps')) {
      await this.initPermission();
    }

    const sendStartTime = Date.now();
    const sendTxHashList = await this.sendTxs();
    const sendFinishTime = Date.now();
    await delay(BLOCK_TIME * 10);

    const firstTxHash = sendTxHashList[0];
    const lastTxHash = sendTxHashList[sendTxHashList.length - 1];
    console.log(`statistics: ${JSON.stringify(this.output.statistics, null, 2)})`);
    console.log(`firstTxHash: ${firstTxHash}, lastTxHash: ${lastTxHash}`);

    const startBlock = await this.getBlockByTxHash(firstTxHash);
    const finishBlock = await this.getBlockByTxHash(lastTxHash);

    this.output.sendStartTime = sendStartTime;
    this.output.sendFinishTime = sendFinishTime;
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
