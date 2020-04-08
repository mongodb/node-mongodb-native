'use strict';

const executeCommand = require('./db_ops').executeCommand;
const executeDbAdminCommand = require('./db_ops').executeDbAdminCommand;

// type imports
/** @typedef {import('../admin')} Admin */

/**
 * Get ReplicaSet status
 *
 * @param {Admin} admin collection instance.
 * @param {object} [options] Optional settings. See Admin.prototype.replSetGetStatus for a list of options.
 * @param {AdminResultCallback} [callback] The command result callback.
 */
function replSetGetStatus(admin, options, callback) {
  executeDbAdminCommand(admin.s.db, { replSetGetStatus: 1 }, options, callback);
}

/**
 * Retrieve this db's server status.
 *
 * @param {Admin} admin collection instance.
 * @param {object} [options] Optional settings. See Admin.prototype.serverStatus for a list of options.
 * @param {AdminResultCallback} [callback] The command result callback
 */
function serverStatus(admin, options, callback) {
  executeDbAdminCommand(admin.s.db, { serverStatus: 1 }, options, callback);
}

/**
 * Validate an existing collection
 *
 * @param {Admin} admin collection instance.
 * @param {string} collectionName The name of the collection to validate.
 * @param {object} [options] Optional settings. See Admin.prototype.validateCollection for a list of options.
 * @param {AdminResultCallback} [callback] The command result callback.
 */
function validateCollection(admin, collectionName, options, callback) {
  const command = { validate: collectionName };
  const keys = Object.keys(options);

  // Decorate command with extra options
  for (let i = 0; i < keys.length; i++) {
    if (Object.prototype.hasOwnProperty.call(options, keys[i]) && keys[i] !== 'session') {
      command[keys[i]] = options[keys[i]];
    }
  }

  executeCommand(admin.s.db, command, options, (err, doc) => {
    if (err != null) return callback(err, null);

    if (doc.ok === 0) return callback(new Error('Error with validate command'), null);
    if (doc.result != null && doc.result.constructor !== String)
      return callback(new Error('Error with validation data'), null);
    if (doc.result != null && doc.result.match(/exception|corrupt/) != null)
      return callback(new Error('Error: invalid collection ' + collectionName), null);
    if (doc.valid != null && !doc.valid)
      return callback(new Error('Error: invalid collection ' + collectionName), null);

    return callback(null, doc);
  });
}

/**
 * @callback AdminResultCallback
 * @param {Error} [error]
 * @param {any} [doc]
 */

module.exports = { replSetGetStatus, serverStatus, validateCollection };
