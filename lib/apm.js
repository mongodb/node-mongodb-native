var EventEmitter = require('events').EventEmitter,
  inherits = require('util').inherits;

var basicOperationIdGenerator = {
  operationId: 1,

  next: function() {
    return this.operationId++;
  }
}

var Instrumentation = function(core, options) {
  options = options || {};
  var operationIdGenerator = options.operationIdGenerator || basicOperationIdGenerator;
  // Extend with event emitter functionality
  EventEmitter.call(this);

  // ---------------------------------------------------------
  //
  // Server
  //
  // ---------------------------------------------------------

  // Reference
  var self = this;
  // Names of methods we need to wrap
  var methods = ['command'];
  // Prototype
  var proto = core.Server.prototype;
  // Core server method we are going to wrap
  methods.forEach(function(x) {
    var func = proto[x];

    // The actual prototype
    proto[x] = function() {
      var requestId = core.Query.nextRequestId();
      // Get the aruments
      var args = Array.prototype.slice.call(arguments, 0);
      var ns = args[0];
      var commandObj = args[1];
      var keys = Object.keys(commandObj);
      var commandName = keys[0];
      var db = ns.split('.')[0];

      // Get the callback
      var callback = args.pop();
      // Set current callback operation id from the current context or create
      // a new one
      var ourOpId = callback.operationId || operationIdGenerator.next();

      // Get a connection reference for this server instance
      var connection = this.s.pool.get()
      // Emit the start event for the command
      var command = {
        // Returns the command.
        command: commandObj,
        // Returns the database name.
        databaseName: db,
        // Returns the command name.
        commandName: commandName,
        // Returns the driver generated request id.
        requestId: requestId,
        // Returns the driver generated operation id.
        // This is used to link events together such as bulk write operations. OPTIONAL.
        operationId: ourOpId,
        // Returns the connection id for the command. For languages that do not have this,
        // this MUST return the driver equivalent which MUST include the server address and port.
        // The name of this field is flexible to match the object that is returned from the driver.
        connectionId: connection
      };

      // Emit the started event
      self.emit('started', command)

      // Start time
      var startTime = new Date().getTime();

      // Push our handler callback
      args.push(function(err, r) {
        var endTime = new Date().getTime();
        var command = {
          duration: (endTime - startTime),
          commandName: commandName,
          requestId: requestId,
          operationId: ourOpId,
          connectionId: connection
        };

        // If we have an error
        if(err) {
          command.failure = err;
          self.emit('failed', command);
        } else {
          command.reply = r;
          self.emit('succeeded', command);
        }

        // Return to caller
        callback(err, r);
      });

      // Apply the call
      func.apply(this, args);
    }
  });

  // ---------------------------------------------------------
  //
  // Bulk Operations
  //
  // ---------------------------------------------------------

  // Inject ourselves into the Bulk methods
  var methods = ['execute'];
  var prototypes = [
    require('./bulk/ordered').Bulk.prototype,
    require('./bulk/unordered').Bulk.prototype
  ]

  prototypes.forEach(function(proto) {
    // Core server method we are going to wrap
    methods.forEach(function(x) {
      var func = proto[x];

      // The actual prototype
      proto[x] = function() {
        var bulk = this;
        // Get the aruments
        var args = Array.prototype.slice.call(arguments, 0);
        // Set an operation Id on the bulk object
        this.operationId = operationIdGenerator.next();

        // Get the callback
        var callback = args.pop();
        // If we have a callback use this
        if(typeof callback == 'function') {
          args.push(function(err, r) {
            // Return to caller
            callback(err, r);
          });

          // Apply the call
          func.apply(this, args);
        } else {
          return func.apply(this, args);
        }
      }
    });
  });

  // ---------------------------------------------------------
  //
  // Cursor
  //
  // ---------------------------------------------------------

  // Inject ourselves into the Cursor methods
  var methods = ['_find', '_getmore', '_killcursor'];
  var prototypes = [
    require('./cursor').prototype,
    require('./command_cursor').prototype,
    require('./aggregation_cursor').prototype
  ]

  // Command name translation
  var commandTranslation = {
    '_find': 'find', '_getmore': 'getMore', '_killcursor': 'killCursors'
  }

  prototypes.forEach(function(proto) {
    // Core server method we are going to wrap
    methods.forEach(function(x) {
      var func = proto[x];

      // The actual prototype
      proto[x] = function() {
        var cursor = this;
        var requestId = core.Query.nextRequestId();
        var ourOpId = operationIdGenerator.next();
        var parts = this.ns.split('.');
        var db = parts[0];

        // Get the collection
        parts.shift();
        var collection = parts.join('.');

        // If we have a find method, set the operationId on the cursor
        if(x == '_find') {
          cursor.operationId = ourOpId;
        }

        // Set the command
        var command = this.query;
        var cmd = this.s.cmd;

        // Do we have a find command rewrite it
        if(x == '_find') {
          command = {
            find: collection, filter: cmd.query
          }

          if(cmd.sort) command.sort = cmd.sort;
          if(cmd.fields) command.projection = cmd.fields;
          if(cmd.limit && cmd.limit < 0) {
            command.limit = Math.abs(cmd.limit);
            command.singleBatch = true;
          } else if(cmd.limit) {
            command.limit = Math.abs(cmd.limit);
          }

          // Options
          if(cmd.skip) command.skip = cmd.skip;
          if(cmd.hint) command.hint = cmd.hint;
          if(cmd.batchSize) command.batchSize = cmd.batchSize;
          if(cmd.returnKey) command.returnKey = cmd.returnKey;
          if(cmd.comment) command.comment = cmd.comment;
          if(cmd.min) command.min = cmd.min;
          if(cmd.max) command.max = cmd.max;
          if(cmd.maxScan) command.maxScan = cmd.maxScan;
          if(cmd.readPreference) command['$readPreference'] = cmd.readPreference;
          if(cmd.maxTimeMS) command.maxTimeMS = cmd.maxTimeMS;

          // Flags
          if(cmd.awaitData) command.awaitData = cmd.awaitData;
          if(cmd.snapshot) command.snapshot = cmd.snapshot;
          if(cmd.tailable) command.tailable = cmd.tailable;
          if(cmd.oplogReplay) command.oplogReplay = cmd.oplogReplay;
          if(cmd.noCursorTimeout) command.noCursorTimeout = cmd.noCursorTimeout;
          if(cmd.partial) command.partial = cmd.partial;
          if(cmd.showDiskLoc) command.showRecordId = cmd.showDiskLoc;

          // Override method
          if(cmd.explain) command.explain = cmd.explain;
          if(cmd.exhaust) command.exhaust = cmd.exhaust;
        } else if(x == '_getmore') {
          command = {
            getMore: this.cursorState.cursorId,
            collection: collection,
            batchSize: cmd.batchSize
          }

          if(cmd.maxTimeMS) command.maxTimeMS = cmd.maxTimeMS;
        } else if(x == '_killcursors') {
          command = {
            killCursors: collection,
            cursors: [this.cursorState.cursorId]
          }
        }

        // console.log("#############################################################")
        // console.dir(this)

        // Set up the connection
        var connectionId = null;
        // Set local connection
        if(this.connection) connectionId = this.connection;
        if(!connectionId && this.server && this.server.getConnection) connectionId = this.server.getConnection();

        // var connections = this.connections();
        // var connectionId = connections.length > 0 ? connections[0] :  null;

        // Emit the start event for the command
        var command = {
          // Returns the command.
          command: command,
          // Returns the database name.
          databaseName: db,
          // Returns the command name.
          commandName: commandTranslation[x],
          // Returns the driver generated request id.
          requestId: requestId,
          // Returns the driver generated operation id.
          // This is used to link events together such as bulk write operations. OPTIONAL.
          operationId: this.operationId,
          // Returns the connection id for the command. For languages that do not have this,
          // this MUST return the driver equivalent which MUST include the server address and port.
          // The name of this field is flexible to match the object that is returned from the driver.
          connectionId: connectionId
        };

        // Get the aruments
        var args = Array.prototype.slice.call(arguments, 0);

        // Get the callback
        var callback = args.pop();

        // We do not have a callback but a Promise
        if(typeof callback == 'function') {
          var startTime = new Date();
          // Emit the started event
          self.emit('started', command)
          // Add our callback handler
          args.push(function(err, r) {
            if(err) {
              // Command
              var command = {
                duration: (new Date().getTime() - startTime.getTime()),
                commandName: commandTranslation[x],
                requestId: requestId,
                operationId: ourOpId,
                connectionId: cursor.server.getConnection(),
                failure: err };

              // Emit the command
              self.emit('failed', command)
            } else {
              // cursor id is zero, we can issue success command
              var command = {
                duration: (new Date().getTime() - startTime.getTime()),
                commandName: commandTranslation[x],
                requestId: requestId,
                operationId: cursor.operationId,
                connectionId: cursor.server.getConnection(),
                reply: cursor.cursorState.documents
              };

              // Emit the command
              self.emit('succeeded', command)
            }

            // Return to caller
            callback(err, r);
          });

          // Apply the call
          func.apply(this, args);
        } else {
          // Assume promise, push back the missing value
          args.push(callback);
          // Get the promise
          var promise = func.apply(this, args);
          // Return a new promise
          return new cursor.s.promiseLibrary(function(resolve, reject) {
            var startTime = new Date();
            // Emit the started event
            self.emit('started', command)
            // Execute the function
            promise.then(function(r) {
              // cursor id is zero, we can issue success command
              var command = {
                duration: (new Date().getTime() - startTime.getTime()),
                commandName: commandTranslation[x],
                requestId: requestId,
                operationId: cursor.operationId,
                connectionId: cursor.server.getConnection(),
                reply: cursor.cursorState.documents
              };

              // Emit the command
              self.emit('succeeded', command)
            }).catch(function(err) {
              // Command
              var command = {
                duration: (new Date().getTime() - startTime.getTime()),
                commandName: commandTranslation[x],
                requestId: requestId,
                operationId: ourOpId,
                connectionId: cursor.server.getConnection(),
                failure: err };

              // Emit the command
              self.emit('failed', command)
              // reject the promise
              reject(err);
            });
          });
        }
      }
    });
  });
}

inherits(Instrumentation, EventEmitter);

module.exports = Instrumentation;
