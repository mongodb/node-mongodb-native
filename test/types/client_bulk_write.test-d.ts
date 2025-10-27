import { expectAssignable, expectError, expectNotAssignable, expectType } from 'tsd';

import {
  type ClientBulkWriteModel,
  type ClientDeleteManyModel,
  type ClientDeleteOneModel,
  type ClientInsertOneModel,
  type ClientReplaceOneModel,
  type ClientUpdateManyModel,
  type ClientUpdateOneModel,
  type Document,
  type Filter,
  type MongoClient,
  type OptionalId,
  type UpdateFilter,
  type UUID,
  type WithoutId
} from '../../src';

declare const client: MongoClient;
type Book = { title: string; released: Date };
type Author = { name: string; published: number };
type Store = { _id: UUID };

// Baseline check that schema modifies the following fields for each type.
declare const clientInsertOneModel: ClientInsertOneModel<Book>;
expectType<OptionalId<Book>>(clientInsertOneModel.document);

declare const clientReplaceOneModel: ClientReplaceOneModel<Book>;
expectType<Filter<Book>>(clientReplaceOneModel.filter);
expectType<WithoutId<Book>>(clientReplaceOneModel.replacement);

declare const clientUpdateOneModel: ClientUpdateOneModel<Book>;
expectType<Filter<Book>>(clientUpdateOneModel.filter);
expectType<UpdateFilter<Book> | Document[]>(clientUpdateOneModel.update);

declare const clientUpdateManyModel: ClientUpdateManyModel<Book>;
expectType<Filter<Book>>(clientUpdateManyModel.filter);
expectType<UpdateFilter<Book> | Document[]>(clientUpdateManyModel.update);

declare const clientDeleteOneModel: ClientDeleteOneModel<Book>;
expectType<Filter<Book>>(clientDeleteOneModel.filter);

declare const clientDeleteManyModel: ClientDeleteManyModel<Book>;
expectType<Filter<Book>>(clientDeleteManyModel.filter);

client.bulkWrite([]); // empty should always work

// No schemas - all correct use
client.bulkWrite([
  {
    namespace: 'db.authors',
    name: 'insertOne',
    document: { name: 'bob', published: 2 }
  },
  {
    namespace: 'db.authors',
    name: 'replaceOne',
    filter: { name: 'bob' },
    replacement: { name: 'ann', published: 2 }
  },
  {
    namespace: 'db.authors',
    name: 'updateOne',
    filter: { name: 'bob', published: 2 },
    update: {}
  },
  {
    namespace: 'db.authors',
    name: 'updateMany',
    filter: { name: 'bob', published: 2 },
    update: {}
  },
  { namespace: 'db.authors', name: 'deleteOne', filter: {} },
  { namespace: 'db.authors', name: 'deleteMany', filter: {} }
]);

// No schemas - random namespaces, no type checking
client.bulkWrite([
  {
    namespace: 'db.whatever',
    name: 'insertOne',
    document: { name: 'bob', randomKey: 2 }
  },
  {
    namespace: 'db.change',
    name: 'replaceOne',
    filter: { name: 'bob' },
    replacement: { name: 2, published: 2 }
  },
  {
    namespace: 'db.it',
    name: 'updateOne',
    filter: { name: 'bob', published: new Date() },
    update: {}
  },
  {
    namespace: 'db.up',
    name: 'updateMany',
    filter: { name: 'bob', published: 2 },
    update: {}
  },
  { namespace: 'db.random', name: 'deleteOne', filter: {} },
  { namespace: 'db.namespace', name: 'deleteMany', filter: {} }
]);

// Operation names are still type checked when there is no schema
expectError<ClientBulkWriteModel>({
  namespace: 'db.author',
  name: 'insertLots', // Not an operation we support
  document: { name: 'bob', published: 2 }
});

type MongoDBSchemas = {
  'db.books': Book;
  'db.authors': Author;
  'db.stores': Store;
};

expectError<ClientBulkWriteModel<MongoDBSchemas>>({
  namespace: 'db.author', // Unknown namespace! a typo!
  name: 'insertOne',
  document: { name: 'bob', published: 2 }
});

