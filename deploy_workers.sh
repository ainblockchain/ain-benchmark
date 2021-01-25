#!/bin/sh

if [ "$#" -lt 2 ]; then
    echo "Usage: sh deploy_workers.sh dev csh"
    exit
fi

if [ "$1" = 'spring' ] || [ "$1" = 'summer' ] || [ "$1" = 'dev' ] || [ "$1" = 'staging' ]; then
    SEASON="$1"
    if [ "$1" = 'spring' ] || [ "$1" = 'summer' ]; then
        PROJECT_ID="testnet-prod-ground"
    else
        PROJECT_ID="testnet-$1-ground"
    fi
else
    echo "Invalid project/season argument: $1"
    exit
fi

GCP_USER="$2"
FILES_FOR_WORKER_INSTANCE="worker_node/ util/ ain_benchmark.js constants.js package.json start_workers.sh"
AIN_BENCHMARK_DIR="/home/ain-benchmark"

# Kill process & move files & download modules & start workers
INSTANCE_0_TARGET_ADDR="${GCP_USER}@dev-worker-node-0-taiwan"
printf "\nDeploying files to ${INSTANCE_0_TARGET_ADDR}..."
gcloud compute ssh ${INSTANCE_0_TARGET_ADDR} --command "sudo killall node; sudo rm -rf ${AIN_BENCHMARK_DIR};" --project ${PROJECT_ID}
gcloud compute scp --recurse $FILES_FOR_WORKER_INSTANCE ${INSTANCE_0_TARGET_ADDR}:~/ --project ${PROJECT_ID}
gcloud compute ssh ${INSTANCE_0_TARGET_ADDR} --command "sudo mkdir ${AIN_BENCHMARK_DIR} && sudo mv * ${AIN_BENCHMARK_DIR} && sudo chmod -R 777 ${AIN_BENCHMARK_DIR} && cd ${AIN_BENCHMARK_DIR} && npm install && sh start_workers.sh" --project ${PROJECT_ID}

INSTANCE_1_TARGET_ADDR="${GCP_USER}@dev-worker-node-1-oregon"
printf "\nDeploying files to ${INSTANCE_1_TARGET_ADDR}..."
gcloud compute ssh ${INSTANCE_1_TARGET_ADDR} --command "sudo killall node; sudo rm -rf ${AIN_BENCHMARK_DIR};" --project ${PROJECT_ID}
gcloud compute scp --recurse $FILES_FOR_WORKER_INSTANCE ${INSTANCE_1_TARGET_ADDR}:~/ --project ${PROJECT_ID}
gcloud compute ssh ${INSTANCE_1_TARGET_ADDR} --command "sudo mkdir ${AIN_BENCHMARK_DIR} && sudo mv * ${AIN_BENCHMARK_DIR} && sudo chmod -R 777 ${AIN_BENCHMARK_DIR} && cd ${AIN_BENCHMARK_DIR} && npm install && sh start_workers.sh" --project ${PROJECT_ID}

INSTANCE_2_TARGET_ADDR="${GCP_USER}@dev-worker-node-2-singapore"
printf "\nDeploying files to ${INSTANCE_2_TARGET_ADDR}..."
gcloud compute ssh ${INSTANCE_2_TARGET_ADDR} --command "sudo killall node; sudo rm -rf ${AIN_BENCHMARK_DIR};" --project ${PROJECT_ID}
gcloud compute scp --recurse $FILES_FOR_WORKER_INSTANCE ${INSTANCE_2_TARGET_ADDR}:~/ --project ${PROJECT_ID}
gcloud compute ssh ${INSTANCE_2_TARGET_ADDR} --command "sudo mkdir ${AIN_BENCHMARK_DIR} && sudo mv * ${AIN_BENCHMARK_DIR} && sudo chmod -R 777 ${AIN_BENCHMARK_DIR} && cd ${AIN_BENCHMARK_DIR} && npm install && sh start_workers.sh" --project ${PROJECT_ID}

INSTANCE_3_TARGET_ADDR="${GCP_USER}@dev-worker-node-3-iowa"
printf "\nDeploying files to ${INSTANCE_3_TARGET_ADDR}..."
gcloud compute ssh ${INSTANCE_3_TARGET_ADDR} --command "sudo killall node; sudo rm -rf ${AIN_BENCHMARK_DIR};" --project ${PROJECT_ID}
gcloud compute scp --recurse $FILES_FOR_WORKER_INSTANCE ${INSTANCE_3_TARGET_ADDR}:~/ --project ${PROJECT_ID}
gcloud compute ssh ${INSTANCE_3_TARGET_ADDR} --command "sudo mkdir ${AIN_BENCHMARK_DIR} && sudo mv * ${AIN_BENCHMARK_DIR} && sudo chmod -R 777 ${AIN_BENCHMARK_DIR} && cd ${AIN_BENCHMARK_DIR} && npm install && sh start_workers.sh" --project ${PROJECT_ID}

INSTANCE_4_TARGET_ADDR="${GCP_USER}@dev-worker-node-4-netherlands"
printf "\nDeploying files to ${INSTANCE_4_TARGET_ADDR}..."
gcloud compute ssh ${INSTANCE_4_TARGET_ADDR} --command "sudo killall node; sudo rm -rf ${AIN_BENCHMARK_DIR};" --project ${PROJECT_ID}
gcloud compute scp --recurse $FILES_FOR_WORKER_INSTANCE ${INSTANCE_4_TARGET_ADDR}:~/ --project ${PROJECT_ID}
gcloud compute ssh ${INSTANCE_4_TARGET_ADDR} --command "sudo mkdir ${AIN_BENCHMARK_DIR} && sudo mv * ${AIN_BENCHMARK_DIR} && sudo chmod -R 777 ${AIN_BENCHMARK_DIR} && cd ${AIN_BENCHMARK_DIR} && npm install && sh start_workers.sh" --project ${PROJECT_ID}
