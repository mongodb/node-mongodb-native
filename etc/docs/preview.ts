import * as express from 'express';

const app = express();

app.use((req, res, next) => {
  next();

  console.log(req.method, req.url, res.statusCode);
})

app.use(express.static('docs'));
app.use('/node-mongodb-native', express.static('docs'));

app.listen(8080, () => {
  console.log('listening on port 8080')
})
