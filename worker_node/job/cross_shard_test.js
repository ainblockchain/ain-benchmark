const Base = require('./base');
const Ain = require('@ainblockchain/ain-js').default;
const request = require('../../util/request');
const ainUtil = require('@ainblockchain/ain-util');
const _ = require('lodash');
const delay = (time) => new Promise(resolve => setTimeout(resolve, time));
const CURRENT_PROTOCOL_VERSION = '0.1.0';
const RETRY_THRESHOLD = 3;

class CrossShardTest extends Base {
  static configProps = [
    'duration',
    'numberOfTransactions',
    'ainUrl',
    'ainAddress',
    'ainPrivateKey',
    'ainShardOwnerAddress',
    'wait', // For incremental test
    'shardingPath',
    'startRound',
  ];
  #ain;

  constructor(config) {
    super(config, CrossShardTest.configProps);
    this.output = {
      statistics: {
        sendError: 0,
        checkinError: 0,
        checkinSuccess: 0,
      },
    };

    this.#ain = new Ain(this.config.ainUrl);
    this.#ain.wallet.add(this.config.ainPrivateKey);
    this.#ain.wallet.setDefaultAccount(this.config.ainAddress);
    this.#ain.provider.setDefaultTimeoutMs(60 * 1000);
  }

  signTx(tx, privateKey) {
    const keyBuffer = Buffer.from(privateKey, 'hex');
    const sig = ainUtil.ecSignTransaction(tx, keyBuffer);
    const sigBuffer = ainUtil.toBuffer(sig);
    const lenHash = sigBuffer.length - 65;
    const hashedData = sigBuffer.slice(0, lenHash);
    const txHash = '0x' + hashedData.toString('hex');
    return {
      txHash,
      signedTx: {
        protoVer: CURRENT_PROTOCOL_VERSION,
        transaction: tx,
        signature: sig,
      },
    };
  }

  checkForTransactionErrorCode(response) {
    return !response || (response.code !== undefined && response.code !== 0);
  }

  sendSignedTx(endpointUrl, signedTx) {
    return request({
      method: 'post',
      baseURL: endpointUrl,
      url: '/json-rpc',
      data: {
        method: 'ain_sendSignedTransaction',
        params: signedTx,
        jsonrpc: '2.0',
        id: 0,
      },
    }).then(resp => {
      const success = !this.checkForTransactionErrorCode(_.get(resp, 'data.result', false));
      if (!success) {
        throw Error(`Send transaction error ${JSON.stringify(resp, null, 2)}`);
      }
      return signedTx.transaction;
    });
  }

  sendGetTxByHash(endpointUrl, txHash) {
    return request({
      method: 'post',
      baseURL: endpointUrl,
      url: '/json-rpc',
      data: {
        method: 'ain_getTransactionByHash',
        params: {
          protoVer: CURRENT_PROTOCOL_VERSION,
          hash: txHash,
        },
        jsonrpc: '2.0',
        id: 0,
      },
    }).then(function(resp) {
      return _.get(resp, 'data.result.result', null);
    }).catch(err => {
      this.output.statistics.getTxError++;
      return null;
    });
  }

  buildPayloadTx(fromAddr, toAddr, tokenAmount, timestamp) {
    return {
      operation: {
        type: 'SET_VALUE',
        ref: `/transfer/${fromAddr}/${toAddr}/${timestamp}/value`,
        value: tokenAmount,
        is_global: true,
      },
      timestamp,
      nonce: -1,
    };
  }

  buildCheckinTx(address, payload, timestamp) {
    return {
      operation: {
        type: 'SET_VALUE',
        ref: `${this.config.shardingPath}/checkin/${address}/${timestamp}/request`,
        value: {
          payload,
        },
        is_global: true,
      },
      timestamp,
      nonce: -1,
    };
  }

  async sendCheckinTx(timestamp) {
    const privateKeyBuffer = Buffer.from(this.config.ainPrivateKey, 'hex');
    const payloadTx = this.buildPayloadTx(
        this.config.ainAddress,
        this.config.ainShardOwnerAddress,
        1,
        timestamp);
    const signedPayloadTx = this.signTx(payloadTx, privateKeyBuffer);
    const checkinTx = this.buildCheckinTx(
        this.config.ainAddress,
        signedPayloadTx.signedTx,
        timestamp);
    const signedCheckinTx = this.signTx(checkinTx, privateKeyBuffer);
    const sentTx = await this.sendSignedTx(this.config.ainUrl, signedCheckinTx.signedTx);
    const finalized = await this.waitTxFinalization(this.config.ainUrl, signedCheckinTx.txHash);
    if (!finalized) {
      throw Error(`Checkin Tx ${JSON.stringify(sentTx)} was not finalized`);
    }
    return sentTx;
  }

