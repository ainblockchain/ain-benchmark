require('dotenv').config();
const Ain = require('@ainblockchain/ain-js').default;
const ainUrl = process.env.AIN_ENDPOINT_URL;
const ain = new Ain(ainUrl);
const delay = (time) => new Promise(resolve => setTimeout(resolve, time));
const moment = require('moment');

function signInAin(privateKey, address) {
  ain.wallet.add(privateKey);
  ain.wallet.setDefaultAccount(address);
}

async function initPermission(path, address) {
  const setOwnerTx = {
    operation: {
      type: 'SET_OWNER',
      ref: path,
      value: {
        '.owner': {
          owners: {
            [address]: {
              write_owner: true,
              write_rule: true,
              write_function: true,
              branch_owner: true,
            },
          },
        },
      },
    },
    nonce: -1,
  };

  const setRuleTx = {
    operation: {
      type: 'SET_RULE',
      ref: path,
      value: {
        '.write': `auth === '${address}'`,
      },
    },
    nonce: -1,
  };

  const result = await ain.sendTransactionBatch([
    setOwnerTx,
    setRuleTx,
  ]);

  return result;
}

function makeDummyTransaction(path, address, value) {
  const tx = {
    operation: {
      type: 'SET_VALUE',
      ref: path,
      value: value,
    },
    nonce: -1,
    address: address,
  };
  return tx;
}

function makeDummyTransactionList(path, address, amount) {
  const txList = [];
  for (let i = 1; i <= amount; i++) {
    const tx = makeDummyTransaction(path, address, i);
    txList.push(tx);
  }
  return txList;
}

async function main() {
  const ainAddress = process.env.AIN_ADDRESS;
  const ainPrivateKey = process.env.AIN_PRIVATE_KEY;
  const ainPublicKey = process.env.AIN_PUBLIC_KEY;
  const path = '/apps/test';
  const time = 60;
  const number = 600;

  /* Permission */
  signInAin(ainPrivateKey, ainAddress);
  const initResult = await initPermission(path, ainAddress);
  console.log(initResult);

  await delay(3000);

  /* Make transactions */
  const txList = makeDummyTransactionList(path, ainAddress, number);

  /* Send transactions */
  const startTime = new Date().getTime();
  const promiseList = [];
  const delayTime = time / number * 1000;

  for (const tx of txList) {
    promiseList.push(
        new Promise((resolve, reject) => {
          ain.sendTransaction(tx).then(result => {
            if (!!result && result.hasOwnProperty('txHash')) {
              resolve(result.txHash);
            } else {
              throw new Error(`Result doesn't have txHash field`);
            }
          }).catch(err => {
            resolve(err);
          });
        }),
    );
    await delay(delayTime);
  }

  /* Wait until finished */
  const txHashList = await Promise.all(promiseList);
  console.log(txHashList);

  const execTime = moment(new Date().getTime() - startTime).format('mm:ss');

  await delay(20000);

  /* Check */
  let verifiedCount = 0;
  let unverifiedCount = 0;
  let errorCount = 0;
  const verifyPromiseList = [];

  let tempCount = 0;

  /* Check all */
  for (const txHash of txHashList) {
    if (txHash instanceof Error) {
      errorCount++;
      continue;
    }

    verifyPromiseList.push(new Promise((resolve, reject) => {
      ain.getTransaction(txHash).then((verifyResult) => {
        console.log(`${tempCount++}/${number}`);
        resolve(verifyResult);
      }).catch((err) => {
        resolve(err);
      });
    }));
    await delay(100);
  }

  /* Wait until finished */
  const verifyResultList = await Promise.all(verifyPromiseList);

  /* Get result */
  for (const verifyResult of verifyResultList) {
    if (verifyResult instanceof Error) {
      errorCount++;
    } else if (!!verifyResult &&
        verifyResult.hasOwnProperty('is_confirmed') &&
        verifyResult.is_confirmed === true) {
      console.log(verifyResult);
      verifiedCount++;
    } else {
      unverifiedCount++;
    }
  }

  /* Output */
  console.log(
      `Running time: ${execTime}\n` +
      `Number: ${number}\n` +
      `Error: ${errorCount}\n` +
      `Verified: ${verifiedCount}\n` +
      `Unverified: ${unverifiedCount}`,
  );

}

main();
