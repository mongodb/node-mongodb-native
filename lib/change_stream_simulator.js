var Timestamp = require('mongodb-core').BSON.Timestamp;
var MongoNetworkError = require('mongodb-core').MongoNetworkError;
var supportedStages =  ['$match', '$project', '$addFields', '$replaceRoot', '$redact'];
var targetedCollection;

var createChangeStreamCursorSimulation = function (serverConfig, namespace, pipeline, options) {
  var DB = require('./db');

  // Validate inputs
  if (typeof serverConfig !== 'object') throw new Error('A server topology object must be provided to createChangeStreamCursorSimulation');
  if (!(typeof namespace === 'object' && typeof namespace.database === 'string')) throw new Error('A namespace object containing a database name must be provided to createChangeStreamCursorSimulation');

  // Verify the server topology is a replica set
  if (!serverConfig.s.replset) {
    throw new Error('Change Stream are only supported on replica sets. The connected server does not appear to be a replica set.');
  }

  // Verify all the pipeline stages are supported
  pipeline.forEach(function (stage) {
    var stageName = Object.keys(stage)[0];
    if (supportedStages.indexOf(stageName) === -1) {
      throw new Error('The pipeline contains the stage "' + stageName + '", which is not compatible with Change Streams at this time.');
    }
  });

  // Connect to the oplog
  var localDB = new DB('local', serverConfig);
  var oplogCollection = localDB.collection('oplog.rs');
  var aggregationProcessorCollection = localDB.collection('aggregationProcessor' + options.cursorNoConflict);
  var aggregationOutputCollection = localDB.collection('aggregationOutput' + options.cursorNoConflict);

  // Ensure the existence of the aggregationOutput capped collection with at least one item
  localDB.createCollection('aggregationOutput' + options.cursorNoConflict, { capped: true, size: 1000, max: 10 }, function (err, collection) {
    if (err) throw err;
    collection.insert({seed:true});
  });

  // Construct a basic filter of the oplog
  var query = {
    fromMigrate: { $exists : false }, // exclude messages about migration of docs between shards
    op: { $ne: 'n' } // exclude 'periodic no-op' messages
  };

  // Insert into the query the timestamp upon which to filter the oplog ($gt is we are resuming)
  var resumeAfterTimestamp;
  if (options.resumeAfter && options.resumeAfter.ts) {
    resumeAfterTimestamp = options.resumeAfter.ts;
    query.ts = { $gt: resumeAfterTimestamp };
  } else {
    resumeAfterTimestamp = new Timestamp(0, localDB.serverConfig.s.replset.ismaster.localTime.getTime() / 1000);
    query.ts = { $gte: resumeAfterTimestamp };
  }

  // Construct namespace regex
  var nsFilter;
  if (namespace.collection) {
    nsFilter = namespace.database + '.' + namespace.collection;
    targetedCollection = namespace.collection;
  } else {
    nsFilter = new RegExp('^' + namespace.database + '\.');
  }
  query.$or = [ { ns: nsFilter }, { "o.renameCollection": nsFilter } ];
  if (namespace.collection) {
    query.$or.push({
      ns: new RegExp('^' + namespace.database + '\.'),
      "o.drop": namespace.collection
    });
  }

  // Construct the tailable/awaitdata cursor on the oplog
  var oplogCursor = oplogCollection.find(query, { tailable: true, awaitdata: true });

  // Transform the oplogCursor using a transformation function into the Change Notification format
  var oplogStream = oplogCursor.stream({ transform: translateFromOplogToChangeNotification });

  // Create a tailable cursor over the collection of the aggregation pipeline output
  var aggregationOutputCursor = aggregationOutputCollection.find({
    '_id.ts': query.ts,
    seed: {$exists: false}
  }, {
    tailable: true,
    awaitdata: true
  });

  // Pass new change notifications through the aggregation pipeline
  oplogStream.on('data', function(changeNotification) {
    // Stop processing this change notification if it is of a type that should be ignored (such as database creation messages)
    if (changeNotification.ignoredCommand) return;

    // Insert the change notification into the temporary collection
    aggregationProcessorCollection.insert(changeNotification).then(function () {
      // Build an aggregation pipeline that matches oplogDocument and then performs the user-provided pipeline stages
      var composedAggregationPipeline = [ { $match: { _id: changeNotification._id } } ].concat(pipeline);
      return aggregationProcessorCollection.aggregate(composedAggregationPipeline).toArray();
    }).then(function(aggregationOutput) {
      // If the _id has been projected out, re-insert the _id and note that it was projected out
      // Later we will remove it from the document eventually returned to the client.
      if (!aggregationOutput[0]._id) {
        aggregationOutput[0]._id = changeNotification._id;
        aggregationOutput[0]._id.idSuppressed = true;
      }
      return aggregationOutputCollection.insert(aggregationOutput);
    }).catch(function(error) {
      // Ignore duplicate key errors
      if (error.message && error.message.indexOf('duplicate key error') > -1) return;

      // Throw all other errors
      console.log('An error occured inside the Change Stream simulator.');
      oplogStream.removeAllListeners('data');
      oplogStream.close();
      throw error;
    });
  });

  // If the oplogStream or aggregationOutputCursor close, this Change Stream simulation is broken and should close down
  oplogStream.on('close', function(){
    oplogStream.removeAllListeners();
    aggregationOutputCursor.close();
  });

  aggregationOutputCursor.prependListener('close', function() {
    oplogStream.removeAllListeners();
    oplogStream.close();
  });

  aggregationOutputCursor.map(function(doc) {
    // Remove the _id if it was removed in the aggregation pipeline
    if (doc._id && doc._id.idSuppressed) delete doc._id;
    return doc;
  });

  // Modify the cursor's .next() method so that we can intercept the output
  // and check if the next document is instructing us to trigger a MongoNetworkError
  aggregationOutputCursor._privateNext = aggregationOutputCursor.next;
  aggregationOutputCursor.next = function(callback) {
    if (typeof callback === 'function') {
      return aggregationOutputCursor._privateNext(function(err, result) {
        if (JSON.stringify(result).indexOf('shouldThrowMongoNetworkError') > -1) {
          return callback(MongoNetworkError.create('This is a thrown MongoNetWorkError'), null);
        }
        return callback(err, result);
      });
    }
    return aggregationOutputCursor._privateNext().then(function(result) {
      if (JSON.stringify(result).indexOf('shouldThrowMongoNetworkError') > -1) {
        // Check if we have already encountered this error
        if (options.errorsEncountered && options.errorsEncountered.indexOf(JSON.stringify(result._id)) > -1) {
          return aggregationOutputCursor.next();
        }

        // Save this error as a previously-encountered MongoNetworkError
        if (!options.errorsEncountered) options.errorsEncountered = [];
        options.errorsEncountered.push(JSON.stringify(result._id));

        // Reject with the network error
        return Promise.reject(MongoNetworkError.create('This is a thrown MongoNetworkError'));
      }
      return Promise.resolve(result);
    });
  };

  return aggregationOutputCursor;

};

