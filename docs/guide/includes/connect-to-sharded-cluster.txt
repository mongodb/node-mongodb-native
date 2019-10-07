const { MongoClient } = require('mongodb');

// Connection URL
const url = 'mongodb://localhost:50000,localhost:50001';

// Database Name
const dbName = 'myproject';

// Create a new MongoClient
const client = new MongoClient(url);

// Use connect method to connect to the Server
client.connect().then(async function() {
  console.log("Connected successfully to server");

  const db = client.db(dbName);

  await client.close();
});
