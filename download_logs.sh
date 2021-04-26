#!/bin/sh
# Download testnet logs from GCP

if [ "$#" -lt 2 ]; then
  echo "Usage: sh download_testnet_logs.sh dev csh"
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
AIN_PATH="/home/ain-blockchain"
NODE_LOG_PATH="/logs/8080"
NODE_ERROR_LOG_FILE="error_logs.txt"
tracker_instance="${SEASON}-tracker-taiwan"
node_instance_list=(
  "${SEASON}-node-0-taiwan"
  "${SEASON}-node-1-oregon"
  "${SEASON}-node-2-singapore"
  "${SEASON}-node-3-iowa"
  "${SEASON}-node-4-netherlands")
timestamp=$(date +%Y-%m-%d_%H-%M-%S)

for instance in ${tracker_instance} ${node_instance_list[@]}; do
  target="${GCP_USER}@${instance}"
  src="${target}:${AIN_PATH}${NODE_LOG_PATH}/* ${target}:${AIN_PATH}/${NODE_ERROR_LOG_FILE}"
  dst="./${timestamp}/${instance}"
  mkdir -p ${dst}
  gcloud compute scp --recurse ${src} ${dst} --project ${PROJECT_ID}
done
