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
var MongoClient = require('mongodb').MongoClient
  , Logger = require('mongodb').Logger
  , assert = require('assert');

// Connection URL
var url = 'mongodb://localhost:27017/myproject';
// Use connect method to connect to the Server
MongoClient.connect(url, function(err, db) {
  assert.equal(null, err);
  console.log("Connected correctly to server");

  // Set debug level
  Logger.setLevel('debug');

  // Execute command {ismaster:true} against db
  db.command({ismaster:true}, function(err, d) {
    assert.equal(null, err);
    db.close();
  });
});
```

## Filtering On specific classes

You can set the Logger to only log specific class names. The following example
demonstrates how to log only the `Db` class.

```js
var MongoClient = require('mongodb').MongoClient
  , Logger = require('mongodb').Logger
  , assert = require('assert');

// Connection URL
var url = 'mongodb://localhost:27017/myproject';
// Use connect method to connect to the Server
MongoClient.connect(url, function(err, db) {
  assert.equal(null, err);
  console.log("Connected correctly to server");

  // Set debug level
  Logger.setLevel('debug');
  // Only log statements on 'Db' class
  Logger.filter('class', ['Db']);

  // Execute command {ismaster:true} against db
  db.command({ismaster:true}, function(err, d) {
    assert.equal(null, err);
    db.close();
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
var Logger = require('mongodb').Logger
  , assert = require('assert');

var A = function() {
  var logger = Logger('A', options);

  this.do = function() {
    if(logger.isInfo()) logger.info('logging A', {});
  }
}

// Execute A
var a = new A();
a.do();
```

## Custom logger

The following example demonstrates how to define a custom logger.

```js
var MongoClient = require('mongodb').MongoClient
  , Logger = require('mongodb').Logger
  , assert = require('assert');

// Connection URL
var url = 'mongodb://localhost:27017/myproject';
// Use connect method to connect to the Server
MongoClient.connect(url, function(err, db) {
  assert.equal(null, err);
  console.log("Connected correctly to server");

  // Set debug level
  Logger.setLevel('debug');
  
  // Set our own logger
  Logger.setCurrentLogger(function(msg, context) {
    console.log(msg, context);
  });

  // Execute command {ismaster:true} against db
  db.command({ismaster:true}, function(err, d) {
    assert.equal(null, err);
    db.close();
  });
});
```
