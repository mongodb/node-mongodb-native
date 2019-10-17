const { MongoClient } = require('mongodb');

// Connection URL
const url = 'mongodb://localhost:27017';

// Create a new MongoClient
const client = new MongoClient(url);

async function main() {
  // Place your code in this function
}

// Function to connect to the server and run your code
async function run() {
  try {
    // Connect the client to the server
    await client.connect();
    console.log('Connected successfully to server');

    await main(client);
  } finally {
    // Ensures that the client will close when you finish/error
    await client.close();
  }
}

// Runs your code
run();
