import { expectNotType, expectType } from 'tsd';

import { type CollectionInfo, type ListCollectionsCursor, MongoClient } from '../mongodb';

const db = new MongoClient('').db();

type EitherCollectionInfoResult = CollectionInfo | Pick<CollectionInfo, 'name' | 'type'>;

// We default to the CollectionInfo result type
expectType<ListCollectionsCursor<Pick<CollectionInfo, 'name' | 'type'> | CollectionInfo>>(
  db.listCollections()
);
// By default it isn't narrowed to either type
expectNotType<ListCollectionsCursor<Pick<CollectionInfo, 'name' | 'type'>>>(db.listCollections());
expectNotType<ListCollectionsCursor<CollectionInfo>>(db.listCollections());

// Testing each argument variation
db.listCollections();
db.listCollections({ a: 2 });
db.listCollections({ a: 2 }, { batchSize: 2 });

const collections = await db.listCollections().toArray();
expectType<EitherCollectionInfoResult[]>(collections);

const nameOnly = await db.listCollections({}, { nameOnly: true }).toArray();
expectType<Pick<CollectionInfo, 'name' | 'type'>[]>(nameOnly);

const fullInfo = await db.listCollections({}, { nameOnly: false }).toArray();
expectType<CollectionInfo[]>(fullInfo);

const couldBeEither = await db.listCollections({}, { nameOnly: Math.random() > 0.5 }).toArray();
expectType<EitherCollectionInfoResult[]>(couldBeEither);

// Showing here that:
// regardless of the option the generic parameter can be used to coerce the result if need be
// note the nameOnly: false, yet strings are returned
const overridden = await db
  .listCollections<Pick<CollectionInfo, 'name' | 'type'>>({}, { nameOnly: false })
  .toArray();
expectType<Pick<CollectionInfo, 'name' | 'type'>[]>(overridden);
