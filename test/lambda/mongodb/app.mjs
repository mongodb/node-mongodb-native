import { MongoClient } from 'mongodb';

// Creates the client that is cached for all requests, subscribes to
// relevant events, and forces the connection pool to get populated.
const mongoClient = new MongoClient(process.env.MONGODB_URI, {
  monitorCommands: true
});

mongoClient.on('commandStarted', (event) => {
  console.log('commandStarted', event);
});

mongoClient.on('commandSucceeded', (event) => {
  console.log('commandSucceeded', event);
});

mongoClient.on('commandFailed', (event) => {
  console.log('commandFailed', event);
});

mongoClient.on('serverHeartbeatStarted', (event) => {
  console.log('serverHeartbeatStarted', event);
});

mongoClient.on('serverHeartbeatSucceeded', (event) => {
  console.log('serverHeartbeatSucceeded', event);
});

mongoClient.on('serverHeartbeatFailed', (event) => {
  console.log('serverHeartbeatFailed', event);
});

mongoClient.on('connectionCreated', (event) => {
  console.log('connectionCreated', event);
});

mongoClient.on('connectionClosed', (event) => {
  console.log('connectionClosed', event);
});

// Populate the connection pool.
await mongoClient.connect();

/**
 * The handler function itself performs an insert/delete and returns the
 * id of the document in play.
 *
 * @param {Object} event - API Gateway Lambda Proxy Input Format
 * @returns {Object} object - API Gateway Lambda Proxy Output Format
 */
export const lambdaHandler = async (event) => {
  const db = mongoClient.db('lambdaTest');
  const collection = db.collection('test');
  const { insertedId } = await collection.insertOne({ n: 1 });
  await collection.deleteOne({ _id: insertedId });
  try {
    return {
      statusCode: 200,
      body: JSON.stringify({
        insertedId: insertedId,
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: err.message,
      }),
    };
  }
};
