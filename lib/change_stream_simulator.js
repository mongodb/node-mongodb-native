var Timestamp = require('mongodb-core').BSON.Timestamp;
var SUPPORTED_STAGES =  ['$match', '$project', '$addFields', '$replaceRoot', '$redact'];
var replset = require('./replset');
var crypto = require('crypto');

/**
 * Creates a new Change Stream cursor, simulating the server support for Change Streams (INTERNAL TYPE, do not instantiate directly)
 * @param {(ReplSet|Mongos)} serverConfig A server topology against which the Change Stream will be created.
 * @param {object} namespace The namespace against which the Change Stream will be created.
 * @param {string} namespace.database The database against which the Change Stream will be created.
 * @param {string} [namespace.collection] The optional collection within the database against which the Change Stream will be created.
 * @param {Array} pipeline An array of aggregation pipeline stages through which to pass change stream documents
 * @param {object} [options=null] Optional settings
 * @param {string} [options.fullDocument=none] Allowed values: ‘none’, ‘lookup’. When set to ‘lookup’, the change stream will include both a delta describing the changes to the document, as well as a copy of the entire document that was changed from some time after the change occurred.
 * @param {number} [options.maxAwaitTimeMS] The maximum amount of time for the server to wait on new documents to satisfy a change stream query
 * @param {object} [options.resumeAfter=null] Specifies the logical starting point for the new change stream. This should be the _id field from a previously returned change stream document.
 * @param {number} [options.batchSize=null] The number of documents to return per batch. See {@link https://docs.mongodb.com/manual/reference/command/aggregate|aggregation documentation}.
 * @param {object} [options.collation=null] Specify collation settings for operation. See {@link https://docs.mongodb.com/manual/reference/command/aggregate|aggregation documentation}.
 * @fires Cursor#data
 * @fires Cursor#close
 * @fires Cursor#end
 * @return {Cursor} a cursor instance.
 */
var createChangeStreamCursorSimulation = function (serverConfig, namespace, pipeline, options) {

  var Db = require('./db');

  // Validate inputs
  if (typeof serverConfig !== 'object') throw new Error('A server topology object must be provided to createChangeStreamCursorSimulation');
  if (!(typeof namespace === 'object' && typeof namespace.database === 'string')) throw new Error('A namespace object containing a database name must be provided to createChangeStreamCursorSimulation');

  // Verify the server topology is a replica set
  if (!(serverConfig instanceof replset)) {
    throw new Error('Change Stream are only supported on replica sets. The connected server does not appear to be a replica set.');
  }

  // Verify all the pipeline stages are supported
  pipeline.forEach(function (stage) {
    var stageName = Object.keys(stage)[0];
    if (SUPPORTED_STAGES.indexOf(stageName) === -1) {
      throw new Error('The pipeline contains the stage "' + stageName + '", which is not compatible with Change Streams at this time.');
    }
  });

  // Generate a no conflict value for this Change Stream if it does not already exist.
  // This prevents collisions when multiple change stream simulations exist simulataneously.
  options.cursorNoConflict = options.cursorNoConflict || crypto.randomFillSync(new Buffer(16)).toString('hex');

  // Connect to the oplog
  var localDb = new Db('local', serverConfig);
  var oplogCollection = localDb.collection('oplog.rs');
  var aggregationProcessorCollection = localDb.collection('aggregationProcessor' + options.cursorNoConflict);
  var aggregationOutputCollection = localDb.collection('aggregationOutput' + options.cursorNoConflict);

  // Ensure the existence of the aggregationOutput capped collection with at least one item
  localDb.createCollection('aggregationOutput' + options.cursorNoConflict, { capped: true, size: 1000, max: 10 }, function (err, collection) {
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
    resumeAfterTimestamp = new Timestamp(0, localDb.serverConfig.s.replset.ismaster.localTime.getTime() / 1000);
    query.ts = { $gte: resumeAfterTimestamp };
  }

  // Construct namespace regex
  var nsFilter;
  if (namespace.collection) {
    nsFilter = namespace.database + '.' + namespace.collection;
    var targetedCollection = namespace.collection;
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
  var oplogStream = oplogCursor.stream({
    transform: function (doc) {
      return translateFromOplogToChangeNotification(doc, targetedCollection);
    }
  });

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

    // Look up the current status of the changed document
    lookUpDocument(Db, serverConfig, options, changeNotification).then(function (change) {
      // Insert the change notification into the temporary collection
      return aggregationProcessorCollection.insert(change);
    }).then(function () {
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

  return aggregationOutputCursor;

};

// Translate oplogDocument from the structure of the documents in the oplog.rs collection to the Change Notification document structure
var translateFromOplogToChangeNotification = function (oplogDocument, targetedCollection) {
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

// Look up the current state of the changed document
var lookUpDocument = function(Db, serverConfig, options, change) {
  // Resolve with the un-altered change document if the client has not requested a full document lookup
  if (!options || options.fullDocument !== 'lookup') {
    return Promise.resolve(change);
  }

  if (!change || !change.ns || !change.ns.db || !change.ns.coll || !change.documentKey) {
    throw new Error('Full document lookup cannot be performed because the new change document is malformed.');
  }

  // Find the document's current state in the foreign database
  var lookupDb = new Db(change.ns.db, serverConfig);
  return lookupDb.collection(change.ns.coll).findOne({_id: change.documentKey}).then(function (lookedUpDocument) {
    change.lookedUpDocument = lookedUpDocument;
    return change;
  });
};

module.exports.createChangeStreamCursorSimulation = createChangeStreamCursorSimulation;
