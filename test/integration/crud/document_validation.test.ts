import { expect } from 'chai';

import { MongoBulkWriteError, type MongoClient, MongoServerError } from '../../../src';
import { ignoreNsNotFound, setupDatabase } from '../shared';

describe('Document Validation', function () {
  let client: MongoClient;

  before(function () {
    return setupDatabase(this.configuration);
  });

  beforeEach(function () {
    client = this.configuration.newClient(this.configuration.writeConcernMax(), { maxPoolSize: 1 });
  });

  afterEach(async function () {
    await client?.close();
  });

  it('should allow bypassing document validation on inserts', {
    metadata: { requires: { topology: ['single', 'replicaset', 'sharded'] } },

    test: async function () {
      const db = client.db(this.configuration.db);

      // Get collection
      const col = db.collection('createValidationCollection');

      // Drop the collection
      await col.drop().catch(ignoreNsNotFound);
      // Create a collection with a validator
      await db.createCollection('createValidationCollection', {
        validator: { a: { $exists: true } }
      });

      // Ensure validation was correctly applied
      const err = await col.insertOne({ b: 1 }).catch(err => err);
      expect(err).to.be.instanceOf(MongoServerError);

      // Bypass valiation on insertOne
      await col.insertOne({ b: 1 }, { bypassDocumentValidation: true });

      // Bypass valiation on insertMany
      await col.insertMany([{ b: 1 }], { bypassDocumentValidation: true });
    }
  });

  it('should allow bypassing document validation on updates', {
    metadata: { requires: { topology: ['single', 'replicaset', 'sharded'] } },

    test: async function () {
      const db = client.db(this.configuration.db);

      // Get collection
      const col = db.collection('createValidationCollection');

      // Drop the collection
      await col.drop().catch(ignoreNsNotFound);
      // Create a collection with a validator
      await db.createCollection('createValidationCollection', {
        validator: { a: { $exists: true } }
      });

      // Should fail
      const err = await col
        .updateOne({ b: 1 }, { $set: { b: 1 } }, { upsert: true })
        .catch(err => err);
      expect(err).to.be.instanceOf(MongoServerError);

      // Ensure validation was correctly applied
      await col.updateOne(
        { b: 1 },
        { $set: { b: 1 } },
        { upsert: true, bypassDocumentValidation: true }
      );

      // updateMany
      await col.updateMany(
        { d: 1 },
        { $set: { d: 1 } },
        { upsert: true, bypassDocumentValidation: true }
      );

      // replaceOne
      await col.replaceOne({ e: 1 }, { e: 1 }, { upsert: true, bypassDocumentValidation: true });
    }
  });

  it('should allow bypassing document validation on bulkWrite', {
    metadata: { requires: { topology: ['single', 'replicaset', 'sharded'] } },

    test: async function () {
      const db = client.db(this.configuration.db);

      // Get collection
      const col = db.collection('createValidationCollection');

      // Drop the collection
      await col.drop().catch(ignoreNsNotFound);
      // Create a collection with a validator
      await db.createCollection('createValidationCollection', {
        validator: { a: { $exists: true } }
      });

      // Should fail
      const err = await col.bulkWrite([{ insertOne: { document: { b: 1 } } }]).catch(err => err);
      expect(err).to.be.instanceOf(MongoBulkWriteError);

      await col.bulkWrite([{ insertOne: { document: { b: 1 } } }], {
        bypassDocumentValidation: true
      });
    }
  });

  it('should allow bypassing document validation on findAndModify', {
    metadata: { requires: { topology: ['single', 'replicaset', 'sharded'] } },

    test: async function () {
      const db = client.db(this.configuration.db);

      // Get collection
      const col = db.collection('createValidationCollection');

      // Drop the collection
      await col.drop().catch(ignoreNsNotFound);
      // Create a collection with a validator
      await db.createCollection('createValidationCollection', {
        validator: { a: { $exists: true } }
      });

      // Should fail
      const err = await col
        .findOneAndUpdate({ b: 1 }, { $set: { b: 1 } }, { upsert: true })
        .catch(err => err);
      expect(err).to.be.instanceOf(MongoServerError);

      // Should pass
      await col.findOneAndUpdate(
        { b: 1 },
        { $set: { b: 1 } },
        { upsert: true, bypassDocumentValidation: true }
      );

      // Should pass
      await col.findOneAndReplace(
        { c: 1 },
        { c: 1 },
        { upsert: true, bypassDocumentValidation: true }
      );
    }
  });

  it('should correctly bypass validation for aggregation using out', {
    metadata: { requires: { topology: ['single', 'replicaset', 'sharded'] } },

    test: async function () {
      const db = client.db(this.configuration.db);
      // Some docs for insertion
      const docs = [
        {
          title: 'this is my title',
          author: 'bob',
          posted: new Date(),
          pageViews: 5,
          tags: ['fun', 'good', 'fun'],
          other: { foo: 5 },
          comments: [
            { author: 'joe', text: 'this is cool' },
            { author: 'sam', text: 'this is bad' }
          ]
        }
      ];

      // Get collection
      const col = db.collection('createValidationCollectionOut');

      // Drop the collection
      await col.drop().catch(ignoreNsNotFound);
      // Create a collection with a validator
      await db.createCollection('createValidationCollectionOut', {
        validator: { a: { $exists: true } }
      });
      // Insert the docs
      await col.insertMany(docs, { writeConcern: { w: 1 }, bypassDocumentValidation: true });

      // Execute aggregate, notice the pipeline is expressed as an Array
      const cursor = col.aggregate(
        [
          {
            $project: {
              author: 1,
              tags: 1
            }
          },
          { $unwind: '$tags' },
          {
            $group: {
              _id: { tags: '$tags' },
              authors: { $addToSet: '$author' }
            }
          },
          { $out: 'createValidationCollectionOut' }
        ],
        { bypassDocumentValidation: true }
      );
      await cursor.toArray();
    }
  });
});
