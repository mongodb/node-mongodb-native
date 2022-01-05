import * as crypto from 'crypto';

import type { Document } from '../bson';
import type { Db } from '../db';
import { MongoInvalidArgumentError } from '../error';
import type { Server } from '../sdam/server';
import type { ClientSession } from '../sessions';
import { Callback, emitWarningOnce, getTopology } from '../utils';
import { CommandOperation, CommandOperationOptions } from './command';
import { Aspect, defineAspects } from './operation';

/** @public */
export interface RoleSpecification {
  /**
   * A role grants privileges to perform sets of actions on defined resources.
   * A given role applies to the database on which it is defined and can grant access down to a collection level of granularity.
   */
  role: string;
  /** The database this user's role should effect. */
  db: string;
}

/** @public */
export interface AddUserOptions extends CommandOperationOptions {
  /** @deprecated Please use db.command('createUser', ...) instead for this option */
  digestPassword?: null;
  /** Roles associated with the created user */
  roles?: string | string[] | RoleSpecification | RoleSpecification[];
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
        new MongoInvalidArgumentError(
          'Option "digestPassword" not supported via addUser, use db.command(...) instead'
        )
      );
    }

    let roles;
    if (!options.roles || (Array.isArray(options.roles) && options.roles.length === 0)) {
      emitWarningOnce(
        'Creating a user without roles is deprecated. Defaults to "root" if db is "admin" or "dbOwner" otherwise'
      );
      if (db.databaseName.toLowerCase() === 'admin') {
        roles = ['root'];
      } else {
        roles = ['dbOwner'];
      }
    } else {
      roles = Array.isArray(options.roles) ? options.roles : [options.roles];
    }

    const digestPassword = getTopology(db).lastHello().maxWireVersion >= 7;

    let userPassword = password;

    if (!digestPassword) {
      // Use node md5 generator
      const md5 = crypto.createHash('md5');
      // Generate keys used for authentication
      md5.update(`${username}:mongo:${password}`);
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
