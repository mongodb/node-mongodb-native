import version from '@aws-sdk/credential-providers/package.json' assert { type: 'json' };
import { MongoClient } from 'mongodb';

// Creates the client that is cached for all requests, subscribes to
// relevant events, and forces the connection pool to get populated.
const mongoClient = new MongoClient(process.env.MONGODB_URI, {
  monitorCommands: true
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
export const lambdaHandler = async () => {
  console.log('SDK VERSION', version.version);
  console.log('AWS_REGION', process.env.AWS_REGION);
  const db = mongoClient.db('lambdaTest');
  const collection = db.collection('test');
  const { insertedId } = await collection.insertOne({ n: 1 });
  await collection.deleteOne({ _id: insertedId });

  return {
    statusCode: 200,
    body: ''
  };
};
