'use strict';

const Aspect = require('./operation').Aspect;
const CommandOperation = require('./command');
const defineAspects = require('./operation').defineAspects;
const crypto = require('crypto');
const handleCallback = require('../utils').handleCallback;
const toError = require('../utils').toError;
const emitWarning = require('../utils').emitWarning;

class AddUserOperation extends CommandOperation {
  constructor(db, username, password, options) {
    super(db, options);

    this.username = username;
    this.password = password;
  }

  _buildCommand() {
    const db = this.db;
    const username = this.username;
    const password = this.password;
    const options = this.options;

    // Get additional values
    let roles = [];
    if (Array.isArray(options.roles)) roles = options.roles;
    if (typeof options.roles === 'string') roles = [options.roles];

    // If not roles defined print deprecated message
    // TODO: handle deprecation properly
    if (roles.length === 0) {
      emitWarning('Creating a user without roles is deprecated in MongoDB >= 2.6');
    }

    // Check the db name and add roles if needed
    if (
      (db.databaseName.toLowerCase() === 'admin' || options.dbName === 'admin') &&
      !Array.isArray(options.roles)
    ) {
      roles = ['root'];
    } else if (!Array.isArray(options.roles)) {
      roles = ['dbOwner'];
    }

    const digestPassword = db.s.topology.lastIsMaster().maxWireVersion >= 7;

    let userPassword = password;

    if (!digestPassword) {
      // Use node md5 generator
      const md5 = crypto.createHash('md5');
      // Generate keys used for authentication
      md5.update(username + ':mongo:' + password);
      userPassword = md5.digest('hex');
    }

    // Build the command to execute
    const command = {
      createUser: username,
      customData: options.customData || {},
      roles: roles,
      digestPassword
    };

    // No password
    if (typeof password === 'string') {
      command.pwd = userPassword;
    }

    return command;
  }

  execute(callback) {
    const options = this.options;

    // Error out if digestPassword set
    if (options.digestPassword != null) {
      return callback(
        toError(
          "The digestPassword option is not supported via add_user. Please use db.command('createUser', ...) instead for this option."
        )
      );
    }

    // Attempt to execute auth command
    super.execute((err, r) => {
      if (!err) {
        return handleCallback(callback, err, r);
      }

      return handleCallback(callback, err, null);
    });
  }
}

defineAspects(AddUserOperation, Aspect.WRITE_OPERATION);

module.exports = AddUserOperation;
