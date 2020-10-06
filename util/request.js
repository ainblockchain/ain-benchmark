const axios = require('axios');
const TIMEOUT_MS = 30 * 1000;

async function request(config) {
  try {
    const response = await axios({
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      timeout: TIMEOUT_MS,
      ...config,
    });
    return {
      status: response.status,
      data: response.data,
    };
  } catch (err) {
    if (!!err.response) { // Status isn't 2XX
      throw Error(`status: ${err.response.status}, data: ${JSON.stringify(err.response.data)}`);
    } else { // Timeout || Something wrong
      throw err;
    }
  }
}

module.exports = request;
