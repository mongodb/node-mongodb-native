import type { Readable } from 'stream';
import { expectNotType, expectType } from 'tsd';

import { Db, type Document, type FindCursor, MongoClient } from '../../../src';

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
  // .project({}) -> projections removes the types from the returned documents
  .returnKey(true)
  .showRecordId(true)
  .skip(1)
  .sort({})
  .map(result => ({ foo: result.age }));

const cursorStream = cursor.stream();
expectType<FindCursor<{ foo: number }>>(cursor);
expectType<Readable & AsyncIterable<{ foo: number }>>(cursorStream);
expectType<FindCursor<Document>>(cursor.project({}));
(async () => {
  for await (const doc of cursorStream) {
    expectType<{ foo: number }>(doc);
  }
})();

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
expectType<Document[]>(await typedCollection.find().project({ name: 1 }).toArray());
expectNotType<{ age: string }[]>(await typedCollection.find().project({ name: 1 }).toArray());

// An unknown key
expectType<Document[]>(await typedCollection.find().project({ notExistingField: 1 }).toArray());
expectType<{ a: bigint }[]>(
  await typedCollection.find().project<{ a: bigint }>({ notExistingField: 1 }).toArray()
);

// Projection operator
expectType<{ listOfNumbers: number[] }[]>(
  await typedCollection
    .find()
    .project<{ listOfNumbers: number[] }>({ listOfNumbers: { $slice: [0, 4] } })
    .toArray()
);

// Using the override parameter works
expectType<{ name: string }[]>(
  await typedCollection.find().project<{ name: string }>({ name: 1 }).toArray()
);

void async function () {
  for await (const item of cursor) {
    expectNotType<{ foo: number } | null>(item);
    expectType<number>(item.foo);
  }
};

interface InternalMeme {
  _id: string;
  owner: string;
  receiver: string;
  createdAt: Date;
  expiredAt: Date;
  description: string;
  likes: string;
  private: string;
  replyTo: string;
  imageUrl: string;
}

interface PublicMeme {
  myId: string;
  owner: string;
  likes: number;
  someRandomProp: boolean; // Projection makes no enforcement on anything
  // the convenience parameter project<X>() allows you to define a return type,
  // otherwise projections returns generic document
}

const publicMemeProjection = {
  myId: { $toString: '$_id' },
  owner: { $toString: '$owner' },
  receiver: { $toString: '$receiver' },
  likes: '$totalLikes' // <== (NODE-3454) cause of TS2345 error: Argument of type T is not assignable to parameter of type U
};
const memeCollection = new Db(new MongoClient(''), '').collection<InternalMeme>('memes');

expectType<PublicMeme[]>(
  await memeCollection
    .find({ _id: { $in: [] } })
    .project<PublicMeme>(publicMemeProjection) // <==
    .toArray()
);

// Does not return whatever the publicMemeProjection states, returns generic Document
expectNotType<InternalMeme[]>(
  await memeCollection
    .find({ _id: { $in: [] } })
    .project(publicMemeProjection)
    .toArray()
);
expectType<Document[]>(
  await memeCollection
    .find({ _id: { $in: [] } })
    .project(publicMemeProjection)
    .toArray()
);

// Returns generic document when there is no schema
expectType<Document[]>(
  await new Db(new MongoClient(''), '')
    .collection('memes')
    .find({ _id: { $in: [] } })
    .project(publicMemeProjection)
    .toArray()
);

// Returns projection override when one is specified on a collection with no schema
expectType<InternalMeme[]>(
  await new Db(new MongoClient(''), '')
    .collection('memes')
    .find({ _id: { $in: [] } })
    .project<InternalMeme>(publicMemeProjection)
    .toArray()
);
