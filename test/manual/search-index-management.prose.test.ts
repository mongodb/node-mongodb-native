import { expect } from 'chai';
import { lt } from 'semver';
import { Readable } from 'stream';
import { clearTimeout, setTimeout as setTimeoutCb } from 'timers';
import { setInterval } from 'timers/promises';

import { type Collection, type Document, type MongoClient, ObjectId } from '../mongodb';

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
      indexNames
    }: {
      predicate: (arg0: Array<Document>) => boolean;
      indexNames: string | string[];
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
          indexNames: 'test-search-index'
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
          indexNames: ['test-search-index-1', 'test-search-index-2']
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
        indexNames: 'test-search-index'
      });

      // Run a dropSearchIndex on coll0, using test-search-index for the name.
      await collection.dropSearchIndex('test-search-index');

      // Run coll0.listSearchIndexes() repeatedly every 5 seconds until listSearchIndexes returns an empty array.
      // This test fails if it times out waiting for the deletion to succeed.
      const indexes = await waitForIndexes({
        predicate: indexes => indexes.length === 0,
        indexNames: 'test-search-index'
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
        indexNames: 'test-search-index'
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
        indexNames: 'test-search-index'
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
  });
});
