+++
date = "2015-03-19T12:53:26-04:00"
title = "APM"
[menu.main]
  parent = "Management"
 identifier = "APM"
  weight = 100
  pre = "<i class='fa'></i>"
+++

# APM

Application Performance Monitoring support is a driver feature that allows monitoring services to hook into the driver in a forward compatible and stable way. The API is not applied to the driver unless explicitly initialized to avoid any performance penalties.

## API

Let's look at a code example that hooks into all the available features of the APM API.

```js
var listener = require('mongodb').instrument({
  operationIdGenerator: {
    operationId: 1,

    next: function() {
      return this.operationId++;
    }
  },

  timestampGenerator: {
    current: function() {
      return new Date().getTime();
    },

    duration: function(start, end) {
      return end - start;
    }
  }  
}, function(err, instrumentations) {
  // Instrument the driver  
});

listener.on('started', function(event) {
  // command start event (see https://github.com/mongodb/specifications/blob/master/source/command-monitoring/command-monitoring.rst)
});

listener.on('succeeded', function(event) {
  // command success event (see https://github.com/mongodb/specifications/blob/master/source/command-monitoring/command-monitoring.rst)
});

listener.on('failed', function(event) {
  // command failure event (see https://github.com/mongodb/specifications/blob/master/source/command-monitoring/command-monitoring.rst)
});

```

There are two main aspects to the APM API. The first one is the command monitoring specification and the second one is the instrumentation method.

## Command Monitoring

