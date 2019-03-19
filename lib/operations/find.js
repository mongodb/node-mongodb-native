'use strict';

const OperationBase = require('./operation').OperationBase;
const decorateCommand = require('../utils').decorateCommand;
const decorateWithCollation = require('../utils').decorateWithCollation;
const decorateWithReadConcern = require('../utils').decorateWithReadConcern;
const formattedOrderClause = require('../utils').formattedOrderClause;
const handleCallback = require('../utils').handleCallback;
const MongoError = require('mongodb-core').MongoError;
const normalizeHintField = require('../utils').normalizeHintField;
const resolveReadPreference = require('../utils').resolveReadPreference;

const mergeKeys = ['ignoreUndefined'];

class FindOperation extends OperationBase {
  constructor(collection, selector, options) {
    super(options);

    this.collection = collection;
    this.selector = selector;
  }

  execute(callback) {
    const coll = this.collection;
    let selector = this.selector;
    let options = this.options;

    // Validate correctness off the selector
    const object = selector;
    if (Buffer.isBuffer(object)) {
      const object_size = object[0] | (object[1] << 8) | (object[2] << 16) | (object[3] << 24);
      if (object_size !== object.length) {
        const error = new Error(
          'query selector raw message size does not match message header size [' +
            object.length +
            '] != [' +
            object_size +
            ']'
        );
        error.name = 'MongoError';
        throw error;
      }
    }

    // Check special case where we are using an objectId
    if (selector != null && selector._bsontype === 'ObjectID') {
      selector = { _id: selector };
    }

    if (!options) options = {};

    let projection = options.projection || options.fields;

    if (projection && !Buffer.isBuffer(projection) && Array.isArray(projection)) {
      projection = projection.length
        ? projection.reduce((result, field) => {
            result[field] = 1;
            return result;
          }, {})
        : { _id: 1 };
    }

    // Make a shallow copy of options
    let newOptions = Object.assign({}, options);

    // Make a shallow copy of the collection options
    for (let key in coll.s.options) {
      if (mergeKeys.indexOf(key) !== -1) {
        newOptions[key] = coll.s.options[key];
      }
    }

    // Unpack options
    newOptions.skip = options.skip ? options.skip : 0;
    newOptions.limit = options.limit ? options.limit : 0;
    newOptions.raw = typeof options.raw === 'boolean' ? options.raw : coll.s.raw;
    newOptions.hint =
      options.hint != null ? normalizeHintField(options.hint) : coll.s.collectionHint;
    newOptions.timeout = typeof options.timeout === 'undefined' ? undefined : options.timeout;
    // // If we have overridden slaveOk otherwise use the default db setting
    newOptions.slaveOk = options.slaveOk != null ? options.slaveOk : coll.s.db.slaveOk;

    // Add read preference if needed
    newOptions.readPreference = resolveReadPreference(newOptions, {
      db: coll.s.db,
      collection: coll
    });

    // Set slave ok to true if read preference different from primary
    if (
      newOptions.readPreference != null &&
      (newOptions.readPreference !== 'primary' || newOptions.readPreference.mode !== 'primary')
    ) {
      newOptions.slaveOk = true;
    }

    // Ensure the query is an object
    if (selector != null && typeof selector !== 'object') {
      throw MongoError.create({ message: 'query selector must be an object', driver: true });
    }

    // Build the find command
    const findCommand = {
      find: coll.s.namespace,
      limit: newOptions.limit,
      skip: newOptions.skip,
      query: selector
    };

    // Ensure we use the right await data option
    if (typeof newOptions.awaitdata === 'boolean') {
      newOptions.awaitData = newOptions.awaitdata;
    }

    // Translate to new command option noCursorTimeout
    if (typeof newOptions.timeout === 'boolean') newOptions.noCursorTimeout = newOptions.timeout;

    decorateCommand(findCommand, newOptions, ['session', 'collation']);

    if (projection) findCommand.fields = projection;

    // Add db object to the new options
    newOptions.db = coll.s.db;

    // Add the promise library
    newOptions.promiseLibrary = coll.s.promiseLibrary;

    // Set raw if available at collection level
    if (newOptions.raw == null && typeof coll.s.raw === 'boolean') newOptions.raw = coll.s.raw;
    // Set promoteLongs if available at collection level
    if (newOptions.promoteLongs == null && typeof coll.s.promoteLongs === 'boolean')
      newOptions.promoteLongs = coll.s.promoteLongs;
    if (newOptions.promoteValues == null && typeof coll.s.promoteValues === 'boolean')
      newOptions.promoteValues = coll.s.promoteValues;
    if (newOptions.promoteBuffers == null && typeof coll.s.promoteBuffers === 'boolean')
      newOptions.promoteBuffers = coll.s.promoteBuffers;

    // Sort options
    if (findCommand.sort) {
      findCommand.sort = formattedOrderClause(findCommand.sort);
    }

    // Set the readConcern
    decorateWithReadConcern(findCommand, coll, options);

    // Decorate find command with collation options
    try {
      decorateWithCollation(findCommand, coll, options);
    } catch (err) {
      if (typeof callback === 'function') return callback(err, null);
      throw err;
    }

    const cursor = coll.s.topology.cursor(coll.s.namespace, findCommand, newOptions);

    return typeof callback === 'function' ? handleCallback(callback, null, cursor) : cursor;
  }
}

module.exports = FindOperation;
