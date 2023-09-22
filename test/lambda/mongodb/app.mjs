import { globalEmitter, MongoClient } from 'mongodb';

const initStart = Date.now();

// Creates the client that is cached for all requests, subscribes to
// relevant events, and forces the connection pool to get populated.
const mongoClient = new MongoClient(process.env.MONGODB_URI, {
  monitorCommands: true
});

const metrics = {
  mechanism: process.env.MECHANISM,
  srvLookup: 0,
  txtLookup: 0,
  connectionEstablishment: 0,
  initialHandshake: 0,
  saslStartClient: 0,
  saslStart: 0,
  saslContinueClient: 0,
  saslContinue: 0,
  initDuration: 0,
  duration: 0
};

globalEmitter.on('srvLookup', time => {
  metrics.srvLookup = time;
});

globalEmitter.on('txtLookup', time => {
  metrics.txtLookup = time;
});

globalEmitter.on('connectionEstablishment', time => {
  metrics.connectionEstablishment = time;
});

globalEmitter.on('initialHandshake', time => {
  metrics.initialHandshake = time;
});

globalEmitter.on('saslStartClient', time => {
  metrics.saslStartClient = time;
});

globalEmitter.on('saslStart', time => {
  metrics.saslStart = time;
});

globalEmitter.on('saslContinueClient', time => {
  metrics.saslContinueClient = time;
});

globalEmitter.on('saslContinue', time => {
  metrics.saslContinue = time;
});

// Populate the connection pool.
await mongoClient.connect();
const db = mongoClient.db('test');
const collection = db.collection('lambdaMetrics');

metrics.initDuration = Date.now() - initStart;

/**
 * The handler function itself performs an insert/delete and returns the
 * id of the document in play.
 *
 * @param {Object} event - API Gateway Lambda Proxy Input Format
 * @returns {Object} object - API Gateway Lambda Proxy Output Format
 */
export const lambdaHandler = async () => {
  const funcStart = Date.now();
  await collection.find().toArray();
  metrics.duration = Date.now() - funcStart;
  globalEmitter.removeAllListeners();

  const metricsClient = new MongoClient(process.env.LAMBDA_METRICS_URI);
  await metricsClient.db('metrics').collection('metrics').insertOne(metrics);
  await metricsClient.close();
  // Create the response and then reset the numbers.
  return {
    statusCode: 200,
    body: JSON.stringify(metrics)
  };
};
