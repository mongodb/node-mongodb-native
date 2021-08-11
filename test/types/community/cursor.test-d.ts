import type { Readable } from 'stream';
import { expectNotType, expectType } from 'tsd';
import { FindCursor, MongoClient, Document } from '../../../src/index';

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

expectType<FindCursor<{ foo: number }>>(cursor);
expectType<Readable>(cursor.stream());
expectType<FindCursor<Document>>(cursor.project({}));

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
// NODE-3468: Overriding the return type is no longer allowed
// typedCollection
//   .find<{ name2: string; age2: number }>({ name: '123' }, { projection: { age2: 1 } })
//   .map(x => x.name2 && x.age2);

// Chaining map calls changes the final cursor
expectType<FindCursor<{ a: string }>>(
  typedCollection
    .find({ name: '123' })
    .map(x => ({ name2: x.name, age2: x.age }))
    .map(({ name2, age2 }) => ({ a: `${name2}_${age2}` }))
);

typedCollection.find({ name: '123' }, { projection: { age: 1 } }).map(x => x.tag);

// A known key with a constant projection
// NODE-3468: projection returns a generic type and the override removal means no automatic type coercion
// expectType<{ name: string }[]>(await typedCollection.find().project({ name: 1 }).toArray());
//
expectType<Document[]>(await typedCollection.find().project({ name: 1 }).toArray());
expectNotType<{ age: number }[]>(await typedCollection.find().project({ name: 1 }).toArray());

// An unknown key -- NODE-3468: when using the project, your default return type is Document
expectNotType<{ notExistingField: unknown }[]>(
  await typedCollection.find().project({ notExistingField: 1 }).toArray()
);
expectNotType<TypedDoc[]>(await typedCollection.find().project({ notExistingField: 1 }).toArray());

// Projection operator -- NODE-3468: it is recommended that users override the T in project<T>()
expectType<{ listOfNumbers: number[] }[]>(
  await typedCollection
    .find()
    .project<{ listOfNumbers: number[] }>({ listOfNumbers: { $slice: [0, 4] } })
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
const memeCollection = db.collection<InternalMeme>('memes');

expectType<PublicMeme[]>(
  await memeCollection
    .find({ _id: { $in: [] } })
    .project<PublicMeme>(publicMemeProjection) // <==
    .toArray()
);

// Returns generic document when no override given
expectNotType<InternalMeme[]>(
  await memeCollection
    .find({ _id: { $in: [] } })
    .project(publicMemeProjection)
    .toArray()
);

expectType<FindCursor<Document>>(
  memeCollection.find({ _id: { $in: [] } }).project(publicMemeProjection)
);

expectNotType<FindCursor<Document>>(memeCollection.find({ _id: { $in: [] } }));
expectType<FindCursor<InternalMeme>>(memeCollection.find({ _id: { $in: [] } }));
``;

// Returns generic document when there is no schema
expectType<Document[]>(
  await db
    .collection('memes')
    .find({ _id: { $in: [] } })
    .project(publicMemeProjection)
    .toArray()
);
