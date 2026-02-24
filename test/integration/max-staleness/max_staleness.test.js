'use strict';
const { Long } = require('bson');
const { expect } = require('chai');
const mock = require('../../tools/mongodb-mock/index');
const { ReadPreference } = require('../../mongodb');
const { isHello } = require('../../mongodb');

const test = {};
// TODO (NODE-3799): convert these to run against a real server
describe('Max Staleness', function () {
  afterEach(() => mock.cleanup());

  beforeEach(() => {
    return mock.createServer().then(server => {
      test.server = server;

      const defaultFields = Object.assign({}, mock.HELLO, { msg: 'isdbgrid' });

      // Primary server states
      const serverIsPrimary = [Object.assign({}, defaultFields)];
      server.setMessageHandler(request => {
        const doc = request.document;
        if (isHello(doc)) {
          request.reply(serverIsPrimary[0]);
          return;
        }

        if (doc['$query'] && doc['$readPreference']) {
          test.checkCommand = doc;
          request.reply({
            waitedMS: Long.ZERO,
            cursor: {
              id: Long.ZERO,
              ns: 'test.t',
              firstBatch: []
            },
            ok: 1
          });
        } else if (doc.endSessions) {
          request.reply({ ok: 1 });
        }
      });
    });
  });

  it('should correctly set maxStalenessSeconds on Mongos query on connect', {
    metadata: {
      requires: {
        tls: 'disabled',
        topology: 'replicaset'
      }
    },

    test: async function () {
      const self = this;
      const configuration = this.configuration;
      const client = configuration.newClient(
        `mongodb://${test.server.uri()}/test?readPreference=secondary&maxStalenessSeconds=250`,
        { serverApi: null } // TODO(NODE-3807): remove resetting serverApi when the usage of mongodb mock server is removed
      );

      await client.connect();
      const db = client.db(self.configuration.db);
      await db.collection('test').find({}).toArray();
      expect(test.checkCommand).to.containSubset({
        $readPreference: { mode: 'secondary', maxStalenessSeconds: 250 }
      });
      await client.close();
    }
  });

  it('should correctly set maxStalenessSeconds on Mongos query using db level readPreference', {
    metadata: {
      requires: {
        tls: 'disabled',
        topology: 'replicaset'
      }
    },

    test: async function () {
      const configuration = this.configuration;
      const client = configuration.newClient(`mongodb://${test.server.uri()}/test`, {
        serverApi: null // TODO(NODE-3807): remove resetting serverApi when the usage of mongodb mock server is removed
      });

      await client.connect();

      // Get a db with a new readPreference
      const db1 = client.db('test', {
        readPreference: new ReadPreference('secondary', null, { maxStalenessSeconds: 250 })
      });
      await db1.collection('test').find({}).toArray();
      expect(test.checkCommand).to.containSubset({
        $readPreference: { mode: 'secondary', maxStalenessSeconds: 250 }
      });
      await client.close();
    }
  });

  it(
    'should correctly set maxStalenessSeconds on Mongos query using collection level readPreference',
    {
      metadata: {
        requires: {
          tls: 'disabled',
          topology: 'replicaset'
        }
      },

      test: async function () {
        const self = this;
        const configuration = this.configuration;
        const client = configuration.newClient(`mongodb://${test.server.uri()}/test`, {
          serverApi: null // TODO(NODE-3807): remove resetting serverApi when the usage of mongodb mock server is removed
        });

        await client.connect();
        const db = client.db(self.configuration.db);

        // Get a db with a new readPreference
        await db
          .collection('test', {
            readPreference: new ReadPreference('secondary', null, { maxStalenessSeconds: 250 })
          })
          .find({})
          .toArray();
        expect(test.checkCommand).to.containSubset({
          $readPreference: { mode: 'secondary', maxStalenessSeconds: 250 }
        });
        await client.close();
      }
    }
  );

  it('should correctly set maxStalenessSeconds on Mongos query using cursor level readPreference', {
    metadata: {
      requires: {
        tls: 'disabled',
        topology: 'replicaset'
      }
    },

    test: async function () {
      const self = this;
      const configuration = this.configuration;
      const client = configuration.newClient(`mongodb://${test.server.uri()}/test`, {
        serverApi: null // TODO(NODE-3807): remove resetting serverApi when the usage of mongodb mock server is removed
      });

      await client.connect();
      const db = client.db(self.configuration.db);
      const readPreference = new ReadPreference('secondary', null, { maxStalenessSeconds: 250 });

      // Get a db with a new readPreference
      await db.collection('test').find({}).withReadPreference(readPreference).toArray();

      expect(test.checkCommand).to.containSubset({
        $query: { find: 'test', filter: {} },
        $readPreference: { mode: 'secondary', maxStalenessSeconds: 250 }
      });
      await client.close();
    }
  });
});
