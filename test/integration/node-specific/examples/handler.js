// begin lambda connection
const { MongoClient } = require('mongodb');
const process = require('node:process');

// MongoClient now auto-connects so no need to store the connect()
// promise anywhere and reference it.
const client = new MongoClient(process.env.MONGODB_URI);

module.exports.handler = async function () {
  const databases = await client.db('admin').command({ listDatabases: 1 });
  return {
    statusCode: 200,
    databases: databases
  };
};
// end lambda connection

module.exports.client = client;
