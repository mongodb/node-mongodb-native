+++
date = "2015-03-18T21:14:20-04:00"
title = "Logging"
[menu.main]
  parent = "Sync Management"
  identifier = "Sync Logging"
  weight = 10
  pre = "<i class='fa'></i>"
+++

# Logging

The driver lets you log at 3 different levels. These are `debug`, `info` and `error`. By default the log level is at `error`. You can change the level, only allow specific classes to log and provide your own logger implementation. Let's look at how we control the log level.

## Setting Log level

Setting the log level is pretty easy. Let's look at example of adjusting it for our application only logging the Db class.

```js
var Server = require('mongodb-core').Server
  , Logger = require('mongodb-core').Logger
  , assert = require('assert');

// Set debug level
Logger.setLevel('debug');

// Create server connection instance
var server = new Server({host: 'localhost', port: 27017});
// Wait for the connection event
server.on('connect', function(server) {
  // Destroy instance
  server.destroy();
});

// Start connecting
server.connect();
```

Setting the level is as easy as calling the method `setLevel` with the string value `debug`, `info` or `error`. Log level is set globally.

## Filtering On specific classes

Say you are only interested in logging a specific class. You can tell the Logger to only log specific class names. Let's take an example Where we only log the `Server` class.

```js
var Server = require('mongodb-core').Server
  , Logger = require('mongodb-core').Logger
  , assert = require('assert');

// Set debug level
Logger.setLevel('debug');
Logger.filter('class', ['Server']);

// Create server connection instance
var server = new Server({host: 'localhost', port: 27017});
// Wait for the connection event
server.on('connect', function(server) {
  // Destroy instance
  server.destroy();
});

// Start connecting
server.connect();
```

This will only log statements on the `Db` class. The available classes in the driver are.

* `Db`: The Db instance log statements
* `Server`: A server instance (either standalone, a mongos or replicaset member)
* `ReplSet`: Replicaset related log statements
* `Mongos`: Mongos related log statements
* `Cursor`: Cursor log statements
* `Pool`: Connection Pool specific log statements
* `Connection`: Singular connection specific log statements
* `Ping`: Replicaset ping inquiry log statements

You can add your own classes to the logger if you wish by creating your own logger instances. Let's look at a simple example on how to add our custom class to the Logger.

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

Pretty simple and straightforward.

## Custom logger

Let's say you don't want the log statements to go to `console.log` but want to send them to a new location or maybe transform them before you send them on. Let's define our custom logger.

```js
var Server = require('mongodb-core').Server
  , Logger = require('mongodb-core').Logger
  , assert = require('assert');

// Set debug level
Logger.setLevel('debug');

// Set our own logger
Logger.setCurrentLogger(function(msg, context) {
  console.log(msg, context);
});

// Create server connection instance
var server = new Server({host: 'localhost', port: 27017});
// Wait for the connection event
server.on('connect', function(server) {
  // Destroy instance
  server.destroy();
});

// Start connecting
server.connect();
```

That wraps up the Logging support in the driver.
