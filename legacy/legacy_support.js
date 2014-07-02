var Insert = require('./commands').Insert
  , Update = require('./commands').Update
  , Remove = require('./commands').Remove
  , Query = require('../connection/commands').Query
  , copy = require('../connection/utils').copy
  , CommandResult = require('../topologies/command_result')
  , MongoError = require('../error');

var LegacySupport = function() {

  //
  // Aggregate up all the results
  //
  var aggregateWriteOperationResults = function(results, connection) {
    var final = { ok: 1, n: 0 }
    
    // Map all the results coming back
    for(var i = 0; i < results.length; i++) {
      var result = results[i];

      if(result.upserted && final.upserted == null) {
        final.upserted = [];
      }

      // Push the upserted document to the list of upserted values
      if(result.upserted) {
        final.upserted.push({index: i, _id: result.upserted});
      }

      // We have a command error
      if(result != null && result.ok == 0 || result.err || result.errmsg) {
        if(result.ok == 0) final.ok = 0;
        final.code = result.code;
        final.errmsg = result.errmsg || result.err || result.errMsg;

        // Check if we have a write error
        if(result.code == 11000 
          || result.code == 11001 
          || result.code == 12582
          || result.code == 14
          || result.code == 13511) {
          if(final.writeErrors == null) final.writeErrors = [];
          final.writeErrors.push({
              index: i
            , code: result.code
            , errmsg: result.errmsg || result.err || result.errMsg
          });
        } else {
          final.writeConcernError = {
              code: result.code
            , errmsg: result.errmsg || result.err || result.errMsg            
          }
        }
      } else if(typeof result.n == 'number') {
        final.n += result.n;
      } else {
        final.n += 1;
      }
      
      // Result as expected
      if(result != null && result.lastOp) final.lastOp = result.lastOp;
    }

    // Return final aggregated results
    return new CommandResult(final, connection);
  }

  //
  // Execute all inserts in an ordered manner
  //
  var executeOrdered = function(command, ismaster, ns, bson, pool, callbacks, ops, options, callback) {
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
      if(list.length == 0) return _callback(null, aggregateWriteOperationResults(getLastErrors, connection));
      
      // Get the first operation
      var doc = list.shift();      
      
      // Create an insert command
      var op = new command(Query.getRequestId(), ismaster, bson, ns, [doc], options);
      // Write concern
      var writeConcern = options.writeConcern || {w:1};
      // Create a getLastError command
      var getLastErrorOp = new Query(bson, "system.$cmd", copy(writeConcern, {getLastError: 1}), {numberToReturn: -1});

      // Error out if no connection available
      if(connection == null) 
        return _callback(new MongoError("no connection available"));

      try {
        // Execute the insert
        connection.write(op);
        // Write the lastError message
        connection.write(getLastErrorOp);
        // Register the callback
        callbacks.once(getLastErrorOp.requestId, function(err, result) {
          if(err) return callback(err);
          // Get the document
          var doc = result.documents[0];
          // Save the getLastError document
          getLastErrors.push(doc);
          // If we have an error terminate
          if(doc.ok == 0 || doc.err || doc.errmsg) return callback(null, aggregateWriteOperationResults(getLastErrors, connection));
          // Execute the next op in the list
          executeOp(list, callback);
        });
      } catch(err) {
        // We have a serialization error, rewrite as a write error to have same behavior as modern
        // write commands
        getLastErrors.push({ ok: 1, errmsg: err, code: 14 });
        // Return due to an error
        return callback(null, aggregateWriteOperationResults(getLastErrors, connection));
      }
    }

    // Execute the operations
    executeOp(_ops, callback);
  }

  var executeUnordered = function(command, ismaster, ns, bson, pool, callbacks, ops, options, callback) {
    // Bind to current domain
    callback = bindToCurrentDomain(callback);
    // Total operations to write
    var totalOps = ops.length;
    // Collect all the getLastErrors
    var getLastErrors = [];

    for(var i = 0; i < ops.length; i++) {
      // Create an insert command
      var op = new command(Query.getRequestId(), ismaster, bson, ns, [ops[i]], options);
      // Write concern
      var writeConcern = options.writeConcern || {w:1};
      // Create a getLastError command
      var getLastErrorOp = new Query(bson, "system.$cmd", copy(writeConcern, {getLastError: 1}), {numberToReturn: -1});

      // Get a pool connection
      var connection = pool.get();

      // Error out if no connection available
      if(connection == null) 
        return _callback(new MongoError("no connection available"));

      try {
        // Execute the insert
        connection.write(op);
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
              callback(null, aggregateWriteOperationResults(getLastErrors, connection));
            }
          }
        }
        // Register the callback
        callbacks.once(getLastErrorOp.requestId, callbackOp(i));
      } catch(err) {
        // Update the number of operations executed
        totalOps = totalOps - 1;
        // We have a serialization error, rewrite as a write error to have same behavior as modern
        // write commands
        getLastErrors[i] = { ok: 1, errmsg: err, code: 14 };
        // Check if we are done
        if(totalOps == 0) {
          callback(null, aggregateWriteOperationResults(getLastErrors, connection));
        }
      }
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

    // We are unordered
    if(!ordered) {
      return executeUnordered(Insert, ismaster, ns, bson, pool, callbacks, ops, options, callback);
    }

    return executeOrdered(Insert, ismaster, ns, bson, pool, callbacks, ops, options, callback);
  }

  this.update = function(ismaster, ns, bson, pool, callbacks, ops, options, callback) {    
    options = options || {};  
    // Default is ordered execution
    var ordered = typeof options.ordered == 'boolean' ? options.ordered : true;
    ops = Array.isArray(ops) ? ops :[ops];

    // We are unordered
    if(!ordered) {
      return executeUnordered(Update, ismaster, ns, bson, pool, callbacks, ops, options, callback);
    }

    return executeOrdered(Update, ismaster, ns, bson, pool, callbacks, ops, options, callback);    
  }

  this.remove = function(ismaster, ns, bson, pool, callbacks, ops, options, callback) {
    options = options || {};  
    // Default is ordered execution
    var ordered = typeof options.ordered == 'boolean' ? options.ordered : true;
    ops = Array.isArray(ops) ? ops :[ops];

    // We are unordered
    if(!ordered) {
      return executeUnordered(Remove, ismaster, ns, bson, pool, callbacks, ops, options, callback);
    }

    return executeOrdered(Remove, ismaster, ns, bson, pool, callbacks, ops, options, callback);    
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