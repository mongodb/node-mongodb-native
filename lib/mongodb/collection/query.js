var ObjectID = require('bson').ObjectID
  , Long = require('bson').Long
  , DbCommand = require('../commands/db_command').DbCommand
  , CommandCursor = require('../command_cursor').CommandCursor
  , Scope = require('../scope').Scope
  , shared = require('./shared')
  , utils = require('../utils');

var testForFields = {
    limit: 1, sort: 1, fields:1, skip: 1, hint: 1, explain: 1, snapshot: 1, timeout: 1, tailable: 1, tailableRetryInterval: 1
  , numberOfRetries: 1, awaitdata: 1, exhaust: 1, batchSize: 1, returnKey: 1, maxScan: 1, min: 1, max: 1, showDiskLoc: 1
  , comment: 1, raw: 1, readPreference: 1, partial: 1, read: 1, dbName: 1, oplogReplay: 1, connection: 1
};

//
// Find method
//
var find = function find () {
  var options
    , args = Array.prototype.slice.call(arguments, 0)
    , has_callback = typeof args[args.length - 1] === 'function'
    , has_weird_callback = typeof args[0] === 'function'
    , callback = has_callback ? args.pop() : (has_weird_callback ? args.shift() : null)
    , len = args.length
    , selector = len >= 1 ? args[0] : {}
    , fields = len >= 2 ? args[1] : undefined;

  if(len === 1 && has_weird_callback) {
    // backwards compat for callback?, options case
    selector = {};
    options = args[0];
  }

  if(len === 2 && !Array.isArray(fields)) {
    var fieldKeys = Object.keys(fields);
    var is_option = false;

    for(var i = 0; i < fieldKeys.length; i++) {
      if(testForFields[fieldKeys[i]] != null) {
        is_option = true;
        break;
      }
    }

    if(is_option) {
      options = fields;
      fields = undefined;
    } else {
      options = {};
    }
  } else if(len === 2 && Array.isArray(fields) && !Array.isArray(fields[0])) {
    var newFields = {};
    // Rewrite the array
    for(var i = 0; i < fields.length; i++) {
      newFields[fields[i]] = 1;
    }
    // Set the fields
    fields = newFields;
  }

  if(3 === len) {
    options = args[2];
  }

  // Ensure selector is not null
  selector = selector == null ? {} : selector;
  // Validate correctness off the selector
  var object = selector;
  if(Buffer.isBuffer(object)) {
    var object_size = object[0] | object[1] << 8 | object[2] << 16 | object[3] << 24;
    if(object_size != object.length)  {
      var error = new Error("query selector raw message size does not match message header size [" + object.length + "] != [" + object_size + "]");
      error.name = 'MongoError';
      throw error;
    }
  }

  // Validate correctness of the field selector
  var object = fields;
  if(Buffer.isBuffer(object)) {
    var object_size = object[0] | object[1] << 8 | object[2] << 16 | object[3] << 24;
    if(object_size != object.length)  {
      var error = new Error("query fields raw message size does not match message header size [" + object.length + "] != [" + object_size + "]");
      error.name = 'MongoError';
      throw error;
    }
  }

  // Check special case where we are using an objectId
  if(selector instanceof ObjectID || (selector != null && selector._bsontype == 'ObjectID')) {
    selector = {_id:selector};
  }

  // If it's a serialized fields field we need to just let it through
  // user be warned it better be good
  if(options && options.fields && !(Buffer.isBuffer(options.fields))) {
    fields = {};

    if(Array.isArray(options.fields)) {
      if(!options.fields.length) {
        fields['_id'] = 1;
      } else {
        for (var i = 0, l = options.fields.length; i < l; i++) {
          fields[options.fields[i]] = 1;
        }
      }
    } else {
      fields = options.fields;
    }
  }

  if (!options) options = {};

  var newOptions = {};
  // Make a shallow copy of options
  for (var key in options) {
    newOptions[key] = options[key];
  }

  newOptions.skip = len > 3 ? args[2] : options.skip ? options.skip : 0;
  newOptions.limit = len > 3 ? args[3] : options.limit ? options.limit : 0;
  newOptions.raw = options.raw != null && typeof options.raw === 'boolean' ? options.raw : this.raw;
  newOptions.hint = options.hint != null ? shared.normalizeHintField(options.hint) : this.internalHint;
  newOptions.timeout = len == 5 ? args[4] : typeof options.timeout === 'undefined' ? undefined : options.timeout;
  // If we have overridden slaveOk otherwise use the default db setting
  newOptions.slaveOk = options.slaveOk != null ? options.slaveOk : this.db.slaveOk;

  // Set option
  var o = newOptions;
  // Support read/readPreference
  if(o["read"] != null) o["readPreference"] = o["read"];
  // If no readPreference specified set the collection level readPreference
  o.readPreference = o.readPreference ? o.readPreference : this.readPreference;
  // If still no readPreference specified set the db level
  o.readPreference = o.readPreference ? o.readPreference : this.db.options.readPreference;
  // Set slaveok if needed
  if(o.readPreference == "secondary" || o.read == "secondaryOnly") o.slaveOk = true;

  // Ensure the query is an object
  if(selector != null && typeof selector != 'object') {
    throw utils.toError("query selector must be an object");
  }

  // Set the selector
  o.selector = selector;

  // Create precursor
  var scope = new Scope(this, {}, fields, o);
  // Callback for backward compatibility
  if(callback) return callback(null, scope.find(selector));
  // Return the pre cursor object
  return scope.find(selector);
};

var findOne = function findOne () {
  var self = this;
  var args = Array.prototype.slice.call(arguments, 0);
  var callback = args.pop();
  var cursor = this.find.apply(this, args).limit(-1).batchSize(1);

  // Return the item
  cursor.nextObject(function(err, item) {
    if(err != null) return callback(utils.toError(err), null);
    callback(null, item);
  });
};

var parallelCollectionScan = function parallelCollectionScan (options, callback) {
  var self = this;

  if(typeof options == 'function') {
    callback = options;
    options = {numCursors: 1};
  }

  // Set number of cursors to 1
  options.numCursors = options.numCursors || 1;
  options.batchSize = options.batchSize || 1000;

  // Set read preference if we set one
  options.readPreference = shared._getReadConcern(this, options);

  // Create command object
  var commandObject = {
      parallelCollectionScan: this.collectionName
    , numCursors: options.numCursors
  }

  // Execute the command
  this.db.command(commandObject, options, function(err, result) {
    if(err) return callback(err, null);
    if(result == null) return callback(new Error("no result returned for parallelCollectionScan"), null);

    var cursors = [];
    // Create command cursors for each item
    for(var i = 0; i < result.cursors.length; i++) {
      var rawId = result.cursors[i].cursor.id
      // Convert cursorId to Long if needed
      var cursorId = typeof rawId == 'number' ? Long.fromNumber(rawId) : rawId;

      // Command cursor options
      var commandOptions = {
          batchSize: options.batchSize
        , cursorId: cursorId
        , items: result.cursors[i].cursor.firstBatch
      }

      // Add a command cursor
      cursors.push(new CommandCursor(self.db, self, {}, commandOptions));
    }

    callback(null, cursors);
  });
}

exports.find = find;
exports.findOne = findOne;
exports.parallelCollectionScan = parallelCollectionScan;
