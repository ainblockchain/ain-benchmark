killall node
REQUEST_THRESHOLD=150 PORT=4001 node worker_node/index.js > worker1.out 2>&1 &
REQUEST_THRESHOLD=150 PORT=4002 node worker_node/index.js > worker2.out 2>&1 &
REQUEST_THRESHOLD=150 PORT=4003 node worker_node/index.js > worker3.out 2>&1 &
REQUEST_THRESHOLD=150 PORT=4004 node worker_node/index.js > worker4.out 2>&1 &