  async waitTxFinalization(endpointUrl, txHash) {
    let iteration = 0;
    while (iteration <= 10) {
      await delay(5 * 1000);
      iteration++;
      const result = await this.sendGetTxByHash(endpointUrl, txHash);

      if (_.get(result, 'is_finalized')) {
        return true;
      }
    }
    return false;
  }

  async sendTxs() {
    const delayTime = this.config.duration / this.config.numberOfTransactions * 1000;
    const sendTxPromiseList = [];

    for (let i = 0; i < this.config.numberOfTransactions; i++) {
      await delay(delayTime);
      sendTxPromiseList.push(
          new Promise((resolve, reject) => {
            setTimeout(() => {
              const timestamp = Date.now();
              const sendResult = this.sendCheckinTx(timestamp)
              .then(resolve)
              .catch(resolve);
            }, 0);
          }));
    }
    const checkinTxList = await Promise.all(sendTxPromiseList).then(this.checkResultList);
    return checkinTxList;
  }

  checkResultList(resultList) {
    const successResultList = resultList.filter(result => {
      const isError = result instanceof Error;
      if (isError) {
        this.output.statistics.sendError++;
      }
      return !isError;
    });
    return successResultList;
  }

  async matchCheckinAndTransfer(checkinTxList, transferTxList) {
    const tupleList = [];

    for (const checkinTx of checkinTxList) {
      const matchedTransferTx = transferTxList.find(transferTx => checkinTx.timestamp === transferTx.checkinId);
      if (matchedTransferTx === undefined) {
        this.output.statistics.checkinError++;
        continue;
      }

      // Get finalized_at
      const finalizedAt = (await this.sendGetTxByHash(this.config.ainUrl, matchedTransferTx.hash)).finalized_at;
      if (!finalizedAt) {
        continue;
      }

      // Make tuple and add
      tupleList.push({
        checkinTx: checkinTx,
        transferTx: matchedTransferTx,
        sentAt: checkinTx.timestamp,
        finalizedAt: finalizedAt,
        durationOfFinalization: finalizedAt - checkinTx.timestamp,
      });
    }
    return tupleList;
  }

  async requestTxList(from, to) {
    const txList = [];
    for (let number = from; number <= to; number++) {
      const block = await this.#ain.getBlock(number, true);
      txList.push(...block.transactions.reduce((acc, tx) => {
        acc.push({
          hash: tx.hash,
          nonce: tx.nonce,
          timestamp: tx.timestamp,
          operation: tx.operation,
        });
        return acc;
      }, []));
    }
    return txList;
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
        await delay(2 * 3000);
      }
    }
  }

  async process() {
    console.log(`config: ${JSON.stringify(this.config, null, 2)}`);
    // await delay(1000 - (this.))
    const roundWaitTime = (this.config.duration / this.config.numberOfTransactions * 1000) /
        (21 - this.config.startRound);
    await delay(roundWaitTime);
    await delay(this.config.wait * 1000);
    const startBlock = await this.getRecentBlockInformation(['number']);
    const checkinTxList = await this.sendTxs();
    await delay(30 * 1000);
    const finishBlock = await this.getRecentBlockInformation(['number']);
    const txList = await this.requestTxList(startBlock.number, finishBlock.number);
    console.log(JSON.stringify(txList, null, 2));

    const transferWithCheckinTxList = txList.filter(tx => {
      const ref = _.get(tx, 'operation.ref', ' ');
      const pathList = ref.split('/');
      if (pathList.length !== 8 || pathList[3] !== 'transfer' || !pathList[6].includes('checkin')) {
        return false;
      }
      tx.checkinId = Number(pathList[6].substring(8));
      return true;
    });

    const matchedList = await this.matchCheckinAndTransfer(checkinTxList, transferWithCheckinTxList);

    this.output.matchedList = matchedList;
    this.output.statistics.checkinSuccess = matchedList.length;
    console.log(this.output.statistics);
    return this.output;
  }
}

module.exports = CrossShardTest;
