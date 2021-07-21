import type { Readable } from 'stream';
import { expectNotType, expectType } from 'tsd';
import { FindCursor, MongoClient } from '../../../src/index';

// TODO(NODE-3346): Improve these tests to use expect assertions more

const client = new MongoClient('');
const db = client.db('test');
const collection = db.collection<{ age: number }>('test.find');

const cursor = collection
  .find()
  .addCursorFlag('tailable', true)
  .addQueryModifier('', true)
  .batchSize(1)
  .comment('')
  .filter({ a: 1 })
  .hint({ age: 1 })
  .hint('age_1')
  .limit(1)
  .max({ age: 130 })
  .min({ age: 18 })
  .maxAwaitTimeMS(1)
  .maxTimeMS(1)
  .project({})
  .returnKey(true)
  .showRecordId(true)
  .skip(1)
  .sort({})
  .map(result => ({ foo: result.age }));

expectType<FindCursor<{ foo: number }>>(cursor);
expectType<Readable>(cursor.stream());

collection.find().project({});
collection.find().project({ notExistingField: 1 });
collection.find().sort({ text: { $meta: 'textScore' }, notExistingField: -1 });
collection.find().sort({});

interface TypedDoc {
  name: string;
  age: number;
  listOfNumbers: number[];
  tag: {
    name: string;
  };
}
const typedCollection = db.collection<TypedDoc>('test');
typedCollection.find({ name: 'name' }, {}).map(x => x.tag);
typedCollection.find({ 'tag.name': 'name' }, {});
typedCollection
  .find({ 'tag.name': 'name' }, { projection: { 'tag.name': 1, max: { $max: [] } } })
  .sort({ score: { $meta: 'textScore' } });

expectType<{ name: string }[]>(
  (
    await typedCollection
      .find({ 'tag.name': 'name' }, { projection: { name: 1, max: { $max: [] } } })
      .toArray()
  ).map(x => x.tag)
);

// override the collection type
typedCollection
  .find<{ name2: string; age2: number }>({ name: '123' }, { projection: { age2: 1 } })
  .map(x => x.name2 && x.age2);
typedCollection.find({ name: '123' }, { projection: { age: 1 } }).map(x => x.tag);

// A known key with a constant projection
expectType<{ name: string }[]>(await typedCollection.find().project({ name: 1 }).toArray());
expectNotType<{ age: number }[]>(await typedCollection.find().project({ name: 1 }).toArray());

// An unknown key
expectType<{ notExistingField: unknown }[]>(
  await typedCollection.find().project({ notExistingField: 1 }).toArray()
);
expectNotType<TypedDoc[]>(await typedCollection.find().project({ notExistingField: 1 }).toArray());

// Projection operator
expectType<{ listOfNumbers: number[] }[]>(
  await typedCollection
    .find()
    .project({ listOfNumbers: { $slice: [0, 4] } })
    .toArray()
);

// Using the override parameter works
expectType<{ name: string }[]>(
  await typedCollection
    .find()
    .project<{ name: string }>({ name: 1 })
    .toArray()
);

void async function () {
  for await (const item of cursor) {
    expectNotType<{ foo: number } | null>(item);
    expectType<number>(item.foo);
  }
};
