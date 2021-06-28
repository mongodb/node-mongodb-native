import { expectType, expectNotType } from 'tsd';

import { MongoClient } from '../../src/mongo_client';
import type { CollectionInfo, ListCollectionsCursor } from '../../src/operations/list_collections';

const db = new MongoClient('').db();

// We default to the CollectionInfo result type
expectType<ListCollectionsCursor<CollectionInfo>>(db.listCollections());
// We do not return the string result, and since its a runtime option there's not a great TS way to capture this
expectNotType<ListCollectionsCursor<string>>(db.listCollections());

// toArray is a good way for TS users to keep their code simple
const collections = await db.listCollections().toArray();
expectType<CollectionInfo[]>(collections);

// toArray takes an override so here we can get an array of strings easily
const collectionNames = await db.listCollections({}, { nameOnly: true }).toArray<string>();
expectType<string[]>(collectionNames);
