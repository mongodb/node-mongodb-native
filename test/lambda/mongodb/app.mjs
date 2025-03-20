/* eslint-disable no-console */
import util from 'node:util';

import { MongoClient } from 'mongodb';

// Creates the client that is cached for all requests, subscribes to
// relevant events, and forces the connection pool to get populated.
const mongoClient = new MongoClient(process.env.MONGODB_URI, {
  monitorCommands: true,
  mongodbLogComponentSeverities: {
    command: 'trace',
    topology: 'trace',
    connection: 'trace',
    default: 'trace'
  },
  mongodbLogMaxDocumentLength: 10_000,
  mongodbLogPath: {
    write(log) {
      console.log(
        util.inspect(log, { colors: false, breakLength: Infinity, compact: true, depth: Infinity })
      );
    }
  }
});

let openConnections = 0;
let heartbeatCount = 0;
let totalHeartbeatDuration = 0;
let totalCommands = 0;
let totalCommandDuration = 0;

mongoClient.on('commandSucceeded', event => {
  totalCommands++;
  totalCommandDuration += event.duration;
});

mongoClient.on('commandFailed', event => {
  totalCommands++;
  totalCommandDuration += event.duration;
});

mongoClient.on('serverHeartbeatStarted', event => {
  if (event.awaited !== false) console.log('server hb started', { awaited: event.awaited });
});

mongoClient.on('serverHeartbeatSucceeded', event => {
  heartbeatCount++;
  totalHeartbeatDuration += event.duration;
  if (event.awaited !== false) console.log('server hb succeeded', { awaited: event.awaited });
});

mongoClient.on('serverHeartbeatFailed', event => {
  heartbeatCount++;
  totalHeartbeatDuration += event.duration;
  if (event.awaited !== false) console.log('server hb failed', { awaited: event.awaited });
});

mongoClient.on('connectionCreated', () => {
  openConnections++;
});

mongoClient.on('connectionClosed', () => {
  openConnections--;
});

// Populate the connection pool.
await mongoClient.connect();

// Create the response to send back.
function createResponse() {
  return {
    averageCommandDuration: totalCommands === 0 ? 0 : totalCommandDuration / totalCommands,
    averageHeartbeatDuration: heartbeatCount === 0 ? 0 : totalHeartbeatDuration / heartbeatCount,
    openConnections: openConnections,
    heartbeatCount: heartbeatCount
  };
}

// Reset the numbers.
function reset() {
  openConnections = 0;
  heartbeatCount = 0;
  totalHeartbeatDuration = 0;
  totalCommands = 0;
  totalCommandDuration = 0;
}

/**
 * The handler function itself performs an insert/delete and returns the
 * id of the document in play.
 *
 * @param event - API Gateway Lambda Proxy Input Format
 * @returns API Gateway Lambda Proxy Output Format
 */
export const lambdaHandler = async () => {
  const db = mongoClient.db('lambdaTest');
  const collection = db.collection('test');
  const { insertedId } = await collection.insertOne({ n: 1 });
  await collection.deleteOne({ _id: insertedId });
  // Create the response and then reset the numbers.
  const response = JSON.stringify(createResponse());
  reset();

  return {
    statusCode: 200,
    body: response
  };
};
