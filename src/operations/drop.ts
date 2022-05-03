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
    (async () => {
      const db = this.db;
      const options = this.options;
      const name = this.name;

      const encryptedFieldsMap = db.s.client.options.autoEncryption?.encryptedFieldsMap;
      let encryptedFields: Document | undefined =
        options.encryptedFields ?? encryptedFieldsMap?.[`${db.databaseName}.${name}`];

      if (!encryptedFields && encryptedFieldsMap) {
        // If the MongoClient was configued with an encryptedFieldsMap,
        // and no encryptedFields config was available in it or explicitly
        // passed as an argument, the spec tells us to look one up using
        // listCollections().
        const listCollectionsResult = await db
          .listCollections({ name }, { nameOnly: false })
          .toArray();
        encryptedFields = listCollectionsResult?.[0]?.options?.encryptedFields;
      }

      let result;
      let errorForMainOperation;
      try {
        result = await this.executeWithoutEncryptedFieldsCheck(server, session);
      } catch (err) {
        if (
          !encryptedFields ||
          !(err instanceof MongoServerError) ||
          err.code !== MONGODB_ERROR_CODES.NamespaceNotFound
        ) {
          throw err;
        }
        // Save a possible NamespaceNotFound error for later
        // in the encryptedFields case, so that the auxilliary
        // collections will still be dropped.
        errorForMainOperation = err;
      }

      if (encryptedFields) {
        const escCollection = encryptedFields.escCollection || `enxcol_.${name}.esc`;
        const eccCollection = encryptedFields.eccCollection || `enxcol_.${name}.ecc`;
        const ecocCollection = encryptedFields.ecocCollection || `enxcol_.${name}.ecoc`;

        for (const collectionName of [escCollection, eccCollection, ecocCollection]) {
          // Drop auxilliary collections, ignoring potential NamespaceNotFound errors.
          const dropOp = new DropCollectionOperation(db, collectionName);
          try {
            await dropOp.executeWithoutEncryptedFieldsCheck(server, session);
          } catch (err) {
            if (
              !(err instanceof MongoServerError) ||
              err.code !== MONGODB_ERROR_CODES.NamespaceNotFound
            ) {
              throw err;
            }
          }
        }

        if (errorForMainOperation) {
          throw errorForMainOperation;
        }
      }

      return result;
    })().then(
      result => callback(undefined, result),
      err => callback(err)
    );
  }

  private executeWithoutEncryptedFieldsCheck(
    server: Server,
    session: ClientSession | undefined
  ): Promise<boolean> {
    return new Promise<boolean>((resolve, reject) => {
      super.executeCommand(server, session, { drop: this.name }, (err, result) => {
        if (err) return reject(err);
        resolve(!!result.ok);
      });
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