expectError<ClientBulkWriteModel<MongoDBSchemas>>({
  namespace: 'db.authors',
  name: 'insertOne',
  document: { name: 'bob', published: '' } // Incorrect type for known field
});

expectError<ClientBulkWriteModel<MongoDBSchemas>>({
  namespace: 'db.authors',
  name: 'insertOne',
  document: { name: 'bob', publish: 2 } // unknown field! typo!
});

// Defined schemas - all correct use
client.bulkWrite<MongoDBSchemas>([
  {
    namespace: 'db.authors',
    name: 'insertOne',
    document: { name: 'bob', published: 2 }
  },
  {
    namespace: 'db.authors',
    name: 'replaceOne',
    filter: { name: 'bob' },
    replacement: { name: 'ann', published: 2 }
  },
  {
    namespace: 'db.authors',
    name: 'updateOne',
    filter: { name: 'bob', published: 2 },
    update: {}
  },
  {
    namespace: 'db.authors',
    name: 'updateMany',
    filter: { name: 'bob', published: 2 },
    update: {}
  },
  { namespace: 'db.authors', name: 'deleteOne', filter: {} },
  { namespace: 'db.authors', name: 'deleteMany', filter: {} }
]);

// Defined schemas - incorrect use
expectError(
  client.bulkWrite<MongoDBSchemas>([
    {
      namespace: 'db.authors',
      name: 'insertOne',
      document: { name: 'bob', published: '' } // wrong type
    }
  ])
);

expectError(
  client.bulkWrite<MongoDBSchemas>([
    {
      namespace: 'db.authors',
      name: 'replaceOne',
      filter: { name: 'bob' },
      replacement: { name: 'ann', publish: 2 } // key typo
    }
  ])
);

expectError(
  client.bulkWrite<MongoDBSchemas>([
    {
      namespace: 'db.blah', // unknown namespace
      name: 'updateOne',
      filter: { name: 'bob', published: 2 },
      update: {}
    }
  ])
);

expectError(
  client.bulkWrite<MongoDBSchemas>([
    {
      namespace: 'db.authors',
      name: 'updateManyy', // unknown operation
      filter: { name: 'bob', published: 2 },
      update: {}
    }
  ])
);

type MongoDBSchemasWithCalculations = {
  // River Books uses star ratings
  [key: `river-books.${string}`]: Book & { fiveStarRatings: number };
  // Ocean literature uses thumbs up for ratings
  [key: `ocean-literature.${string}`]: Book & { thumbsUp: number };
};

// correct use
client.bulkWrite<MongoDBSchemasWithCalculations>([
  {
    namespace: 'river-books.store0',
    name: 'insertOne',
    document: { title: 'abc', released: new Date(), fiveStarRatings: 10 }
  },
  {
    namespace: 'ocean-literature.store0',
    name: 'insertOne',
    document: { title: 'abc', released: new Date(), thumbsUp: 10 }
  }
]);

// prevented from changing each store's rating system!
expectError(
  client.bulkWrite<MongoDBSchemasWithCalculations>([
    {
      namespace: 'river-books.store0',
      name: 'insertOne',
      document: { title: 'abc', released: new Date(), thumbsUp: 10 }
    },
    {
      namespace: 'ocean-literature.store0',
      name: 'insertOne',
      document: { title: 'abc', released: new Date(), fiveStarRatings: 10 }
    }
  ])
);

// Example partial use case:
// I want to make sure I don't mess up any namespaces but I don't want to define schemas:

type MongoDBNamespaces = 'db.books' | 'db.authors' | 'db.stores';

client.bulkWrite<{ [K in MongoDBNamespaces]: Document }>([
  {
    namespace: 'db.books',
    name: 'insertOne',
    document: { title: 'abc', released: 32n, blah_blah: 10 } // wrong type for released does not error
  },
  {
    namespace: 'db.authors',
    name: 'insertOne',
    document: { title: 'abc', released: 'yesterday', fiveStarRatings: 10 }
  }
]);

expectError(
  client.bulkWrite<{ [K in MongoDBNamespaces]: Document }>([
    {
      namespace: 'db.wrongNS',
      name: 'insertOne',
      document: { title: 'abc', released: new Date(), thumbsUp: 10 }
    }
  ])
);
