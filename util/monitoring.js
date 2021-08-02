const _ = require('lodash');
const googleMonitoring = require('@google-cloud/monitoring');
const fs = require('fs');

function getValueFromPoint(point) {
  const valueKey = _.get(point, 'value.value');
  return _.get(point, `value.${valueKey}`, 0);
}

async function requestAndAssembleInfo(client, request) {
  const [timeSeriesList] = await client.listTimeSeries(request);
  if (timeSeriesList.length === 0) {
    return {
      err: `Can't find information`,
    };
  }
  const timeSeries = timeSeriesList[0];
  const points = _.get(timeSeries, 'points', []).sort((a, b) => {
    return a.interval.startTime.seconds - b.interval.startTime.seconds;
  });
  const info = {};
  info.start = getValueFromPoint(points[0]);
  info.end = getValueFromPoint(points[points.length - 1]);
  info.min = getValueFromPoint(_.minBy(points, (p) => {
    return getValueFromPoint(p);
  }));
  info.max = getValueFromPoint(_.maxBy(points, (p) => {
    return getValueFromPoint(p);
  }));
  return info;
}

function makeRequest(client, projectId, filter, startTime, endTime) {
  return {
    name: client.projectPath(projectId),
    filter: filter,
    interval: {
      startTime: {
        seconds: startTime / 1000,
      },
      endTime: {
        seconds: endTime / 1000,
      },
    },
  };
}

async function getCpuUsageInfo(client, projectId, instanceName, startTime, endTime) {
  const filter = `metric.labels.instance_name = "${instanceName}" AND metric.type="compute.googleapis.com/instance/cpu/utilization"`;
  const request = makeRequest(client, projectId, filter, startTime, endTime);
  return requestAndAssembleInfo(client, request);
}

async function getNetworkSentInfo(client, projectId, instanceName, startTime, endTime) {
  const filter = `metric.labels.instance_name = "${instanceName}" AND metric.type="compute.googleapis.com/instance/network/sent_bytes_count"`;
  const request = makeRequest(client, projectId, filter, startTime, endTime);
  request.aggregation = {
    alignmentPeriod: {
      seconds: 60,
    },
    perSeriesAligner: 'ALIGN_RATE',
  };
  return requestAndAssembleInfo(client, request);
}

async function getNetworkReceivedInfo(client, projectId, instanceName, startTime, endTime) {
  const filter = `metric.labels.instance_name = "${instanceName}" AND metric.type="compute.googleapis.com/instance/network/received_bytes_count"`;
  const request = makeRequest(client, projectId, filter, startTime, endTime);
  request.aggregation = {
    alignmentPeriod: {
      seconds: 60,
    },
    perSeriesAligner: 'ALIGN_RATE',
  };
  return requestAndAssembleInfo(client, request);
}

async function getMemoryUsageInfo(client, projectId, instanceName, startTime, endTime) {
  const filter = `metric.type="agent.googleapis.com/memory/percent_used" AND metric.labels.state="used"`
  const request = makeRequest(client, projectId, filter, startTime, endTime);
  request.aggregation = {
    alignmentPeriod: {
      seconds: 60,
    },
    perSeriesAligner: 'ALIGN_MEAN',
  };
  return requestAndAssembleInfo(client, request);
}

async function getMemoryBytesInfo(client, projectId, instanceName, startTime, endTime) {
  const filter = `metric.type="agent.googleapis.com/memory/bytes_used" AND metric.labels.state="used"`
  const request = makeRequest(client, projectId, filter, startTime, endTime);
  request.aggregation = {
    alignmentPeriod: {
      seconds: 60,
    },
    perSeriesAligner: 'ALIGN_MEAN',
  };
  return requestAndAssembleInfo(client, request);
}

async function getMonitoringInfoFromGoogleCloud(projectId, instanceName, keyFilename, startTime, endTime) {
  if (!fs.existsSync(keyFilename)) {
    return {
      err: `Can't find ${keyFilename}`,
    };
  }
  const monitoringClient = new googleMonitoring.MetricServiceClient({keyFilename});
  const info = {};
  info.cpu = {};
  info.cpu.usage = await getCpuUsageInfo(monitoringClient, projectId, instanceName, startTime, endTime);
  info.network = {};
  info.network.incoming = await getNetworkReceivedInfo(monitoringClient, projectId, instanceName, startTime, endTime);
  info.network.outgoing = await getNetworkSentInfo(monitoringClient, projectId, instanceName, startTime, endTime);
  info.memory = {};
  info.memory.usage = await getMemoryUsageInfo(monitoringClient, projectId, instanceName, startTime, endTime);
  info.memory.bytes_used = await getMemoryBytesInfo(monitoringClient, projectId, instanceName, startTime, endTime);
  return info;
}

module.exports = {
  getMonitoringInfoFromGoogleCloud,
};
