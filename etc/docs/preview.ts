import * as express from 'express';

const PORT = 8080;

const app = express();

app.use(express.static('docs'));
app.use('/node-mongodb-native', express.static('docs'));

app.get('*', (req, res) => {
  res.redirect('404.html');
})

app.listen(PORT, () => {
  console.error(`Listening on port ${PORT}`);
});
