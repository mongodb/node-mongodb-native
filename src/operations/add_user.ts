import * as crypto from 'crypto';
import { Aspect, defineAspects } from './operation';
import { CommandOperation, CommandOperationOptions } from './command';
import { MongoError } from '../error';
import { Callback, getTopology } from '../utils';
import type { Document } from '../bson';
import type { Server } from '../sdam/server';
import type { Db } from '../db';
import type { ClientSession } from '../sessions';

/** @public */
export interface AddUserOptions extends CommandOperationOptions {
  /** @deprecated Please use db.command('createUser', ...) instead for this option */
  digestPassword?: null;
  /** Roles associated with the created user (only Mongodb 2.6 or higher) */
  roles?: string | string[];
  /** Custom data associated with the user (only Mongodb 2.6 or higher) */
  customData?: Document;
}

/** @internal */
export class AddUserOperation extends CommandOperation<Document> {
  options: AddUserOptions;
  db: Db;
  username: string;
  password?: string;

  constructor(db: Db, username: string, password: string | undefined, options?: AddUserOptions) {
    super(db, options);

    // Special case where there is no password ($external users)
    if (typeof username === 'string' && password != null && typeof password === 'object') {
      options = password;
      password = undefined;
    }

    this.db = db;
    this.username = username;
    this.password = password;
    this.options = options ?? {};
  }

  execute(server: Server, session: ClientSession, callback: Callback<Document>): void {
    const db = this.db;
    const username = this.username;
    const password = this.password;
    const options = this.options;

    // Error out if digestPassword set
    if (options.digestPassword != null) {
      return callback(
        new MongoError(
          'The digestPassword option is not supported via add_user. ' +
            "Please use db.command('createUser', ...) instead for this option."
        )
      );
    }

    // Get additional values
    let roles: string[] = [];
    if (Array.isArray(options.roles)) roles = options.roles;
    if (typeof options.roles === 'string') roles = [options.roles];

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

    const digestPassword = getTopology(db).lastIsMaster().maxWireVersion >= 7;

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

    super.executeCommand(server, session, command, callback);
  }
}

defineAspects(AddUserOperation, [Aspect.WRITE_OPERATION]);
