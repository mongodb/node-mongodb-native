+++
date = "2015-03-19T12:53:30-04:00"
title = "Connecting"
[menu.main]
  parent = "ECMAScript 6"
  identifier = "Connection"
  weight = 60
  pre = "<i class='fa'></i>"
+++

# Connecting

The MongoClient connection method returns a Promise if no callback is passed to it. Below is an example using the [co](https://www.npmjs.com/package/co) package to run a `generator` function, which is one of the most exciting innovations of ECMAScript 6.

```js
var MongoClient = require('mongodb').MongoClient,
  co = require('co'),
  assert = require('assert');

co(function*() {
  // Connection URL
  var url = 'mongodb://localhost:27017/myproject';
  // Use connect method to connect to the Server
  var db = yield MongoClient.connect(url);
  // Close the connection
  db.close();
}).catch(function(err) {
  console.log(err.stack);
});
```

The `MongoClient.connect` function returns a `Promise` that we then execute using the `yield` keyword of the `generator` function. If an error happens during the `MongoClient.connect` the error is caught by `co` and can be inspected by attaching a function to the `catch` method as shown above.


# async/await

Current Node.js allow usage of async/await syntax, simplifying the above coroutine/generator flow further:

```js
let MongoClient = require('mongodb').MongoClient
let asset = require('asset')

try {
  let db = await MongoClient.connect('mongodb://localhost:27017/myproject')
  db.close()
} catch (error) {
  // Technically, this will just throw a standard exception 
  // if not caught, so this error handler is kind of moot.
  console.log(error.stack)
}
```
