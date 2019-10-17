const { MongoClient } = require('mongodb');

// Connection URL
const url = 'mongodb://localhost:27017';

// Create a new MongoClient
const client = new MongoClient(url);

// Function to connect to the server and run your code
async function run() {
  try {
    // Connect the client to the server
    await client.connect();
    console.log('Connected successfully to server');
  } finally {
    // Ensures that the client will close when you finish/error
    await client.close();
  }
}

// Runs your code
run();
