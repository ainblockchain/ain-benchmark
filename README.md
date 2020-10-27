# ain-benchmark

A benchmark framework to measure performance of [AI Network blockchain](https://github.com/ainblockchain/ain-blockchain).

## CLI
- Usage
```
npm install
node ain_benchmark.js sample_config.json // Need to change the configuration
```

- Configuration

### Shard Test
```
{
  "duration": <Sending duration>, // 600 ('600' means 10 minutes)
  "numberOfTransactions": <Number of sending transactions>, // 60000 ('duration: 600, numberOfTransactions: 60000' means testing 100 tps during 10 minutes)
  "targetList": [
    {
      "workerUrl": <Worker URL>, // "http://worker1.com:3001/" (Make sure to set up a worker node.)
      "ainUrl": <AIN URL>, // "http://shard1.ainetwork.ai:8080/"
      "ainAddress": <AIN account address>, 
      "ainPrivateKey": <AIN account private key>, 
      "transactionOperation": {
        "type": <Operation type>, // "SET_VALUE"
        "ref": <Operation reference>, // "/apps/test/1"
        "value": <Value> // 1
      }
    },
    {
      "workerUrl": <Worker2 URL>, // "http://worker2:3001/" (Make sure to set up a worker node.)
      "ainUrl": <AIN2 URL>, // "http://shard2.ainetwork.ai:8080/"
      "ainAddress": <AIN2 account address>, 
      "ainPrivateKey": <AIN2 account private key>, 
      "transactionOperation": {
        "type": <Operation type>, // "SET_VALUE"
        "ref": <Operation reference>, // "/apps/test/2"
        "value": <Value> // 1
      }
    }
  ]
}
```

### Cross Shard Test
```
{
  "testType": "CROSS_SHARD", 
  "duration": <Sending duration>, // 600 ('600' means 10 minutes)
  "numberOfTransactions": <Number of sending transactions>, // 60000 ('duration: 600, numberOfTransactions: 60000' means testing 100 tps during 10 minutes)
  "targetList": [ // Worker & shard list
    {
      "workerUrl": <Worker URL>, // "http://worker1.com:3001/" (Make sure to set up a worker node.)
      "ainUrl": <AIN URL>, // "http://shard1.ainetwork.ai:8080/"
      "ainAddress": <AIN account address>, 
      "ainPrivateKey": <AIN account private key>, 
      "ainShardOwnerAddress": <Shard owner's AIN account address>,
      "shardingPath": <Shard path> // "/apps/shard_1"
    },
    {
      "workerUrl": <Worker2 URL>, // "http://worker2:3001/" (Make sure to set up a worker node.)
      "ainUrl": <AIN2 URL>, // "http://shard2.ainetwork.ai:8080/"
      "ainAddress": <AIN2 account address>, 
      "ainPrivateKey": <AIN2 account private key>, 
      "ainShardOwnerAddress": <Shard owner's AIN2 account address>,
      "shardingPath": <Shard2 path> // "/apps/shard_2"
    }
  ]
}
```


## Worker Node
- Usage
```
npm install
npm run start-worker
```

- Environment variables
Use like `PORT=3001 npm run start-worker`
```
PORT=<Listening port> // Default is 3000
REQUEST_THRESHOLD=<Request threshold> // Default is 100. When the threshold is reached, request is temporarily stopped. It works with 'process._getActiveRequests()'
```
