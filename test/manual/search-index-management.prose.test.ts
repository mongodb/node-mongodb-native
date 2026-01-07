import { expect } from 'chai';
import * as process from 'process';
import { lt } from 'semver';
import { Readable } from 'stream';
import { clearTimeout, setTimeout as setTimeoutCb } from 'timers';
import { setInterval } from 'timers/promises';

import { type Collection, type Document, type MongoClient, ObjectId, ReadConcern } from '../../src';

class TimeoutController extends AbortController {
  timeoutId: NodeJS.Timeout;
  constructor(timeoutMS: number) {
    super();

    this.timeoutId = setTimeoutCb(() => {
      this.abort(new Error(`Test timed out after ${timeoutMS} milliseconds.`));
    }, timeoutMS);
  }

  clear(abort = false) {
    if (abort) {
      this.abort();
    }
    clearTimeout(this.timeoutId);
  }
}

const metadata: MongoDBMetadataUI = {
  requires: {
    mongodb: '>=7.0'
  }
};

describe('Index Management Prose Tests', function () {
  describe('Search Index Management Tests', function () {
    this.timeout(300000); // set timeout at five minutes

    let client: MongoClient;
    let timeoutController: TimeoutController;
    let collection: Collection;

    /**
     * waits until the search indexes for `collection` satisfy `predicate`.
     *
     * This optionally pre-filtering
     * for indexes with name = `indexName`
     */
    function waitForIndexes({
      predicate,
      indexNames,
      collection
    }: {
      predicate: (arg0: Array<Document>) => boolean;
      indexNames: string | string[];
      collection: Collection;
    }): Promise<Array<Document>> {
      const names = new Set([indexNames].flat());
      return Readable.from(
        setInterval(5000, undefined, { signal: timeoutController.signal, ref: false })
      )
        .map(() => collection.listSearchIndexes().toArray())
        .map((indexes: Document[]) => indexes.filter(index => names.has(index.name)))
        .find(predicate);
    }

    before(function () {
      this.configuration = this.configuration.makeAtlasTestConfiguration();
    });

    beforeEach(function () {
      if (lt(process.version, '18.0.0')) {
        this.currentTest.skipReason = 'Test requires Node18+';
        this.skip();
      }
    });

    beforeEach(async function () {
      client = this.configuration.newClient();
      await client.connect();

      // Create a collection with the "create" command using a randomly generated name (referred to as coll0).
      collection = await client.db('node-test').createCollection(new ObjectId().toHexString());

      timeoutController = new TimeoutController(60 * 1000 * 4);
    });

    afterEach(async () => {
      await collection.drop();
      await client?.close();
      timeoutController?.clear(false);
    });

    it(
      'Case 1: Driver can successfully create and list search indexes',
      metadata,
      async function () {
        // Create a new search index on coll0 with the createSearchIndex helper. Use the following definition:
        // {
        //   name: 'test-search-index',
        //   definition: {
        //     mappings: { dynamic: false }
        //   }
        // }
        const name = await collection.createSearchIndex({
          name: 'test-search-index',
          definition: {
            mappings: { dynamic: false }
          }
        });

        // Assert that the command returns the name of the index: "test-search-index".
        expect(name).to.equal('test-search-index');

        // Run coll0.listSearchIndexes() repeatedly every 5 seconds until the following condition is satisfied and store the value in a variable index:
        // 1. An index with the name of test-search-index is present and the index has a field queryable with a value of true.
        const [index] = await waitForIndexes({
          predicate: indexes => indexes.every(index => index.queryable),
          indexNames: 'test-search-index',
          collection
        });

        // Assert that index has a property latestDefinition whose value is { 'mappings': { 'dynamic': false } }
        expect(index).to.exist;
        expect(index)
          .to.have.property('latestDefinition')
          .to.deep.equal({ mappings: { dynamic: false } });
      }
    );

    it(
      'Case 2: Driver can successfully create multiple indexes in batch',
      metadata,
      async function () {
        // Create two new search indexes on coll0 with the createSearchIndexes helper. Use the following definitions when creating the indexes. These definitions are referred to as indexDefinitions.
        // {
        //   name: 'test-search-index-1',
        //   definition: {
        //     mappings: { dynamic: false }
        //   }
        // }
        // {
        //   name: 'test-search-index-2',
        //   definition: {
        //     mappings: { dynamic: false }
        //   }
        // }
        const indexDefinitions = [
          {
            name: 'test-search-index-1',
            definition: {
              mappings: { dynamic: false }
            }
          },
          {
            name: 'test-search-index-2',
            definition: {
              mappings: { dynamic: false }
            }
          }
        ];

        const names = await collection.createSearchIndexes(indexDefinitions);

        // Assert that the command returns an array containing the new indexes' names: ["test-search-index-1", "test-search-index-2"].
        expect(names).to.deep.equal(['test-search-index-1', 'test-search-index-2']);

        // Run coll0.listSearchIndexes() repeatedly every 5 seconds until the following condition is satisfied.
        // 1. An index with the name of test-search-index-1 is present and index has a field queryable with the value of true. Store result in index1.
        // 2. An index with the name of test-search-index-2 is present and index has a field queryable with the value of true. Store result in index2.
        const indexes = await waitForIndexes({
          predicate: indexes => indexes.every(index => index.queryable),
          indexNames: ['test-search-index-1', 'test-search-index-2'],
          collection
        });

        const index1 = indexes.find(({ name }) => name === 'test-search-index-1');
        const index2 = indexes.find(({ name }) => name === 'test-search-index-2');

        // Assert that index1 and index2 have the property latestDefinition whose value is { "mappings" : { "dynamic" : false } }
        expect(index1)
          .to.have.property('latestDefinition')
          .to.deep.equal({ mappings: { dynamic: false } });
        expect(index2)
          .to.have.property('latestDefinition')
          .to.deep.equal({ mappings: { dynamic: false } });
      }
    );

    it('Case 3: Driver can successfully drop search indexes', metadata, async function () {
      // Create a new search index on coll0 with the following definition:
      // {
      //   name: 'test-search-index',
      //   definition: {
      //     mappings: { dynamic: false }
      //   }
      // }
      const name = await collection.createSearchIndex({
        name: 'test-search-index',
        definition: {
          mappings: { dynamic: false }
        }
      });

      // Assert that the command returns the name of the index: "test-search-index".
      expect(name).to.equal('test-search-index');

      // Run coll0.listSearchIndexes() repeatedly every 5 seconds until the following condition is satisfied:
      // 1. An index with the name of test-search-index is present and index has a field queryable with the value of true.
      await waitForIndexes({
        predicate: indexes => indexes.every(index => index.queryable),
        indexNames: 'test-search-index',
        collection
      });

      // Run a dropSearchIndex on coll0, using test-search-index for the name.
      await collection.dropSearchIndex('test-search-index');

      // Run coll0.listSearchIndexes() repeatedly every 5 seconds until listSearchIndexes returns an empty array.
      // This test fails if it times out waiting for the deletion to succeed.
      const indexes = await waitForIndexes({
        predicate: indexes => indexes.length === 0,
        indexNames: 'test-search-index',
        collection
      });

      expect(indexes).to.deep.equal([]);
    });

    it('Case 4: Driver can update a search index', metadata, async function () {
      // Create a new search index on coll0 with the following definition:
      // {
      //   name: 'test-search-index',
      //   definition: {
      //     mappings: { dynamic: false }
      //   }
      // }
      const name = await collection.createSearchIndex({
        name: 'test-search-index',
        definition: {
          mappings: { dynamic: false }
        }
      });

      // Assert that the command returns the name of the index: "test-search-index".
      expect(name).to.equal('test-search-index');

      // Run coll0.listSearchIndexes() repeatedly every 5 seconds until the following condition is satisfied:
      // 1. An index with the name of test-search-index is present and index has a field queryable with the value of true.
      await waitForIndexes({
        predicate: indexes => indexes.every(index => index.queryable),
        indexNames: 'test-search-index',
        collection
      });

      // Run a updateSearchIndex on coll0, using the following definition.
      // {
      //   name: 'test-search-index',
      //   definition: {
      //     mappings: { dynamic: true }
      //   }
      // }
      await collection.updateSearchIndex('test-search-index', { mappings: { dynamic: true } });

      // Assert that the command does not error and the server responds with a success.
      // The above command throws on failure.

      // Run coll0.listSearchIndexes() repeatedly every 5 seconds until the following condition is satisfied:
      // 1. An index with the name of test-search-index is present. This index is referred to as index.
      // 2. The index has a field queryable with a value of true and has a field status with the value of READY.
      const [index2] = await waitForIndexes({
        predicate: indexes => indexes.every(index => index.queryable && index.status === 'READY'),
        indexNames: 'test-search-index',
        collection
      });

      // Assert that an index is present with the name test-search-index and the definition has a
      // property latestDefinition whose value is { 'mappings': { 'dynamic': true } }.
      expect(index2).to.have.property('name', 'test-search-index');
      expect(index2)
        .to.have.property('latestDefinition')
        .to.deep.equal({ mappings: { dynamic: true } });
    });

    it(
      'Case 5: `dropSearchIndex` suppresses namespace not found errors',
      metadata,
      async function () {
        // Create a driver-side collection object for a randomly generated collection name. Do not create this collection on the server.
        const collection = await client.db('node-test').collection(new ObjectId().toHexString());

        // Run a dropSearchIndex command and assert that no error is thrown.
        await collection.dropSearchIndex('test-search-index');
      }
    );

    it(
      'Case 6: Driver can successfully create and list search indexes with non-default readConcern and writeConcern',
      metadata,
      async function () {
        // 1. Create a collection with the "create" command using a randomly generated name (referred to as coll0).
        // 2. Apply a write concern WriteConcern(w=1) and a read concern with ReadConcern(level="majority") to coll0.
        const coll0 = await client.db('node-test').createCollection(new ObjectId().toHexString(), {
          readConcern: ReadConcern.MAJORITY,
          writeConcern: { w: 1 }
        });

        // 3. Create a new search index on coll0 with the createSearchIndex helper. Use the following definition:
        // {
        //   name: 'test-search-index-case6',
        //   definition: {
        //     mappings: { dynamic: false }
        //   }
        // }
        const name = await coll0.createSearchIndex({
          name: 'test-search-index-case6',
          definition: {
            mappings: { dynamic: false }
          }
        });

        // 4. Assert that the command returns the name of the index: "test-search-index-case6".
        expect(name).to.equal('test-search-index-case6');

        // 5. Run coll0.listSearchIndexes() repeatedly every 5 seconds until the following condition is satisfied and store the value in a variable index:
        //   - An index with the name of test-search-index-case6 is present and the index has a field queryable with a value of true.
        const [index] = await waitForIndexes({
          predicate: indexes => indexes.every(index => index.queryable),
          indexNames: 'test-search-index-case6',
          collection: coll0
        });

        // 6. Assert that index has a property latestDefinition whose value is { 'mappings': { 'dynamic': false } }
        expect(index)
          .to.have.nested.property('latestDefinition.mappings')
          .to.deep.equal({ dynamic: false });
      }
    );

    it(
      'Case 7: Driver can successfully handle search index types when creating indexes',
      metadata,
      async function () {
        // 01. Create a collection with the "create" command using a randomly generated name (referred to as `coll0`).
        const coll0 = collection;
        {
          // 02. Create a new search index on `coll0` with the `createSearchIndex` helper. Use the following definition:
          //     ```typescript
          //       {
          //         name: 'test-search-index-case7-implicit',
          //         definition: {
          //           mappings: { dynamic: false }
          //         }
          //       }
          //     ```
          const indexName = await coll0.createSearchIndex({
            name: 'test-search-index-case7-implicit',
            definition: {
              mappings: { dynamic: false }
            }
          });
          // 03. Assert that the command returns the name of the index: `"test-search-index-case7-implicit"`.
          expect(indexName).to.equal('test-search-index-case7-implicit');
          // 04. Run `coll0.listSearchIndexes('test-search-index-case7-implicit')` repeatedly every 5 seconds until the following
          //     condition is satisfied and store the value in a variable `index1`:

          //     - An index with the `name` of `test-search-index-case7-implicit` is present and the index has a field `queryable`
          //       with a value of `true`.

          const [index1] = await waitForIndexes({
            predicate: indexes => indexes.every(index => index.queryable),
            indexNames: 'test-search-index-case7-implicit',
            collection: coll0
          });

          // 05. Assert that `index1` has a property `type` whose value is `search`.
          expect(index1).to.have.property('type', 'search');
        }
        {
          // 06. Create a new search index on `coll0` with the `createSearchIndex` helper. Use the following definition:
          //     ```typescript
          //       {
          //         name: 'test-search-index-case7-explicit',
          //         type: 'search',
          //         definition: {
          //           mappings: { dynamic: false }
          //         }
          //       }
          //     ```
          const indexName = await coll0.createSearchIndex({
            name: 'test-search-index-case7-explicit',
            type: 'search',
            definition: {
              mappings: { dynamic: false }
            }
          });
          // 07. Assert that the command returns the name of the index: `"test-search-index-case7-explicit"`.
          expect(indexName).to.equal('test-search-index-case7-explicit');
          // 08. Run `coll0.listSearchIndexes('test-search-index-case7-explicit')` repeatedly every 5 seconds until the following
          //     condition is satisfied and store the value in a variable `index2`:

          //     - An index with the `name` of `test-search-index-case7-explicit` is present and the index has a field `queryable`
          //       with a value of `true`.

          const [index2] = await waitForIndexes({
            predicate: indexes => indexes.every(index => index.queryable),
            indexNames: 'test-search-index-case7-explicit',
            collection: coll0
          });
          // 09. Assert that `index2` has a property `type` whose value is `search`.
          expect(index2).to.have.property('type', 'search');
        }
        {
          // 10. Create a new vector search index on `coll0` with the `createSearchIndex` helper. Use the following definition:
          // ```typescript
          //   {
          //     name: 'test-search-index-case7-vector',
          //     type: 'vectorSearch',
          //     definition: {
          //       "fields": [
          //          {
          //              "type": "vector",
          //              "path": "plot_embedding",
          //              "numDimensions": 1536,
          //              "similarity": "euclidean",
          //          },
          //       ]
          //     }
          //   }
          // ```

          const indexName = await coll0.createSearchIndex({
            name: 'test-search-index-case7-vector',
            type: 'vectorSearch',
            definition: {
              fields: [
                {
                  type: 'vector',
                  path: 'plot_embedding',
                  numDimensions: 1536,
                  similarity: 'euclidean'
                }
              ]
            }
          });
          // 11. Assert that the command returns the name of the index: `"test-search-index-case7-vector"`.
          expect(indexName).to.equal('test-search-index-case7-vector');
          // 12. Run `coll0.listSearchIndexes('test-search-index-case7-vector')` repeatedly every 5 seconds until the following
          //     condition is satisfied and store the value in a variable `index3`:
          //     - An index with the `name` of `test-search-index-case7-vector` is present and the index has a field `queryable` with
          //       a value of `true`.
          const [index3] = await waitForIndexes({
            predicate: indexes => indexes.every(index => index.queryable),
            indexNames: 'test-search-index-case7-vector',
            collection: coll0
          });

          // 13. Assert that `index3` has a property `type` whose value is `vectorSearch`.
          expect(index3).to.have.property('type', 'vectorSearch');
        }
      }
    );

    it('Case 8: Driver requires explicit type to create a vector search index', async function () {
      // 1. Create a collection with the "create" command using a randomly generated name (referred to as `coll0`).
      const coll0 = collection;

      // 2. Create a new vector search index on `coll0` with the `createSearchIndex` helper. Use the following definition:
      //    {
      //      name: 'test-search-index-case8-error',
      //      definition: {
      //        fields: [
      //           {
      //               type: 'vector',
      //               path: 'plot_embedding',
      //               numDimensions: 1536,
      //               similarity: 'euclidean',
      //           },
      //        ]
      //      }
      //    }
      const definition = {
        name: 'test-search-index-case8-error',
        definition: {
          fields: [
            {
              type: 'vector',
              path: 'plot_embedding',
              numDimensions: 1536,
              similarity: 'euclidean'
            }
          ]
        }
      };
      const error = await coll0.createSearchIndex(definition).catch(e => e);

      // 3. Assert that the command throws an exception containing the string "Attribute mappings missing" due to the `mappings`
      //  field missing.
      expect(error).to.match(/Attribute mappings missing/i);
    });
  });
});
