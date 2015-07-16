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
      var ourOpId = operationIdGenerator.next();
      // Get the aruments
      var args = Array.prototype.slice.call(arguments, 0);
      var ns = args[0];
      var commandObj = args[1];
      var keys = Object.keys(commandObj);
      var commandName = keys[0];
      var db = ns.split('.')[0];

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

      // Get the callback
      var callback = args.pop();
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
  // Cursor
  //
  // ---------------------------------------------------------

  // Inject ourselves into the Cursor methods
  var methods = ['_find', '_getmore', '_killcursor'];
  var prototypes = [
    require('./cursor').prototype, require('./command_cursor').prototype,
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
        var db = this.ns.split('.')[0];

        // If we have a find method, set the operationId on the cursor
        if(x == '_find') {
          this.operationId = ourOpId;
          this.startTime = new Date();
        }

        // Emit the start event for the command
        var command = {
          // Returns the command.
          command: this.query,
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
          connectionId: this.server.getConnection()
        };

        // Emit the started event
        self.emit('started', command)

        // Get the aruments
        var args = Array.prototype.slice.call(arguments, 0);
        // Get the callback
        var callback = args.pop();
        args.push(function(err, r) {
          if(err) {
            // Command
            var command = {
              duration: (new Date().getTime() - cursor.startTime.getTime()),
              commandName: commandTranslation[x],
              requestId: requestId,
              operationId: ourOpId,
              connectionId: cursor.server.getConnection(),
              failure: err };
            // Emit the command
            self.emit('failed', command)
          } else { //if(connect.Long.ZERO.equals(cursor.cursorState.cursorId)) {
            // cursor id is zero, we can issue success command
            var command = {
              duration: (new Date().getTime() - cursor.startTime.getTime()),
              commandName: commandTranslation[x],
              requestId: requestId,
              operationId: cursor.operationId,
              connectionId: cursor.server.getConnection() };
            // Emit the command
            self.emit('succeeded', command)
          }

          // Return to caller
          callback(err, r);
        });

        // Apply the call
        func.apply(this, args);
      }
    });
  });
}

inherits(Instrumentation, EventEmitter);

module.exports = Instrumentation;