Command monitoring is based on the cross-driver specification for MongoDB found in the Command monitoring [specification](https://github.com/mongodb/specifications/blob/master/source/command-monitoring/command-monitoring.rst).

The Command monitoring specification is a low level monitoring specification that tells you when a new command is being executed against MongoDb and if it fails or succeeds. For most cases this is straight forward and you will receive a single start and either a success or failure event. Let's look at an example.

The user executes an `isMaster` command against the server and we receive the following to messages (full objects are abbreviated to simplicities sake.). When the `isMaster` command starts execution we receive the following event (This result is from `JSON.stringify`, in the real event the connectionId is the actual connection object the command was executed against).

```js
{
  "command": {
    "ismaster": true
  },
  "databaseName": "system",
  "commandName": "ismaster",
  "requestId": 7,
  "operationId": 1,
  "connectionId": {
    "id": 8,
    "host": "localhost",
    "port": 27017
  }
}
```

Let's look at the the `requestId` and `operationId`. The `requestId` is the id used for the wire protocol message sent to MongoDB and allows you to correlate the commands executed on MongoDB with the commands from the driver.

The `operationId` is an id that is used to group commands into a single logical command execution. The use case are queries and batch writes where a single logical operation might be executed as multiple commands to the server. For a query this might mean it gets executed as a `find` command and *n* number of `getMore` commands as well as a `killCursors` command. For bulk writes the logical grouping might contain `n` individual write operations. The goal of `operationId` is to allow APM providers to correlate the breakdown of a cursor or bulk operation with the method called by the user. The typical example is.

```js
db.collection('data').find().batchSize(2).toArray(function(err, docs) {
});
```

That might be translated to `1` find, `n` getMores and `0|1` killCursors.

After the command executed successfully we receive the following result.

```js
{
  "duration": 0,
  "commandName": "ismaster",
  "requestId": 7,
  "operationId": 1,
  "connectionId": {
    "id": 8,
    "host": "localhost",
    "port": 27017
  },
  "reply": {
    "ismaster": true,
    "maxBsonObjectSize": 16777216,
    "maxMessageSizeBytes": 48000000,
    "maxWriteBatchSize": 1000,
    "localTime": "2015-08-04T10:26:01.445Z",
    "maxWireVersion": 3,
    "minWireVersion": 0,
    "ok": 1
  }
}
```

Notice that the `requestId` and `operationId` matches up to the start message allowing the user of the API to correlated the two events. Next let's look at a complete `find` operation that results in `getMores`.

```js
{
  "command": {
    "find": "apm_test_2",
    "filter": {
      "a": 1
    },
    "sort": {
      "a": 1
    },
    "projection": {
      "_id": 1,
      "a": 1
    },
    "limit": 100,
    "skip": 1,
    "hint": {
      "_id": 1
    },
    "batchSize": 2,
    "comment": "some comment",
    "maxScan": 1000,
    "maxTimeMS": 5000,
    "noCursorTimeout": true
  },
  "databaseName": "integration_tests",
  "commandName": "find",
  "requestId": 44,
  "operationId": 39,
  "connectionId": {
    "id": 19,
    "host": "localhost",
    "port": 27017
  }
}
{
  "duration": 1,
  "commandName": "find",
  "requestId": 44,
  "operationId": 39,
  "connectionId": {
    "id": 19,
    "host": "localhost",
    "port": 27017
  },
  "reply": [
    {
      "_id": "55c096386e3b2283b70c294d",
      "a": 1
    },
    {
      "_id": "55c096386e3b2283b70c294e",
      "a": 1
    }
  ]
}
{
  "command": {
    "getMore": "104961726686",
    "collection": "apm_test_2",
    "batchSize": 2,
    "maxTimeMS": 5000
  },
  "databaseName": "integration_tests",
  "commandName": "getMore",
  "requestId": 44,
  "operationId": 39,
  "connectionId": {
    "id": 19,
    "host": "localhost",
    "port": 27017
  }
}
{
  "duration": 1,
  "commandName": "getMore",
  "requestId": 44,
  "operationId": 39,
  "connectionId": {
    "id": 19,
    "host": "localhost",
    "port": 27017
  },
  "reply": [
    {
      "_id": "55c096386e3b2283b70c294f",
      "a": 1
    },
    {
      "_id": "55c096386e3b2283b70c2950",
      "a": 1
    }
  ]
}
{
  "command": {
    "getMore": "104961726686",
    "collection": "apm_test_2",
    "batchSize": 2,
    "maxTimeMS": 5000
  },
  "databaseName": "integration_tests",
  "commandName": "getMore",
  "requestId": 45,
  "operationId": 39,
  "connectionId": {
    "id": 19,
    "host": "localhost",
    "port": 27017
  }
}
{
  "duration": 0,
  "commandName": "getMore",
  "requestId": 45,
  "operationId": 39,
  "connectionId": {
    "id": 19,
    "host": "localhost",
    "port": 27017
  },
  "reply": [
    {
      "_id": "55c096386e3b2283b70c2951",
      "a": 1
    }
  ]
}
```

The main thing to notice here is that they all share the same `operationId` allowing the APM API user to correctly map the low level commands to the logical command executed by the user (in this case `toArray` on a cursor).

### operationIdGenerator

The `operationIdGenerator` option allows the API user to pass in a custom `operationId` generator object that can be used to synchronize internal request Id's in the APM client with the low level command monitoring API. This makes it possible to tie together the logical method called by the users code with the low level commands issues to MongoDB potentially allowing for a richer APM experience and performance breakdown. Below is a simple `operationIdGenerator` example.

```js
var generator = {
  operationId: 1,

  next: function() {
    return this.operationId++;
  }
};
```

### timestampGenerator

The `timestampGenerator` option lets the API user override the method used to timestamp the command monitoring events with a custom timestamp type. The generator contains two method. The first one `current` returns the current `timestamp` and `duration` calculates the total operation duration between the `start` and `end` time. Below is a simple example generator.

```js
var generator = {
  current: function() {
    return new Date().getTime();
  },

  duration: function(start, end) {
    return end - start;
  }
}  
```

## Instrumentation

The instrumentation callback returns the instrumentation points in the driver and it's associated metadata. Let's look at one of the examples. Notice that the result shown is the result from performing `JSON.stringify`. We will note where there are actual object instances.

```js
{
  "name": "Gridstore",
  "stream": true,
  "instrumentations": [
    {
      "methods": [
        "open",
        "getc",
        "puts",
        "write",
        "writeFile",
        "close",
        "unlink",
        "readlines",
        "rewind",
        "read",
        "tell",
        "seek"
      ],
      "options": {
        "callback": true,
        "promise": true
      }
    },
    {
      "methods": [
        "eof"
      ],
      "options": {
        "callback": false,
        "promise": false,
        "returns": [
          null
        ]
      }
    },
    {
      "methods": [
        "stream"
      ],
      "options": {
        "callback": false,
        "promise": false,
        "returns": [
          null
        ]
      }
    },
    {
      "methods": [
        "destroy"
      ],
      "options": {
        "callback": false,
        "promise": false
      }
    },
    {
      "methods": [
        "chunkCollection",
        "collection"
      ],
      "options": {
        "callback": true,
        "promise": false,
        "returns": [
          null
        ]
      }
    },
    {
      "methods": [
        "exist",
        "list",
        "read",
        "readlines",
        "unlink"
      ],
      "options": {
        "callback": true,
        "promise": true,
        "static": true
      }
    }
  ]
}
```

At the top level we have `name` of the class exposed for instrumentation. Next we have the `stream` value that tells the user if the object can operate as a node.js stream. Next the `instrumentations` array contains all the methods available for instrumentation. The methods are grouped by the method characteristics. All methods that support a callback as well as a promise will be grouped in a single instrumentation. This simplifies the code to perform the actual instrumentation.

Let's look at an example instrumentation in more detail.

```js
{
  "methods": [
    "open",
    "getc",
    "puts",
    "write",
    "writeFile",
    "close",
    "unlink",
    "readlines",
    "rewind",
    "read",
    "tell",
    "seek"
  ],
  "options": {
    "callback": true,
    "promise": true
  }
}
```

The `methods` array contains all the methods that have the options `callback=true` and `promise=true` for the GridStore prototype. The available options are.

| Options          | Description                                                |
| ------------- |:-----------------------------------------------------------|
| callback       | The method supports a callback |
| promise       | The method can return a promise |
| static       | The method is a static method (not on the prototype) |
| returns       | The method can return one of the types in the array |

Let's look at a very basic instrumentation example.

```js
var listener = require('../..').instrument(function(err, instrumentations) {
  instrumentations.forEach(function(obj) {
    var object = obj.obj;

    // Iterate over all the methods that are just callback with no return
    obj.instrumentations.forEach(function(instr) {
      var options = instr.options;

      if(options.callback
        && !options.returns && !options.static) {

        // Method name
        instr.methods.forEach(function(method) {
          var applyMethod = function(_method) {
            var func = object.prototype[_method];

            overrides.push({
              obj: object.prototype, method: _method, func: func
            });

            object.prototype[_method] = function() {
              if(!methodsCalled[_method]) methodsCalled[_method] = 0;
              methodsCalled[_method] = methodsCalled[_method] + 1;
              var args = Array.prototype.slice.call(arguments, 0);
              func.apply(this, args);                
            }                
          }

          applyMethod(method);
        });
      }
    });
  });
});
```

This instrumentation only overrides methods that have callbacks and ignores promises, so it's not a complete solution, but shows the way a user of the API can structure their code to tap into the exposed surface of the driver.
