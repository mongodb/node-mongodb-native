---
aliases:
- /doc/installing/
date: 2013-07-01
menu:
  main:
    parent: tutorials
prev: ../../tutorials/objectid
next: ../../tutorials/connecting
title: Tracing
weight: 9
---
# Tracing or Prototype Overriding

Tracing comes up a couple of times a year so it might be a useful thing for more people than just New Relic or other application metrics companies out there. Maybe you want to instrument the driver to keep some measurements client side on the time it takes for an operation to finish or maybe you want to log all operations somewhere for auditing purposes or maybe you have some awesome new idea about how to do something radically different. Well the good thing is that JavaScript is on your side when it comes to reaching your goals. The rescue comes in the form of the `prototype` of the driver classes. Since code speaks a thousand words let's just throw out code where override the `findOne` method to print the time it took for the operation to the console.

```javascript
var Collection = require('./').Collection
  , MongoClient = require('./').MongoClient
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
  findOne.apply(this, args);
}

MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
  db.collection('t').findOne({}, function(err, r) {
    db.close();
  });
});
```

In this code we change the behavior of the findOne method by wrapping it in our own method that records the start and end times of the findOne operation and prints the number of milliseconds it took to the console. The cool thing is that this is global. Once we changed `Collection.prototype` we automatically get our new wrapped method for all methods that create a new `Collection` instance allowing us to instruments all calls using `Collection.findOne` across our application.

There is not much more to it so go ahead and think of some crazy ways to use this and if you do something very clever let me know :).
