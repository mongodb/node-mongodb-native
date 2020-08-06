import * as crypto from 'crypto';
import { Aspect, defineAspects } from './operation';
import { CommandOperation, CommandOperationOptions } from './command';
import { handleCallback, toError } from '../utils';
import type { Callback, Document } from '../types';
import type { Server } from '../sdam/server';
import type { Db } from '../db';

export interface AddUserOperationOptions extends CommandOperationOptions {
  digestPassword: null;
  roles: string | string[];
  customData: Document;
}

export class AddUserOperation extends CommandOperation {
  db: Db;
  username: string;
  password?: string;

  constructor(
    db: Db,
    username: string,
    password: string | undefined,
    options: AddUserOperationOptions
  ) {
    super(db, options);

    this.db = db;
    this.username = username;
    this.password = password;
  }

  execute(server: Server, callback: Callback): void {
    const db = this.db;
    const username = this.username;
    const password = this.password;
    const options = this.options;

    // Error out if digestPassword set
    if (options.digestPassword != null) {
      return callback(
        toError(
          "The digestPassword option is not supported via add_user. Please use db.command('createUser', ...) instead for this option."
        )
      );
    }

    // Get additional values
    let roles = Array.isArray(options.roles) ? options.roles : [];

    // If not roles defined print deprecated message
    // TODO: handle deprecation properly
    if (roles.length === 0) {
      console.warn('Creating a user without roles is deprecated in MongoDB >= 2.6');
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
    const command: Document = {
      createUser: username,
      customData: options.customData || {},
      roles: roles,
      digestPassword
    };

    // No password
    if (typeof password === 'string') {
      command.pwd = userPassword;
    }

    super.executeCommand(server, command, (err, r) => {
      if (!err) {
        handleCallback(callback, err, r);
        return;
      }

      handleCallback(callback, err, null);
      return;
    });
  }
}

defineAspects(AddUserOperation, [Aspect.WRITE_OPERATION, Aspect.EXECUTE_WITH_SELECTION]);
