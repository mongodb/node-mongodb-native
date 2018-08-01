+++
date = "2015-03-18T21:14:20-04:00"
title = "Logging"
[menu.main]
  parent = "Management"
  identifier = "Logging"
  weight = 10
  pre = "<i class='fa'></i>"
+++

# Logging

You can change the log level, filter on classes to allow only specific classes
to log, and provide your own logger implementation.

## Setting Log level
The driver allows logging at three different levels: `debug`,
`info` and `error`. The default level is `error`.
The following example demonstrates how to set the logger to `debug`.

```js
const MongoClient = require('mongodb').MongoClient;
const Logger = require('mongodb').Logger;
const assert = require('assert');

// Connection URL
const url = 'mongodb://localhost:27017';
// Database Name
const dbName = 'myprojeect';

const client = new MongoClient(url);
// Use connect method to connect to the server
client.connect(function(err) {
  assert.equal(null, err);
  console.log("Connected correctly to server");

  // Set debug level
  Logger.setLevel('debug');

  const db = client.db(dbName);

  // Execute command {ismaster:true} against db
  db.command({ismaster:true}, function(err, d) {
    assert.equal(null, err);
    client.close();
  });
});
```

## Filtering On specific classes

You can set the Logger to only log specific class names. The following example
demonstrates how to log only the `Db` class.

```js
const MongoClient = require('mongodb').MongoClient;
const Logger = require('mongodb').Logger;
const assert = require('assert');

// Connection URL
const url = 'mongodb://localhost:27017';
// Database Name
const dbName = 'myprojeect';

const client = new MongoClient(url);
// Use connect method to connect to the server
client.connect(function(err) {
  assert.equal(null, err);
  console.log("Connected correctly to server");

  // Set debug level
  Logger.setLevel('debug');
  // Only log statements on 'Db' class
  Logger.filter('class', ['Db']);

  const db = client.db(dbName);

  // Execute command {ismaster:true} against db
  db.command({ismaster:true}, function(err, d) {
    assert.equal(null, err);
    client.close();
  });
});
```

Driver classes available for filtering:

* `Db`: The Db instance log statements
* `Server`: A server instance (either standalone, a mongos or replica set member)
* `ReplSet`: Replica set related log statements
* `Mongos`: Mongos related log statements
* `Cursor`: Cursor log statements
* `Pool`: Connection Pool specific log statements
* `Connection`: Singular connection specific log statements
* `Ping`: Replica set ping inquiry log statements

You can add your own classes to the logger by creating your own logger instances. 

```js
const Logger = require('mongodb').Logger;
const assert = require('assert');

class A {
  constructor() {
    this.logger = new Logger('A');
  }

  do() {
    if (this.logger.isInfo()) {
      this.logger.info('logging A', {});
    }
  }
}

// Execute A
const a = new A();
a.do();
```

## Custom logger

The following example demonstrates how to define a custom logger.

```js
const MongoClient = require('mongodb').MongoClient;
const Logger = require('mongodb').Logger;
const assert = require('assert');

// Connection URL
const url = 'mongodb://localhost:27017';
// Database Name
const dbName = 'myprojeect';

const client = new MongoClient(url);
// Use connect method to connect to the server
client.connect(function(err) {
  assert.equal(null, err);
  console.log("Connected correctly to server");

  // Set debug level
  Logger.setLevel('debug');
  
  // Set our own logger
  Logger.setCurrentLogger(function(msg, context) {
    console.log(msg, context);
  });

  const db = client.db(dbName);

  // Execute command {ismaster:true} against db
  db.command({ismaster:true}, function(err, d) {
    assert.equal(null, err);
    client.close();
  });
});
```
