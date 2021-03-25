import { expectType } from 'tsd';

import { Db } from '../../src/db';
import { MongoClient } from '../../src/mongo_client';
import type { Movie } from './example_schemas';

const db = new Db(new MongoClient(''), '');
const collection = db.collection<Movie>('');

// Ensure distinct takes all keys of the schema plus '_id'
const x = (null as unknown) as Parameters<typeof collection.distinct>[0];
expectType<'_id' | keyof Movie>(x);
