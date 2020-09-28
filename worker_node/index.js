const express = require('express');
const logger = require('morgan');
const app = express();
const port = process.env.PORT || 3000;
const worker = require('./worker');

app.use(express.json({ limit: '4gb', extended: true }));
app.use(logger('tiny'));

app.post('/job', (req, res, next) => {
  const jobInput = req.body;

  try {
    const id = worker.startJob(jobInput);
    res.json({
      id,
    });
  } catch (err) {
    next(err);
  }
});

app.get('/job/:id', (req, res, next) => {
  const id = req.params.id;

  try {
    const job = worker.getJob(id);
    res.json({
      ...job,
    });
  } catch (err) {
    next(err);
  }
});

app.delete('/job/:id', (req, res, next) => {
  const id = req.params.id;

  try {
    worker.deleteJob(id);
    res.json({
      id,
    });
  } catch (err) {
    next(err);
  }
});

app.get('/status', (req, res, next) => {
  try {
    const heapUsedMiB = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
    const heapTotalMiB = Math.round(process.memoryUsage().heapTotal / 1024 / 1024);
    res.json({
      memory: {
        heapUsedMiB,
        heapTotalMiB,
      }
    });
  } catch (err) {
    next(err);
  }
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.code || 500).send(err.message);
});

app.listen(port, () => {
  console.log(`Worker node listening at ${port}`);
});
