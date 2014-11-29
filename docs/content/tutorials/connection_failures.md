---
aliases:
- /doc/installing/
date: 2013-07-01
menu:
  main:
    parent: tutorials
prev: ../../tutorials/connecting
next: ../../tutorials/urls
title: Connection Failures
weight: 1
---
# Connection Failures and Retries

This comes up a lot because there is some confusion about how the driver works when it comes to Socket timeouts and retries. This Tutorial attempts to clarify the driver's behavior and explains why, for some legacy reasons as well as for some design reasons, the driver works the way it does.

Let's start off by looking at the Simple case of a single server connection and how it behaves when tweaking the options that control the driver behavior on server disconnects.

First let's start with a simple script performing inserts and find, and running against a server on `localhost:27017`.

```javascript
var MongoClient = require('mongodb').MongoClient
  , f = require('util').format;

MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
  var col = db.collection('t');

  setInterval(function() {
    col.insert({a:1}, function(err, r) {
      console.log("insert")
      console.log(err)

      col.findOne({}, function(err, doc) {
        console.log("findOne")
        console.log(err)
      });
    })
  }, 1000)
});
```

Start the script and notice how it prints out `insert` and `findOne` every second. Now shut down the `mongod` process and notice how you stop seeing the console printouts. What is happening is that the server is buffering operations until the `mongod` returns because the two parameters controlling this behavior are set to the default value. These parameters are:

| `Parameter`          | `Value` | `Description`                              |
| ------------- | :--------- | :-----------------------------------------------------------|
| autoReconnect | true | Driver will attempt to auto reconnect |
| bufferMaxEntries| -1 | Max Number of operations buffered while waiting for server reconnect. Driver will error out all operations if the number of buffered operations goes over the limit set |

By default the driver attempts to reconnect and buffers all operations until it can. This is due to backward compatibility.

Now let's try to disable the `bufferMaxEntries` by setting it to `0` and see what happens.

```javascript
var MongoClient = require('mongodb').MongoClient
  , f = require('util').format;

MongoClient.connect('mongodb://localhost:27017/test', {
    db: { bufferMaxEntries: 0 }
  }, function(err, db) {
  var col = db.collection('t');

  setInterval(function() {
    col.insert({a:1}, function(err, r) {
      console.log("insert")
      console.log(err)

      col.findOne({}, function(err, doc) {
        console.log("findOne")
        console.log(err)
      });
    })
  }, 1000)
});
```

Start the script running and then shut down the `mongod` process. Notice how all operations are now erroring out instead of just being buffered? Now restart the `mongod` service and you will see the the operations once again correctly being executed.

So what happens if we disable `autoReconnect` by setting it to `false`? Let's take a look.

```javascript
var MongoClient = require('mongodb').MongoClient
  , f = require('util').format;

MongoClient.connect('mongodb://localhost:27017/test?autoReconnect=false', function(err, db) {
  var col = db.collection('t');

  setInterval(function() {
    col.insert({a:1}, function(err, r) {
      console.log("insert")
      console.log(err)

      col.findOne({}, function(err, doc) {
        console.log("findOne")
        console.log(err)
      });
    })
  }, 1000)
});
```

When you shut down the `mongod` process, the driver stops processing operations and keeps buffering them due to `bufferMaxEntries` being `-1` by default meaning buffer all operations. When you bring the `mongod` process back up you will notice how it does not change the fact that we are buffering. This is a legacy behavior and less than ideal. So you will want to set `bufferMaxEntries` to 0 or a low number if you wish to turn off `autoReconnect`.

## The Matrix of behavior
Let's put all the possible values of `autoReconnect` and `bufferMaxEntries` in a table so we can more easily understand the behavior.

| `autoReconnect` | `bufferMaxEntries`   | `Description` |
| :--------- | :--------- | :------- |
| true | 0| Auto reconnect but do not buffer operations, error out until server reconnect |
| true | -1| Auto reconnect, buffer all operations until memory run out |
| true | > 0| Auto reconnect, buffer all operations until the bufferMaxEntries is reached and then error out all buffered operations |
| false | 0| Auto reconnect is off, do not buffer operations, error out all operations |
| false |-1| Auto reconnect is off, buffer all operations until memory run out |
| false |> 0| Auto reconnect is off, buffer all operations until the bufferMaxEntries is reached and then error out all buffered operations |

So why is this like this? Well the main reason is a combination of the asynchronous behavior of `node.js` as well as `Replicasets`. When you are using a single server the behavior might be a bit mystifying, but it makes sense in the context of the `Replicaset`.

Say you have a `Replicaset` where a new primary is elected. If the driver does not buffer the operations, it will have to error out all operations until there is a new primary available in the set. This complicates people's code as every operation could potentially fail and thus the driver a long time ago took the decision to make this transparent to the user by buffering operations until the new `primary` is available and then replaying them. `bufferMaxEntries` was added later to allow developers to control this behavior themselves if they wished to be instantly notified about write errors f.ex instead of letting the driver handle it.

## The Confusion

A lot of the confusion comes from mistaking `socketTimeoutMS` with how the async driver works. `socketTimeoutMS` only applies to sockets if they have not been in use and they reach the `socketTimeoutMS`. `connectionTimeoutMS` applies to the initial server connection process timeout and is independent of the `socketTimeoutMS` which is only applied to the socket after a successful server connection.

However people set `socketTimeoutMS` expecting it to influence timeouts for operations. But as we have seen above the `autoReconnect` and `bufferMaxEntries` are the two settings that control the behavior expected by setting `socketTimeoutMS`.

However it's good to notice that you should ensure you have a reasonable `socketTimeoutMS`. A lot of people set it way way too low and find themselves with timeouts happening all the time as operations are infrequent enough to cause constant connection closing and reconnect events.

The rule of thumb I always impart is:

>Set *socketTimeoutMS* to at least `2-3x` the longest running operation in your application or the interval between operations, too ensure you don't timeout long running operations or servers where there are big gaps of time between operations.

## What You are Probably Looking For

Most people who start changing `socketTimeoutMS` are actually looking for the `maxTimeMS` property to limit the time a query runs against the server before it gets aborted. Let's look at how to apply this property on a query.

```javascript
var MongoClient = require('mongodb').MongoClient
  , f = require('util').format;

MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
  var cursor = db.collection('t').find({}).maxTimeMS(1000);
  cursor.toArray(function(err, docs) {
    console.dir(docs)
    db.close();
  });
});
```

This executes a query and sets the `maxTimeMS` property to `1000` milliseconds. If the query runs for longer than that time it will be aborted by the server.
