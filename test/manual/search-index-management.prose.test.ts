import { expect } from 'chai';
import { lt } from 'semver';
import { Readable } from 'stream';
import { clearTimeout, setTimeout as setTimeoutCb } from 'timers';
import { setInterval } from 'timers/promises';

import { type Collection, type Document, type MongoClient, ObjectId } from '../mongodb';

class TimeoutController extends AbortController {
  timeoutId: NodeJS.Timeout;
  constructor(private timeoutMS: number) {
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

    /** creates a readable stream that emits every \<interval\> ms */
    const interval = (interval: number, signal: AbortSignal) =>
      Readable.from(setInterval(interval, undefined, { signal, ref: false }));

    /**
     * waits until the search indexes for `collection` satisfy `predicate`, optionally pre-filtering
     * for indexes with name = `indexName`
     */
    const waitForIndexes = ({
      collection,
      predicate,
      indexName
    }: {
      collection: Collection;
      predicate: (arg0: Array<Document>) => boolean;
      indexName?: string;
    }): Promise<Array<Document>> =>
      interval(5000, timeoutController.signal)
        .map(() => collection.listSearchIndexes(indexName).toArray())
        .find(predicate);

    before(function () {
      this.configuration = this.configuration.makeAtlasTestConfiguration();
    });

    beforeEach(function () {
      if (lt(process.version, '18.0.0')) {
        this.currentTest!.skipReason = 'Test requires Node18+';
        this.skip();
      }
    });

    beforeEach(async function () {
      client = this.configuration.newClient();
      await client.connect();

      timeoutController = new TimeoutController(60 * 1000 * 4);
    });

    afterEach(async () => {
      await client?.close();
      timeoutController?.clear(false);
    });

    it(
      'Case 1: Driver can successfully create and list search indexes',
      metadata,
      async function () {
        const collection = await client
          .db('test-db')
          .createCollection(new ObjectId().toHexString());

        await collection.createSearchIndex({
          name: 'test-search-index',
          definition: {
            mappings: { dynamic: false }
          }
        });

        const [index] = await waitForIndexes({
          collection,
          predicate: indexes => indexes.every(index => index.queryable),
          indexName: 'test-search-index'
        });

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
        const collection = await client
          .db('test-db')
          .createCollection(new ObjectId().toHexString());

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

        await collection.createSearchIndexes(indexDefinitions);

        const indexes = await waitForIndexes({
          collection,
          predicate: indexes => indexes.every(index => index.queryable)
        });

        for (const indexDescription of indexDefinitions) {
          const index = indexes.find(({ name }) => name === indexDescription.name);
          expect(index, `expected ${indexDescription.name} to exist`).to.exist;

          expect(index)
            .to.have.property('latestDefinition')
            .to.deep.equal({ mappings: { dynamic: false } });
        }
      }
    );

    it('Case 3: Driver can successfully drop search indexes', metadata, async function () {
      const collection = await client.db('test-db').createCollection(new ObjectId().toHexString());

      await collection.createSearchIndex({
        name: 'test-search-index',
        definition: {
          mappings: { dynamic: false }
        }
      });

      await waitForIndexes({
        collection,
        predicate: indexes => indexes.every(index => index.queryable),
        indexName: 'test-search-index'
      });

      await collection.dropSearchIndex('test-search-index');

      const indexes = await waitForIndexes({
        collection,
        predicate: indexes => indexes.length === 0,
        indexName: 'test-search-index'
      });

      expect(indexes).to.deep.equal([]);
    });

    it('Case 4: Driver can update a search index', metadata, async function () {
      const collection = await client.db('test-db').createCollection(new ObjectId().toHexString());

      await collection.createSearchIndex({
        name: 'test-search-index',
        definition: {
          mappings: { dynamic: false }
        }
      });

      await waitForIndexes({
        collection,
        predicate: indexes => indexes.every(index => index.queryable),
        indexName: 'test-search-index'
      });

      await collection.updateSearchIndex('test-search-index', { mappings: { dynamic: true } });

      const [updatedIndex] = await waitForIndexes({
        collection,
        predicate: indexes => indexes.every(index => index.queryable && index.status === 'READY'),
        indexName: 'test-search-index'
      });

      expect(updatedIndex).to.have.property('name', 'test-search-index');
      expect(updatedIndex)
        .to.have.property('latestDefinition')
        .to.deep.equal({ mappings: { dynamic: true } });
    });

    it(
      'Case 5: `dropSearchIndex` suppresses namespace not found errors',
      metadata,
      async function () {
        const collection = await client.db('test-db').collection(new ObjectId().toHexString());

        await collection.dropSearchIndex('test-search-index');
      }
    );
  });
});