// Translate oplogDocument from the structure of the documents in the oplog.rs collection to the Change Notification document structure
var translateFromOplogToChangeNotification = function (oplogDocument) {
  // Validate input
  if (typeof oplogDocument !== 'object') {
    throw new Error('oplogDocument of incorrect type ' + typeof oplogDocument + ' supplied to translateFromOplogToChangeNotification');
  }

  var output = {};

  // Populate the _id field
  output._id = {
    ts: oplogDocument.ts,
    ns: oplogDocument.ns,
    h: oplogDocument.h
  };

  // Populate the operationType field
  switch (oplogDocument.op) {
    case 'i':
      output.operationType = 'insert';
      break;
    case 'd':
      output.operationType = 'delete';
      break;
    case 'u':
      output.operationType = (oplogDocument.o['$set'] || oplogDocument.o['$unset']) ? 'update' : 'replace';
      break;
    case 'c':
      if (oplogDocument.o.renameCollection || (oplogDocument.o.drop && oplogDocument.o.drop === targetedCollection) || oplogDocument.o.dropDatabase) {
        output.operationType = 'invalidate';
        return output;
      } else {
        return {
          ignoredCommand: true
        };
      }
    default:
      throw new Error('Unknown operation type ' + oplogDocument.op);
  }

  // Populate the ns (namespace) field
  var namespace = oplogDocument.ns.split('.');
  output.ns = {
    db: namespace[0]
  };
  if (oplogDocument.op === 'c') {
    if (oplogDocument.o.drop) {
      output.ns.coll = oplogDocument.o.drop;
    } else if (oplogDocument.o.renameCollection) {
      output.ns.coll = oplogDocument.o.renameCollection.split('.')[1];
    } else if (!oplogDocument.o.dropDatabase){
      throw new Error('Unable to determine collection name.');
    }
  } else {
    output.ns.coll = namespace[1];
  }

  // Populate the documentKey field (for insert, update, replace, and delete operations only)
  if (['insert', 'update', 'replace', 'delete'].includes(output.operationType)) {
    output.documentKey = oplogDocument.o._id || oplogDocument.o2._id;
  }

  // Populate the newDocument field (for insert and replace operations only)
  if (['insert', 'replace'].includes(output.operationType)) {
    output.newDocument = oplogDocument.o;
  }

  // Populate the updateDescription field (for update operations only)
  if (output.operationType === 'update') {
    output.updateDescription = {};
    if (oplogDocument.o['$set']) {
      output.updateDescription.updatedFields = oplogDocument.o['$set'];
    }
    if (oplogDocument.o['$unset']) {
      output.updateDescription.removedFields = Object.keys(oplogDocument.o['$unset']);
    }
  }

  // TODO: Include the lookedUpDocument if the ‘fullDocument’ argument to $changeNotification is ‘lookup’

  return output;
};

module.exports.createChangeStreamCursorSimulation = createChangeStreamCursorSimulation;
