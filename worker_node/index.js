const express = require('express');
const logger = require('morgan');
const app = express();
const port = process.env.PORT || 3000;
const worker = require('./worker');

app.use(express.json());
app.use(logger('tiny'));

app.post('/job', (req, res) => {
  const jobInput = req.body;

  try {
    const id = worker.startJob(jobInput);
    res.json({
      id,
    });
  } catch (err) {
    const code = !!err.code ? err.code : 400;
    res.status(code).json({
      message: err.message,
    });
  }
});

app.get('/job/:id', (req, res) => {
  const id = req.params.id;

  try {
    const job = worker.getJob(id);
    res.json({
      ...job,
    });
  } catch (err) {
    const code = !!err.code ? err.code : 400;
    res.status(code).json({
      message: err.message,
    });
  }
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send(err.message);
});

app.listen(port, () => {
  console.log(`Worker node listening at ${port}`);
});
