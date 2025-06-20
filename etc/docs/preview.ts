import * as express from 'express';

import { log } from './utils';

const app = express();

app.use((req, res, next) => {
  next();

  log(req.method, req.url, res.statusCode);
});

app.use(express.static('docs'));
app.use('/node-mongodb-native', express.static('docs'));

app.get('*path', (req, res) => res.redirect('404.html'));

app.listen(8080, () => {
  log('listening on port 8080');
});
