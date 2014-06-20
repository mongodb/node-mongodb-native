var checkCollectionName = require('./utils').checkCollectionName
  , ObjectID = require('mongodb-core').BSON.ObjectID
  , f = require('util').format
  , shallowClone = require('./utils').shallowClone
  , ReadPreference = require('./read_preference')
  , Cursor = require('./cursor')

var Collection = function(db, topology, databaseName, collectionName, pkFactory, options) {  
  checkCollectionName(collectionName);

  // Unpack variables
  var internalHint = null;
  var opts = options != null && ('object' === typeof options) ? options : {};
  var slaveOk = options == null || options.slaveOk == null ? db.slaveOk : options.slaveOk;
  var serializeFunctions = options == null || options.serializeFunctions == null ? db.serializeFunctions : options.serializeFunctions;
  var raw = options == null || options.raw == null ? db.raw : options.raw;
  var readPreference = null;
  var namespace = f("%s.%s", databaseName, collectionName);

  // Assign the right collection level readPreference
  if(options && options.readPreference) {
    readPreference = options.readPreference;
  } else if(db.options.readPreference) {
    readPreference = db.options.readPreference;
  }

  // Set custom primary key factory if provided
  pkFactory = pkFactory == null
    ? ObjectID
    : pkFactory;

  Object.defineProperty(this, 'writeConcern', {
    enumerable:true,
    get: function() { 
      var ops = {};
      if(options.w) ops.w = options.w;
      if(options.j) ops.w = options.j;
      if(options.fsync) ops.w = options.fsync;
      if(options.wtimeout) ops.w = options.wtimeout;
      return ops;
    }
  });  

  // Get write concern
  var writeConcern = function(target, db, col, options) {
    if(options.w || options.j || options.fsync) {
      target.writeConcern = options;
    } else if(col.writeConcern.w || col.writeConcern.j || col.writeConcern.fsync) {      
      target.writeConcern = col.writeConcern;
    } else if(db.writeConcern.w || db.writeConcern.j || db.writeConcern.fsync) {
      target.writeConcern = db.writeConcern;
    }

    return target
  }

  var testForFields = {
      limit: 1, sort: 1, fields:1, skip: 1, hint: 1, explain: 1, snapshot: 1, timeout: 1, tailable: 1, tailableRetryInterval: 1
    , numberOfRetries: 1, awaitdata: 1, exhaust: 1, batchSize: 1, returnKey: 1, maxScan: 1, min: 1, max: 1, showDiskLoc: 1
    , comment: 1, raw: 1, readPreference: 1, partial: 1, read: 1, dbName: 1, oplogReplay: 1, connection: 1
  };

  //
  // Find method
  //
  this.find = function() {
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
      var fieldKeys = Object.getOwnPropertyNames(fields);
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

    // Unpack options
    newOptions.skip = len > 3 ? args[2] : options.skip ? options.skip : 0;
    newOptions.limit = len > 3 ? args[3] : options.limit ? options.limit : 0;
    newOptions.raw = options.raw != null && typeof options.raw === 'boolean' ? options.raw : this.raw;
    newOptions.hint = options.hint != null ? shared.normalizeHintField(options.hint) : this.internalHint;
    newOptions.timeout = len == 5 ? args[4] : typeof options.timeout === 'undefined' ? undefined : options.timeout;
    // // If we have overridden slaveOk otherwise use the default db setting
    newOptions.slaveOk = options.slaveOk != null ? options.slaveOk : db.slaveOk;

    // Figure out the read preference
    var readPreference = function(options, db) {
      if(options.readPreference) return options;
      if(db.readPreference) options.readPreference = db.readPreference;
      return options;
    }

    // Add read preference if needed
    newOptions = readPreference(newOptions, db);
    // Set slave ok to true if read preference different from primary
    if(newOptions.readPreference != null
      && (newOptions.readPreference != 'primary' || newOptions.readPreference.mode != 'primary')) {
      newOptions.slaveOk = true;
    }

    // Build the find command
    var findCommand = {
        find: namespace
      , limit: newOptions.limit
      , skip: newOptions.skip
      , query: selector
    }
    // Create cursor options
    var cursorOptions = {};
    // Create the cursor
    return topology.cursor(namespace, findCommand, cursorOptions);
  };

  // Insert operations
  this.insert = function(docs, options, callback) {
    if(typeof options == 'function') callback = options, options = {};
    options = options || {};
    // Ensure we are operating on an array op docs
    docs = Array.isArray(docs) ? docs : [docs];

    // Add _id if not specified
    for(var i = 0; i < docs.length; i++) {
      if(docs[i]._id == null) docs[i]._id = new ObjectID();
    }

    // File inserts
    topology.insert(namespace, docs, options, function(err, result) {
      if(callback == null) return;
      if(err) return callback(err);   
      if(docs.length == 1) return callback(null, docs[0]);
      callback(null, docs);   
    });
  }

  // Save operation
  this.save = function(doc, options, callback) {
    if(typeof options == 'function') callback = options, options = {};
    options = options || {};

    // Get the write concern options
    var finalOptions = writeConcern(shallowClone(options), db, this, options);
    // Establish if we need to perform an insert or update
    if(doc._id) {
      return this.update(namespace)
    }

    // Insert the document
    this.insert([doc], options, function(e, r) {
      if(callback == null) return;
      if(err) return callback(err);   
      callback(null, doc);
    });
  }

  // findOne operation
  this.findOne = function() {    
    var self = this;
    var args = Array.prototype.slice.call(arguments, 0);
    var callback = args.pop();
    var cursor = this.find.apply(this, args).limit(-1).batchSize(1);
    
    // Return the item
    cursor.nextObject(function(err, item) {
      if(err != null) return callback(utils.toError(err), null);
      callback(null, item);
    });
  }
}

module.exports = Collection;