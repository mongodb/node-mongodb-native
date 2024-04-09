import { expectAssignable, expectType } from 'tsd';

import { MongoClient } from '../../src';
import { type IndexDescriptionCompact, type IndexDescriptionInfo } from '../mongodb';

const client = new MongoClient('');
const db = client.db('test');
const collection = db.collection('test.find');

const exampleFullIndexes: IndexDescriptionInfo[] = [
  { v: 2, key: { _id: 1 }, name: '_id_' },
  { v: 2, key: { listingName: 'hashed' }, name: 'listingName_hashed' },
  {
    v: 2,
    key: { 'auctionDetails.listingId': 1 },
    name: 'auctionDetails_listingId_1',
    unique: true
  }
];
const exampleCompactIndexes: IndexDescriptionCompact = {
  _id_: [['_id', 1]],
  listingName_hashed: [['listingName', 'hashed']],
  auctionDetails_listingId_1: [['auctionDetails.listingId', 1]]
};

const ambiguousFullness = Math.random() > 0.5;

// test Collection.prototype.indexes

const defaultIndexes = await collection.indexes();
const emptyOptionsIndexes = await collection.indexes({});
const fullIndexes = await collection.indexes({ full: true });
const notFullIndexes = await collection.indexes({ full: false });
const ambiguousIndexes = await collection.indexes({ full: ambiguousFullness });

expectAssignable<typeof fullIndexes>(exampleFullIndexes);
expectAssignable<typeof ambiguousIndexes>(exampleFullIndexes);
expectAssignable<typeof ambiguousIndexes>(exampleCompactIndexes);
expectAssignable<typeof notFullIndexes>(exampleCompactIndexes);

expectType<IndexDescriptionInfo[]>(defaultIndexes);
expectType<IndexDescriptionInfo[]>(emptyOptionsIndexes);
expectType<IndexDescriptionInfo[]>(fullIndexes);
expectType<IndexDescriptionCompact>(notFullIndexes);
expectType<IndexDescriptionInfo[] | IndexDescriptionCompact>(ambiguousIndexes);

// test Collection.prototype.indexInformation

const defaultIndexInfo = await collection.indexInformation();
const emptyOptionsIndexInfo = await collection.indexInformation({});
const fullIndexInfo = await collection.indexInformation({ full: true });
const notFullIndexInfo = await collection.indexInformation({ full: false });
const ambiguousIndexInfo = await collection.indexInformation({ full: ambiguousFullness });

expectAssignable<typeof fullIndexInfo>(exampleFullIndexes);
expectAssignable<typeof ambiguousIndexInfo>(exampleFullIndexes);
expectAssignable<typeof ambiguousIndexInfo>(exampleCompactIndexes);
expectAssignable<typeof notFullIndexInfo>(exampleCompactIndexes);

expectType<IndexDescriptionCompact>(defaultIndexInfo);
expectType<IndexDescriptionCompact>(emptyOptionsIndexInfo);
expectType<IndexDescriptionInfo[]>(fullIndexInfo);
expectType<IndexDescriptionCompact>(notFullIndexInfo);
expectType<IndexDescriptionInfo[] | IndexDescriptionCompact>(ambiguousIndexInfo);

// Explicit check for iterable result
for (const index of await collection.indexes()) {
  expectType<IndexDescriptionInfo>(index);
}

// test Db.prototype.indexInformation

const dbDefaultIndexInfo = await db.indexInformation('some-collection');
const dbEmptyOptionsIndexInfo = await db.indexInformation('some-collection', {});
const dbFullIndexInfo = await db.indexInformation('some-collection', { full: true });
const dbNotFullIndexInfo = await db.indexInformation('some-collection', { full: false });
const dbAmbiguousIndexInfo = await db.indexInformation('some-collection', {
  full: ambiguousFullness
});

expectAssignable<typeof dbFullIndexInfo>(exampleFullIndexes);
expectAssignable<typeof dbAmbiguousIndexInfo>(exampleFullIndexes);
expectAssignable<typeof dbAmbiguousIndexInfo>(exampleCompactIndexes);

expectType<IndexDescriptionCompact>(dbDefaultIndexInfo);
expectType<IndexDescriptionCompact>(dbEmptyOptionsIndexInfo);
expectType<IndexDescriptionInfo[]>(dbFullIndexInfo);
expectType<IndexDescriptionCompact>(dbNotFullIndexInfo);
expectType<IndexDescriptionInfo[] | IndexDescriptionCompact>(dbAmbiguousIndexInfo);
