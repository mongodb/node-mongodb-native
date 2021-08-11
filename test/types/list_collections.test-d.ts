import { expectType, expectNotType } from 'tsd';

import { MongoClient } from '../../src/mongo_client';
import type { CollectionInfo, ListCollectionsCursor } from '../../src/operations/list_collections';

const db = new MongoClient('').db();

type EitherCollectionInfoResult = CollectionInfo | Pick<CollectionInfo, 'name' | 'type'>;

// We default to the CollectionInfo result type
expectType<ListCollectionsCursor<CollectionInfo>>(db.listCollections());
// By default it isn't narrowed to either type
expectNotType<ListCollectionsCursor<Pick<CollectionInfo, 'name' | 'type'>>>(db.listCollections());
expectType<ListCollectionsCursor<CollectionInfo>>(db.listCollections());

// Testing each argument variation
db.listCollections();
db.listCollections({ a: 2 });
db.listCollections({ a: 2 }, { batchSize: 2 });

const collections = await db.listCollections().toArray();
expectNotType<EitherCollectionInfoResult[]>(collections);

const nameOnly = await db.listCollections({}, { nameOnly: true }).toArray();
expectType<Pick<CollectionInfo, 'name' | 'type'>[]>(nameOnly);

const fullInfo = await db.listCollections({}, { nameOnly: false }).toArray();
expectType<CollectionInfo[]>(fullInfo);

const cannotBeEither = await db.listCollections({}, { nameOnly: Math.random() > 0.5 }).toArray();
expectNotType<EitherCollectionInfoResult[]>(cannotBeEither);
expectType<CollectionInfo[]>(cannotBeEither);

// Showing here that:
// regardless of the option the generic parameter can be used to coerce the result if need be
// note the nameOnly: false, yet strings are returned
// NODE-3468: No longer permits overriding of return type via a generic
