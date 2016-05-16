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

The following code example hooks into all the available features of the APM API.

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

The Command monitoring specification is a low-level monitoring specification that sends a notification when a new command is executed against MongoDB and if it fails or succeeds. In most cases this is straightforward and you will receive a single start and either a success or failure event. 

In this example, the user executes the `isMaster` command against the server and receives the following messages (full objects are abbreviated for simplicity's sake). When the `isMaster` command starts execution we receive the following event (this result is from `JSON.stringify`; in the real event the connectionId is the actual connection object the command was executed against).

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

`requestId` is the id used for the wire protocol message sent to MongoDB and allows you to correlate the commands executed on MongoDB with the commands from the driver.

`operationId` is an id that is used to group commands into a single logical command execution. Use cases are queries and batch writes where a single logical operation might be executed as multiple commands to the server. For a query this might mean it gets executed as a `find` command and *n* number of `getMore` commands as well as a `killCursors` command. For bulk writes the logical grouping might contain `n` individual write operations. The goal of `operationId` is to allow APM providers to correlate the breakdown of a cursor or bulk operation with the method called by the user. 

A typical example:

```js
db.collection('data').find().batchSize(2).toArray(function(err, docs) {
});
```

That might be translated to `1` find, `n` getMores and `0|1` killCursors.

After the command executed successfully it sends the following result:

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

Notice that the `requestId` and `operationId` match up to the start message, allowing the user of the API to correlate the two events. 

The next example shows a complete `find` operation that results in multiple `getMore` responses.

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

The main thing to notice here is that they all share the same `operationId`, allowing the APM API user to correctly map the low level commands to the logical command executed by the user (in this case `toArray` on a cursor).

### operationIdGenerator

The `operationIdGenerator` option allows the API user to pass in a custom `operationId` generator object that can be used to synchronize internal request Id's in the APM client with the low level command monitoring API. This makes it possible to tie together the logical method called by the user's code with the low-level commands issued to MongoDB, allowing for a richer APM experience and performance breakdown. Below is a simple `operationIdGenerator` example.

```js
var generator = {
  operationId: 1,

  next: function() {
    return this.operationId++;
  }
};
```

### timestampGenerator

The `timestampGenerator` option lets the API user override the method used to timestamp the command monitoring events with a custom timestamp type. The generator contains two methods. `current` returns the current `timestamp` and `duration` calculates the total operation duration between the `start` and `end` time. Below is a simple generator example.

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

The `instrumentation` callback returns the instrumentation points in the driver and associated metadata. 
In the following example, the result shown is the result from performing `JSON.stringify`.

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

At the top level is the name of the class exposed for instrumentation. Next is the `stream` value that tells the user if the object can operate as a Node.js stream. Next the `instrumentations` array contains all the methods available for instrumentation. The methods are grouped by method characteristics. All methods that support a callback as well as a promise will be grouped in a single instrumentation. This simplifies the code to perform the actual instrumentation.

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

The `methods` array contains all the methods that have the options `callback=true` and `promise=true` for the GridStore prototype. The available options are:

| Options          | Description                                                |
| ------------- |:-----------------------------------------------------------|
| callback       | The method supports a callback |
| promise       | The method can return a promise |
| static       | The method is a static method (not on the prototype) |
| returns       | The method can return one of the types in the array |

Below is a very basic instrumentation example.

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

This instrumentation only overrides methods that have callbacks and ignores promises, so it's not a complete solution, but shows how an API user can structure code to tap into the exposed surface of the driver.
