const _ = require('lodash');
const googleMonitoring = require('@google-cloud/monitoring');
const fs = require('fs');

function getValueFromPoint(point) {
  const valueKey = _.get(point, 'value.value');
  return _.get(point, `value.${valueKey}`);
}

async function getCpuUsageInfo(client, projectId, instanceName, startTime, endTime) {
  const cpuUsageFilter = `metric.labels.instance_name = "${instanceName}" AND metric.type="compute.googleapis.com/instance/cpu/utilization"`;
  const cpuUsageRequest = {
    name: client.projectPath(projectId),
    filter: cpuUsageFilter,
    interval: {
      startTime: {
        seconds: startTime / 1000,
      },
      endTime: {
        seconds: endTime / 1000,
      },
    },
  };

  const [timeSeriesList] = await client.listTimeSeries(cpuUsageRequest);
  if (timeSeriesList.length === 0) {
    return {
      err: `Can't find ${instanceName}`,
    };
  }
  const timeSeries = timeSeriesList[0];
  const points = _.get(timeSeries, 'points');
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

async function getMonitoringInfo(projectId, instanceName, keyFilename, startTime, endTime) {
  if (!fs.existsSync(keyFilename)) {
    return {
      err: `Can't find ${keyFilename}`,
    };
  }
  const monitoringClient = new googleMonitoring.MetricServiceClient({keyFilename});
  const info = {};
  info.cpuUsage = await getCpuUsageInfo(monitoringClient, projectId, instanceName, startTime, endTime);
  return info;
}

module.exports = {
  getMonitoringInfo,
};
