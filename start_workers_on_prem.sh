MAX_OLD_SPACE_SIZE_MB=2048
REQUEST_THRESHOLD=150

PORT=11000 nohup node --max-old-space-size=$MAX_OLD_SPACE_SIZE_MB worker_node/index.js>worker1.out 2>&1 &
PORT=11001 nohup node --max-old-space-size=$MAX_OLD_SPACE_SIZE_MB worker_node/index.js>worker2.out 2>&1 &
PORT=11002 nohup node --max-old-space-size=$MAX_OLD_SPACE_SIZE_MB worker_node/index.js>worker3.out 2>&1 &
PORT=11003 nohup node --max-old-space-size=$MAX_OLD_SPACE_SIZE_MB worker_node/index.js>worker4.out 2>&1 &
PORT=11004 nohup node --max-old-space-size=$MAX_OLD_SPACE_SIZE_MB worker_node/index.js>worker5.out 2>&1 &
PORT=11005 nohup node --max-old-space-size=$MAX_OLD_SPACE_SIZE_MB worker_node/index.js>worker6.out 2>&1 &
PORT=11006 nohup node --max-old-space-size=$MAX_OLD_SPACE_SIZE_MB worker_node/index.js>worker7.out 2>&1 &
PORT=11007 nohup node --max-old-space-size=$MAX_OLD_SPACE_SIZE_MB worker_node/index.js>worker8.out 2>&1 &
PORT=11008 nohup node --max-old-space-size=$MAX_OLD_SPACE_SIZE_MB worker_node/index.js>worker9.out 2>&1 &
PORT=11009 nohup node --max-old-space-size=$MAX_OLD_SPACE_SIZE_MB worker_node/index.js>worker10.out 2>&1 &
