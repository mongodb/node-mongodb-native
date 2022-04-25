import type { Document } from '../bson';
import type { Db } from '../db';
import { MONGODB_ERROR_CODES, MongoServerError } from '../error';
import type { Server } from '../sdam/server';
import type { ClientSession } from '../sessions';
import type { Callback } from '../utils';
import { CommandOperation, CommandOperationOptions } from './command';
import { Aspect, defineAspects } from './operation';

/** @public */
export interface DropCollectionOptions extends CommandOperationOptions {
  /** @experimental */
  encryptedFields?: Document;
}

/** @internal */
export class DropCollectionOperation extends CommandOperation<boolean> {
  override options: DropCollectionOptions;
  db: Db;
  name: string;

  constructor(db: Db, name: string, options: DropCollectionOptions = {}) {
    super(db, options);
    this.db = db;
    this.options = options;
    this.name = name;
  }

  override execute(
    server: Server,
    session: ClientSession | undefined,
    callback: Callback<boolean>
  ): void {
    const db = this.db;
    const options = this.options;
    const name = this.name;
    const encryptedFieldsMap = db.s.client.options.autoEncryption?.encryptedFieldsMap;
    let encryptedFields: Document | undefined =
      options.encryptedFields ?? encryptedFieldsMap?.[`${db.databaseName}.${name}`];
    if (!encryptedFields && encryptedFieldsMap) {
      db.listCollections({ name }, { nameOnly: false }).toArray((err, result) => {
        if (err) {
          return callback(err);
        }

        encryptedFields = result?.[0]?.options?.encryptedFields;
        proceedAfterFetchingEncryptedFields(this);
      });
    } else {
      proceedAfterFetchingEncryptedFields(this);
    }

    function proceedAfterFetchingEncryptedFields(self: DropCollectionOperation) {
      self.executeWithoutEncryptedFieldsCheck(server, session, (err, result) => {
        if (err && (err as MongoServerError).code !== MONGODB_ERROR_CODES.NamespaceNotFound) {
          return callback(err);
        }

        if (!encryptedFields) {
          return callback(err, result);
        }

        const errorForMainOperation = err;

        const escCollection = encryptedFields.escCollection || `enxcol_.${name}.esc`;
        const eccCollection = encryptedFields.eccCollection || `enxcol_.${name}.ecc`;
        const ecocCollection = encryptedFields.ecocCollection || `enxcol_.${name}.ecoc`;
        new DropCollectionOperation(db, escCollection).executeWithoutEncryptedFieldsCheck(
          server,
          session,
          err => {
            if (err && (err as MongoServerError).code !== MONGODB_ERROR_CODES.NamespaceNotFound) {
              return callback(err);
            }

            new DropCollectionOperation(db, eccCollection).executeWithoutEncryptedFieldsCheck(
              server,
              session,
              err => {
                if (
                  err &&
                  (err as MongoServerError).code !== MONGODB_ERROR_CODES.NamespaceNotFound
                ) {
                  return callback(err);
                }

                new DropCollectionOperation(db, ecocCollection).executeWithoutEncryptedFieldsCheck(
                  server,
                  session,
                  err => {
                    if (
                      err &&
                      (err as MongoServerError).code !== MONGODB_ERROR_CODES.NamespaceNotFound
                    ) {
                      return callback(err);
                    }

                    return callback(errorForMainOperation, result);
                  }
                );
              }
            );
          }
        );
      });
    }
  }

  private executeWithoutEncryptedFieldsCheck(
    server: Server,
    session: ClientSession | undefined,
    callback: Callback<boolean>
  ): void {
    super.executeCommand(server, session, { drop: this.name }, (err, result) => {
      if (err) return callback(err);
      if (result.ok) return callback(undefined, true);
      callback(undefined, false);
    });
  }
}

/** @public */
export type DropDatabaseOptions = CommandOperationOptions;

/** @internal */
export class DropDatabaseOperation extends CommandOperation<boolean> {
  override options: DropDatabaseOptions;

  constructor(db: Db, options: DropDatabaseOptions) {
    super(db, options);
    this.options = options;
  }
  override execute(
    server: Server,
    session: ClientSession | undefined,
    callback: Callback<boolean>
  ): void {
    super.executeCommand(server, session, { dropDatabase: 1 }, (err, result) => {
      if (err) return callback(err);
      if (result.ok) return callback(undefined, true);
      callback(undefined, false);
    });
  }
}

defineAspects(DropCollectionOperation, [Aspect.WRITE_OPERATION]);
defineAspects(DropDatabaseOperation, [Aspect.WRITE_OPERATION]);
