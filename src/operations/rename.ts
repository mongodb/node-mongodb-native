import type { Document } from '../bson';
import { Collection } from '../collection';
import { MongoServerError } from '../error';
import type { Server } from '../sdam/server';
import type { ClientSession } from '../sessions';
import { checkCollectionName } from '../utils';
import type { CommandOperationOptions } from './command';
import { Aspect, defineAspects } from './operation';
import { RunAdminCommandOperation } from './run_command';

/** @public */
export interface RenameOptions extends CommandOperationOptions {
  /** Drop the target name collection if it previously exists. */
  dropTarget?: boolean;
  /** Unclear */
  new_collection?: boolean;
}

/** @internal */
export class RenameOperation extends RunAdminCommandOperation {
  override options: RenameOptions;
  collection: Collection;
  newName: string;

  constructor(collection: Collection, newName: string, options: RenameOptions) {
    // Check the collection name
    checkCollectionName(newName);

    // Build the command
    const renameCollection = collection.namespace;
    const toCollection = collection.s.namespace.withCollection(newName).toString();
    const dropTarget = typeof options.dropTarget === 'boolean' ? options.dropTarget : false;
    const cmd = { renameCollection: renameCollection, to: toCollection, dropTarget: dropTarget };

    super(collection, cmd, options);
    this.options = options;
    this.collection = collection;
    this.newName = newName;
  }

  override async execute(server: Server, session: ClientSession | undefined): Promise<Collection> {
    const coll = this.collection;

    const doc = await super.execute(server, session);
    // We have an error
    if (doc?.errmsg) {
      throw new MongoServerError(doc);
    }

    const newColl: Collection<Document> = new Collection(coll.s.db, this.newName, coll.s.options);

    return newColl;
  }
}

defineAspects(RenameOperation, [Aspect.WRITE_OPERATION]);
