import { expectType } from 'tsd';

import {
  AnyError,
  Callback,
  Collection,
  CreateCollectionOptions,
  MongoClient,
  ObjectId
} from '../../../mongodb';

const client = new MongoClient('');
const db = client.db('test');

interface SubTestSchema {
  field1: string;
  field2: string;
}

type FruitTypes = 'apple' | 'pear';

// test with collection type
interface TestSchema {
  _id: ObjectId;
  stringField: string;
  numberField: number;
  optionalNumberField?: number;
  dateField: Date;
  fruitTags: string[];
  maybeFruitTags?: FruitTypes[];
  readonlyFruitTags: ReadonlyArray<string>;
  subInterfaceField: SubTestSchema;
  subInterfaceArray: SubTestSchema[];
}

const options: CreateCollectionOptions = {};

// createCollection

expectType<Promise<Collection<TestSchema>>>(db.createCollection<TestSchema>('test'));

expectType<Promise<Collection<TestSchema>>>(db.createCollection<TestSchema>('test', options));

// ensure we can use the create collection in a promise based wrapper function
function extendedPromiseBasedCreateCollection(
  name: string,
  optionalOptions?: CreateCollectionOptions
): Promise<Collection<TestSchema>> {
  return db.createCollection<TestSchema>(name, optionalOptions);
}

expectType<Promise<Collection<TestSchema>>>(extendedPromiseBasedCreateCollection('test'));

expectType<void>(
  db.createCollection<TestSchema>('test', (err, collection) => {
    expectType<AnyError | undefined>(err);
    expectType<Collection<TestSchema> | undefined>(collection);
  })
);

expectType<void>(
  db.createCollection<TestSchema>('test', options, (err, collection) => {
    expectType<AnyError | undefined>(err);
    expectType<Collection<TestSchema> | undefined>(collection);
  })
);

// ensure we can use the create collection in a callback based wrapper function
function extendedCallbackBasedCreateCollection(
  name: string,
  callback: Callback<Collection<TestSchema>>,
  optionalOptions?: CreateCollectionOptions
): void {
  db.createCollection<TestSchema>(name, optionalOptions, callback);
}

expectType<void>(
  extendedCallbackBasedCreateCollection('test', (err, collection) => {
    expectType<AnyError | undefined>(err);
    expectType<Collection<TestSchema> | undefined>(collection);
  })
);
