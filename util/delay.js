function delay(timeMs) {
  return new Promise(resolve => {
    setTimeout(resolve, timeMs);
  });
}

module.exports = delay;
