var Insert = require('./commands').Insert
  , Update = require('./commands').Update
  , Remove = require('./commands').Remove
  , Query = require('../connection/commands').Query
  , copy = require('../connection/utils').copy
  , f = require('util').format
  , CommandResult = require('../topologies/command_result')
  , MongoError = require('../error');

var LegacySupport = function() {
  // Write concern fields
  var writeConcernFields = ['w', 'wtimeout', 'j', 'fsync'];

  var hasWriteConcern = function(writeConcern) {
    if(writeConcern.w 
      || writeConcern.wtimeout 
      || writeConcern.j == true 
      || writeConcern.fsync == true 
      || Object.keys(writeConcern).length == 0) {
      return true;
    }
    return false;
  }

  var cloneWriteConcern = function(writeConcern) {
    var wc = {};
    if(writeConcern.w != null) wc.w = writeConcern.w;
    if(writeConcern.wtimeout != null) wc.wtimeout = writeConcern.wtimeout;
    if(writeConcern.j != null) wc.j = writeConcern.j;
    if(writeConcern.fsync != null) wc.fsync = writeConcern.fsync;
    return wc;
  }

  //
  // Aggregate up all the results
  //
  var aggregateWriteOperationResults = function(opType, ops, results, connection) {
    var finalResult = { ok: 1, n: 0 }
    
    // Map all the results coming back
    for(var i = 0; i < results.length; i++) {
      var result = results[i];
      var op = ops[i];

      if((result.upserted || (result.updatedExisting == false)) && finalResult.upserted == null) {
        finalResult.upserted = [];
      }

      // Push the upserted document to the list of upserted values
      if(result.upserted) {
        finalResult.upserted.push({index: i, _id: result.upserted});
      }

      // We have an upsert where we passed in a _id
      if(result.updatedExisting == false && result.n == 1 && result.upserted == null) {
        finalResult.upserted.push({index: i, _id: op.q._id});
      }

      // We have an insert command
      if(result.ok == 1 && opType == 'insert' && result.err == null) {
        finalResult.n = finalResult.n + 1;
      }

      // We have a command error
      if(result != null && result.ok == 0 || result.err || result.errmsg) {
        if(result.ok == 0) finalResult.ok = 0;
        finalResult.code = result.code;
        finalResult.errmsg = result.errmsg || result.err || result.errMsg;

        // Check if we have a write error
        if(result.code == 11000 
          || result.code == 11001 
          || result.code == 12582
          || result.code == 14
          || result.code == 13511) {
          if(finalResult.writeErrors == null) finalResult.writeErrors = [];
          finalResult.writeErrors.push({
              index: i
            , code: result.code
            , errmsg: result.errmsg || result.err || result.errMsg
          });
        } else {
          finalResult.writeConcernError = {
              code: result.code
            , errmsg: result.errmsg || result.err || result.errMsg            
          }
        }
      } else if(typeof result.n == 'number') {
        finalResult.n += result.n;
      } else {
        finalResult.n += 1;
      }
      
      // Result as expected
      if(result != null && result.lastOp) finalResult.lastOp = result.lastOp;
    }

    // Return finalResult aggregated results
    return new CommandResult(finalResult, connection);
  }

  //
  // Execute all inserts in an ordered manner
  //
  var executeOrdered = function(opType ,command, ismaster, ns, bson, pool, callbacks, ops, options, callback) {
    var _ops = ops.slice(0);
    // Bind to current domain
    callback = bindToCurrentDomain(callback);
    // Collect all the getLastErrors
    var getLastErrors = [];

    // Execute an operation
    var executeOp = function(list, _callback) {
      // Get a pool connection
      var connection = pool.get();
      // No more items in the list
      if(list.length == 0) return _callback(null, aggregateWriteOperationResults(opType, ops, getLastErrors, connection));
      
      // Get the first operation
      var doc = list.shift();      
      
      // Create an insert command
      var op = new command(Query.getRequestId(), ismaster, bson, ns, [doc], options);
      // Write concern
      var optionWriteConcern = options.writeConcern || {w:1};
      // Final write concern
      var writeConcern = cloneWriteConcern(optionWriteConcern);

      // Get the db name
      var db = ns.split('.').shift();

      // Error out if no connection available
      if(connection == null) 
        return _callback(new MongoError("no connection available"));

      try {
        // Execute the insert
        connection.write(op);

        // If write concern 0 don't fire getLastError
        if(hasWriteConcern(writeConcern)) {
          var getLastErrorCmd = {getlasterror: 1};
          // Merge all the fields
          for(var i = 0; i < writeConcernFields.length; i++) {
            if(writeConcern[writeConcernFields[i]] != null)
              getLastErrorCmd[writeConcernFields[i]] = writeConcern[writeConcernFields[i]];
          }

          // Create a getLastError command
          var getLastErrorOp = new Query(bson, f("%s.$cmd", db), getLastErrorCmd, {numberToReturn: -1});
          // Write the lastError message
          connection.write(getLastErrorOp);
          // Register the callback
          callbacks.register(getLastErrorOp.requestId, function(err, result) {
            if(err) return callback(err);
            // Get the document
            var doc = result.documents[0];
            // Save the getLastError document
            getLastErrors.push(doc);
            // If we have an error terminate
            if(doc.ok == 0 || doc.err || doc.errmsg) return callback(null, aggregateWriteOperationResults(opType, ops, getLastErrors, connection));
            // Execute the next op in the list
            executeOp(list, callback);
          });          
        }
      } catch(err) {
        if(typeof err == 'string') err = new MongoError(err);
        // We have a serialization error, rewrite as a write error to have same behavior as modern
        // write commands
        getLastErrors.push({ ok: 1, errmsg: err.message, code: 14 });
        // Return due to an error
        return callback(null, aggregateWriteOperationResults(opType, ops, getLastErrors, connection));
      }
    }

    // Execute the operations
    executeOp(_ops, callback);
  }

  var executeUnordered = function(opType, command, ismaster, ns, bson, pool, callbacks, ops, options, callback) {
    // Bind to current domain
    callback = bindToCurrentDomain(callback);
    // Total operations to write
    var totalOps = ops.length;
    // Collect all the getLastErrors
    var getLastErrors = [];
    // Write concern
    var optionWriteConcern = options.writeConcern || {w:1};
    // Final write concern
    var writeConcern = cloneWriteConcern(optionWriteConcern);

    // Execute all the operations
    for(var i = 0; i < ops.length; i++) {
      // Create an insert command
      var op = new command(Query.getRequestId(), ismaster, bson, ns, [ops[i]], options);
      // Get db name
      var db = ns.split('.').shift();

      // Get a pool connection
      var connection = pool.get();

      // Error out if no connection available
      if(connection == null) 
        return _callback(new MongoError("no connection available"));

      try {
        // Execute the insert
        connection.write(op);
        // console.log("--------------------------------------------------- EXECUTE 0")
        // console.dir(writeConcern)
        // If write concern 0 don't fire getLastError
        if(hasWriteConcern(writeConcern)) {
        // console.log("--------------------------------------------------- EXECUTE 1")

          var getLastErrorCmd = {getlasterror: 1};
          // Merge all the fields
          for(var j = 0; j < writeConcernFields.length; j++) {
            if(writeConcern[writeConcernFields[j]] != null)
              getLastErrorCmd[writeConcernFields[j]] = writeConcern[writeConcernFields[j]];
          }

        // console.log("--------------------------------------------------- EXECUTE 2")

          // Create a getLastError command
          var getLastErrorOp = new Query(bson, f("%s.$cmd", db), getLastErrorCmd, {numberToReturn: -1});
          // Write the lastError message
          connection.write(getLastErrorOp);
    
          // Give the result from getLastError the right index      
          var callbackOp = function(_index) {
            return function(err, result) {
              // Update the number of operations executed
              totalOps = totalOps - 1;
              // Save the getLastError document
              getLastErrors[_index] = result.documents[0];
              // Check if we are done
              if(totalOps == 0) {
                callback(null, aggregateWriteOperationResults(opType, ops, getLastErrors, connection));
              }
            }
          }

          // Register the callback
          callbacks.register(getLastErrorOp.requestId, callbackOp(i));
        }
      } catch(err) {
        if(typeof err == 'string') err = new MongoError(err);
        // Update the number of operations executed
        totalOps = totalOps - 1;
        // We have a serialization error, rewrite as a write error to have same behavior as modern
        // write commands
        getLastErrors[i] = { ok: 1, errmsg: err.message, code: 14 };
        // Check if we are done
        if(totalOps == 0) {
          callback(null, aggregateWriteOperationResults(opType, ops, getLastErrors, connection));
        }
      }
    }

    // Empty w:0 return
    if(writeConcern 
      && writeConcern.w == 0 && callback) {
      callback(null, null);
    }
  }

  //
  // Needs to support legacy mass insert as well as ordered/unordered legacy
  // emulation
  //
  this.insert = function(ismaster, ns, bson, pool, callbacks, ops, options, callback) {
    options = options || {};  
    // Default is ordered execution
    var ordered = typeof options.ordered == 'boolean' ? options.ordered : true;
    var legacy = typeof options.legacy == 'boolean' ? options.legacy : false;
    ops = Array.isArray(ops) ? ops :[ops];

    // If we have more than a 1000 ops fails
    if(ops.length > 1000) return callback(new MongoError("exceeded maximum write batch size of 1000"));

    // Write concern
    var writeConcern = options.writeConcern || {w:1};

    // We are unordered
    if(!ordered || writeConcern.w == 0) {
      return executeUnordered('insert', Insert, ismaster, ns, bson, pool, callbacks, ops, options, callback);
    }

    return executeOrdered('insert', Insert, ismaster, ns, bson, pool, callbacks, ops, options, callback);
  }

  this.update = function(ismaster, ns, bson, pool, callbacks, ops, options, callback) {    
    options = options || {};  
    // Default is ordered execution
    var ordered = typeof options.ordered == 'boolean' ? options.ordered : true;
    ops = Array.isArray(ops) ? ops :[ops];

    // Write concern
    var writeConcern = options.writeConcern || {w:1};

    // We are unordered
    if(!ordered || writeConcern.w == 0) {
      return executeUnordered('update', Update, ismaster, ns, bson, pool, callbacks, ops, options, callback);
    }

    return executeOrdered('update', Update, ismaster, ns, bson, pool, callbacks, ops, options, callback);    
  }

  this.remove = function(ismaster, ns, bson, pool, callbacks, ops, options, callback) {
    options = options || {};  
    // Default is ordered execution
    var ordered = typeof options.ordered == 'boolean' ? options.ordered : true;
    ops = Array.isArray(ops) ? ops :[ops];

    // Write concern
    var writeConcern = options.writeConcern || {w:1};

    // We are unordered
    if(!ordered || writeConcern.w == 0) {
      return executeUnordered('remove', Remove, ismaster, ns, bson, pool, callbacks, ops, options, callback);
    }

    return executeOrdered('remove', Remove, ismaster, ns, bson, pool, callbacks, ops, options, callback);    
  }
}

/**
 * @ignore
 */
var bindToCurrentDomain = function(callback) {
  var domain = process.domain;
  if(domain == null || callback == null) {
    return callback;
  } else {
    return domain.bind(callback);
  }
}

module.exports = LegacySupport;