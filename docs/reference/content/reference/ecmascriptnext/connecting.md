+++
date = "2015-03-19T12:53:30-04:00"
title = "Connecting"
[menu.main]
  parent = "ECMAScript Next"
  identifier = "Connection"
  weight = 60
  pre = "<i class='fa'></i>"
+++

# Connecting

The MongoClient connection method returns a Promise if no callback is passed to it. Below is an example using the `async`/`await` commands.

```js
const MongoClient = require('mongodb').MongoClient;
const assert = require('assert');

(async function() {
  // Connection URL
  const url = 'mongodb://localhost:27017/myproject';
  // Database Name
  const dbName = 'myproject';
  const client = new MongoClient(url);

  try {
    // Use connect method to connect to the Server
    await client.connect();

    const db = client.db(dbName);
  } catch (err) {
    console.log(err.stack);
  }

  client.close();
})();
```

The `client.connect` function returns a `Promise` that we then execute using the `await` keyword inside of an `async` function. If an error happens during the `client.connect` the error is caught by the `try`/`catch` and can be handled as if it were a normal Javascript error.
