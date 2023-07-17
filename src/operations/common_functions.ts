import type { Document } from '../bson';
import type { Collection } from '../collection';
import type { Db } from '../db';
import { MongoTopologyClosedError } from '../error';
import type { ReadPreference } from '../read_preference';
import type { ClientSession } from '../sessions';
import { getTopology } from '../utils';

/** @public */
export interface IndexInformationOptions {
  full?: boolean;
  readPreference?: ReadPreference;
  session?: ClientSession;
}
/**
 * Retrieves this collections index info.
 *
 * @param db - The Db instance on which to retrieve the index info.
 * @param name - The name of the collection.
 */
export async function indexInformation(db: Db, name: string): Promise<any>;
export async function indexInformation(
  db: Db,
  name: string,
  options?: IndexInformationOptions
): Promise<any>;
export async function indexInformation(
  db: Db,
  name: string,
  options?: IndexInformationOptions
): Promise<any> {
  if (options == null) {
    options = {};
  }
  // If we specified full information
  const full = options.full == null ? false : options.full;
  const topology = getTopology(db);

  // Did the user destroy the topology
  if (topology.isDestroyed()) throw new MongoTopologyClosedError();
  // Process all the results from the index command and collection
  function processResults(indexes: any) {
    // Contains all the information
    const info: any = {};
    // Process all the indexes
    for (let i = 0; i < indexes.length; i++) {
      const index = indexes[i];
      // Let's unpack the object
      info[index.name] = [];
      for (const name in index.key) {
        info[index.name].push([name, index.key[name]]);
      }
    }

    return info;
  }

  // Get the list of indexes of the specified collection
  const indexes = await db.collection(name).listIndexes(options).toArray();
  if (!Array.isArray(indexes)) return [];
  if (full) return indexes;
  return processResults(indexes);
}

export function prepareDocs(
  coll: Collection,
  docs: Document[],
  options: { forceServerObjectId?: boolean }
): Document[] {
  const forceServerObjectId =
    typeof options.forceServerObjectId === 'boolean'
      ? options.forceServerObjectId
      : coll.s.db.options?.forceServerObjectId;

  // no need to modify the docs if server sets the ObjectId
  if (forceServerObjectId === true) {
    return docs;
  }

  return docs.map(doc => {
    if (doc._id == null) {
      doc._id = coll.s.pkFactory.createPk();
    }

    return doc;
  });
}
