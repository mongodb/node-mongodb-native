import * as assert from 'node:assert/strict';
import * as process from 'node:process';

import { MongoClient } from 'mongodb';

// Creates the client that is cached for all requests, subscribes to
// relevant events, and forces the connection pool to get populated.
const mongoClient = new MongoClient(process.env.MONGODB_URI, {
  monitorCommands: true
});

let openConnections = 0;
let heartbeatCount = 0;
let totalHeartbeatDuration = 0;
let totalCommands = 0;
let totalCommandDuration = 0;

mongoClient.on('commandStarted', event => {
  console.log('commandStarted', event);
});

mongoClient.on('commandSucceeded', event => {
  totalCommands++;
  totalCommandDuration += event.duration;
  console.log('commandSucceeded', event);
});

mongoClient.on('commandFailed', event => {
  totalCommands++;
  totalCommandDuration += event.duration;
  console.log('commandFailed', event);
});

mongoClient.on('serverHeartbeatStarted', event => {
  console.log('serverHeartbeatStarted', event);
  assert.strictEqual(event.awaited, false);
});

mongoClient.on('serverHeartbeatSucceeded', event => {
  heartbeatCount++;
  totalHeartbeatDuration += event.duration;
  console.log('serverHeartbeatSucceeded', event);
  assert.strictEqual(event.awaited, false);
});

mongoClient.on('serverHeartbeatFailed', event => {
  heartbeatCount++;
  totalHeartbeatDuration += event.duration;
  console.log('serverHeartbeatFailed', event);
  assert.strictEqual(event.awaited, false);
});

mongoClient.on('connectionCreated', event => {
  openConnections++;
  console.log('connectionCreated', event);
});

mongoClient.on('connectionClosed', event => {
  openConnections--;
  console.log('connectionClosed', event);
});

// Populate the connection pool.
await mongoClient.connect();

// Create the response to send back.
function createResponse() {
  return {
    averageCommandDuration: totalCommandDuration / totalCommands,
    averageHeartbeatDuration: totalHeartbeatDuration / heartbeatCount,
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
 * @param {Object} event - API Gateway Lambda Proxy Input Format
 * @returns {Object} object - API Gateway Lambda Proxy Output Format
 */
export const lambdaHandler = async event => {
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
