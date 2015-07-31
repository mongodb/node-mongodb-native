---
aliases:
- /doc/installing/
date: 2013-07-01
menu:
  main:
    parent: tutorials
prev: ../../tutorials/objectid
next: ../../tutorials/changes-from-1.0
title: Tracing
weight: 9
---
# Tracing or Prototype Overriding

Tracing comes up a couple of times a year so it might be a useful thing for more people than just New Relic or other application metrics companies out there. Maybe you want to instrument the driver to keep some measurements client side on the time it takes for an operation to finish or maybe you want to log all operations somewhere for auditing purposes or maybe you have some awesome new idea about how to do something radically different. Well the good thing is that JavaScript is on your side when it comes to reaching your goals. The rescue comes in the form of the `prototype` of the driver classes. Since code speaks a thousand words let's just throw out code where override the `findOne` method to print the time it took for the operation to the console.

```javascript
var Collection = require('mongodb').Collection
  , MongoClient = require('mongodb').MongoClient
  , f = require('util').format;

// Keep the original findOne method
var findOne = Collection.prototype.findOne;
// Create our own overriding findOne method that wraps the original
Collection.prototype.findOne = function() {
  var startTime = new Date().getTime();
  // Get all the passed in arguments as an array
  var args = Array.prototype.slice.call(arguments, 0);
  // Get the callback at the end of the function
  var callback = args.pop();
  // Push our own callback handler that calls the original 
  // callback after finishing up it's goals
  args.push(function(err, r) {
    var endTime = new Date().getTime();
    console.log(f("findOne took %s milliseconds", (endTime - startTime)))
    callback(err, r)
  });

  // Call the original prototype method findOne on this instance
  return findOne.apply(this, args);
}

MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
  db.collection('t').findOne({}, function(err, r) {
    db.close();
  });
});
```

In this code we change the behavior of the findOne method by wrapping it in our own method that records the start and end times of the findOne operation and prints the number of milliseconds it took to the console. The cool thing is that this is global. Once we changed `Collection.prototype` we automatically get our new wrapped method for all methods that create a new `Collection` instance allowing us to instruments all calls using `Collection.findOne` across our application.

There is not much more to it so go ahead and think of some crazy ways to use this and if you do something very clever let me know :).

# APM Integration Interface API

The `2.0.29` driver introduces an Application Performance Monitoring integration interface to allow for more streamlined interfacing with the driver. The API exposes all the integration points the driver exposes for instrumentation and this should allow minimizing the breakage going forward when the driver adds or removed methods.

Interfacing is straight forward.

```js
var mongodb = require('mongodb');
mongodb.instrument(function(err, instrumentations) {
  
});
```

Where `instrumentations` is an array of prototypes that can be instrumented and their metadata. In the case of the gridstore it might look like the following.

```js
{
  name: 'GridStore',
  obj: GridStore,
  stream: true, 
  instrumentations: [
    { methods: [
      'open', 'getc', 'puts', 'write', 'writeFile', 'close', 'unlink', 'readlines',
      'rewind', 'read', 'tell', 'seek'
    ], options: { callback: true, promise:false } },
    { methods: [
      'collection' 
    ], options: { callback: true, promise:false, returns: connect.Collection } },
    { methods: [
      'exist', 'list', 'read', 'readlines', 'unlink'
    ], options: { callback: false, promise:false, static:true } },
    { methods: [
      'eof', 'destroy', 'chunkCollection'
    ], options: { callback: false, promise:false } }
  ]    
}
```

Let's break down the object to see what it contains and how we can use it to wrap the code. The first part of the object is the.

| `Parameter`          | `Type` | `Description`                              |
| :------------- | :--------- | :-----------------------------------------------------------|
| name | string | The name of the Prototype |
| obj | object | The prototype object |
| stream | boolean | Is the Prototype a stream |
| instrumentations | array | Array of instrumentation integrations |

Each of the entries in the `instrumentations` array contains a list of methods on the prototype and the associated metadata for those methods. Let's break down the examples from the GridStore object above.

```js
{ 
  methods: ['open', 'getc', 'puts', 'write', 
    'writeFile', 'close', 'unlink', 'readlines',
    'rewind', 'read', 'tell', 'seek'], 
  options: { 
    callback: true, 
    promise:false 
  } 
}
```

Looking at the instrumentation description above we see that the `methods` array is a list methods names on the GridStore prototype. The `options` object contains metadata about the methods describing their structure. In this case it tells us that these methods take a `callback` and do not return a `promise`. Let's look at some other examples of metadata.

```js
{ 
  methods: ['collection'], 
  options: { 
    callback: true, 
    promise:false, 
    returns: [Collection] 
  } 
}
```

This options object contains one difference from the previous one, namely the `returns` field. In short this method provides both a callback and a return value. An example of this in the driver would be the `Db.prototype.collection` method that can either take a callback or just return a collection. Let's look at the next instrumentation.

```js
{ 
  methods: ['exist', 'list', 'read', 'readlines', 'unlink'], 
  options: { 
    callback: false, 
    promise:false, 
    static:true 
  } 
}
```

The options contain the `static` field that tells us that all the methods in this instrumentation are on the `GridStore` directly. An example method might be `GridStore.exist`.

```js
{ 
  methods: ['eof', 'destroy', 'chunkCollection'], 
  options: { 
    callback: false, 
    promise:false 
  } 
}
```

The final example tells us the method don't take a callback, return a promise or any other value. Let's describe the available options.

| `Parameter`          | `Type` | `Description`                              |
| :------------- | :--------- | :-----------------------------------------------------------|
| callback | boolean | Method accepts a callback |
| promise | boolean | The method returns a promise |
| returns | array | The method return an array of possible return values |
| static | boolean | Method is static on the prototype |
| cursor | boolean | Method returns a cursor object |

Let's look at a simple example that wraps the callback only instrumentations.

```js
require('../..').instrument(function(err, instrumentations) {
  instrumentations.forEach(function(obj) {
    var object = obj.obj;
    
    // Iterate over all the methods that are just callback with no return
    obj.instrumentations.forEach(function(instr) {
      var options = instr.options;

      if(options.callback 
        && !options.promise 
        && !options.returns && !options.static) {

        // Method name
        instr.methods.forEach(function(method) {
          var applyMethod = function(_method) {
            var func = object.prototype[_method];
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

## Available Integration Points

Currently the available integration points are.

| `Prototype`          | `Description`                              |
| :------------- | :-----------------------------------------------------------|
| Db | Db methods |
| Collection | Collection methods |
| GridStore | GridStore methods |
| OrderedBulkOperation | Ordered bulk operation methods |
| UnorderedBulkOperation | Unordered bulk operation methods |
| CommandCursor | Command cursor queries |
| AggregationCursor | Aggregation cursor queries |
| Cursor | Query cursor queries |
| Server | Low level server operations, return objects always contain the connection they where executed against |
| ReplSet | Low level server operations, return objects always contain the connection they where executed against |
| Mongos | Low level server operations, return objects always contain the connection they where executed against |











