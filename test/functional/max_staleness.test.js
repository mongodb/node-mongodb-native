'use strict';
const { Long } = require('bson');
const { expect } = require('chai');
const mock = require('mongodb-mock-server');
const { ReadPreference } = require('../../src');

const test = {};
describe('Max Staleness', function () {
  afterEach(() => mock.cleanup());
  beforeEach(() => {
    return mock.createServer().then(server => {
      test.server = server;

      const defaultFields = Object.assign({}, mock.DEFAULT_ISMASTER, { msg: 'isdbgrid' });

      // Primary server states
      const serverIsMaster = [Object.assign({}, defaultFields)];
      server.setMessageHandler(request => {
        var doc = request.document;
        if (doc.ismaster) {
          request.reply(serverIsMaster[0]);
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
        generators: true,
        topology: 'single'
      }
    },

    test: function (done) {
      var self = this;
      const configuration = this.configuration;
      const client = configuration.newClient(
        `mongodb://${test.server.uri()}/test?readPreference=secondary&maxStalenessSeconds=250`
      );

      client.connect(function (err, client) {
        expect(err).to.not.exist;
        var db = client.db(self.configuration.db);

        db.collection('test')
          .find({})
          .toArray(function (err) {
            expect(err).to.not.exist;
            expect(test.checkCommand).to.eql({
              $query: { find: 'test', filter: {}, returnKey: false, showRecordId: false },
              $readPreference: { mode: 'secondary', maxStalenessSeconds: 250 }
            });

            client.close(done);
          });
      });
    }
  });

  it('should correctly set maxStalenessSeconds on Mongos query using db level readPreference', {
    metadata: {
      requires: {
        generators: true,
        topology: 'single'
      }
    },

    test: function (done) {
      const configuration = this.configuration;
      const client = configuration.newClient(`mongodb://${test.server.uri()}/test`);
      client.connect(function (err, client) {
        expect(err).to.not.exist;

        // Get a db with a new readPreference
        var db1 = client.db('test', {
          readPreference: new ReadPreference('secondary', null, { maxStalenessSeconds: 250 })
        });

        db1
          .collection('test')
          .find({})
          .toArray(function (err) {
            expect(err).to.not.exist;
            expect(test.checkCommand).to.eql({
              $query: { find: 'test', filter: {}, returnKey: false, showRecordId: false },
              $readPreference: { mode: 'secondary', maxStalenessSeconds: 250 }
            });

            client.close(done);
          });
      });
    }
  });

  it(
    'should correctly set maxStalenessSeconds on Mongos query using collection level readPreference',
    {
      metadata: {
        requires: {
          generators: true,
          topology: 'single'
        }
      },

      test: function (done) {
        var self = this;
        const configuration = this.configuration;
        const client = configuration.newClient(`mongodb://${test.server.uri()}/test`);
        client.connect(function (err, client) {
          expect(err).to.not.exist;
          var db = client.db(self.configuration.db);

          // Get a db with a new readPreference
          db.collection('test', {
            readPreference: new ReadPreference('secondary', null, { maxStalenessSeconds: 250 })
          })
            .find({})
            .toArray(function (err) {
              expect(err).to.not.exist;
              expect(test.checkCommand).to.eql({
                $query: { find: 'test', filter: {}, returnKey: false, showRecordId: false },
                $readPreference: { mode: 'secondary', maxStalenessSeconds: 250 }
              });

              client.close(done);
            });
        });
      }
    }
  );

  it('should correctly set maxStalenessSeconds on Mongos query using cursor level readPreference', {
    metadata: {
      requires: {
        generators: true,
        topology: 'single'
      }
    },

    test: function (done) {
      var self = this;
      const configuration = this.configuration;
      const client = configuration.newClient(`mongodb://${test.server.uri()}/test`);
      client.connect(function (err, client) {
        expect(err).to.not.exist;
        var db = client.db(self.configuration.db);
        var readPreference = new ReadPreference('secondary', null, { maxStalenessSeconds: 250 });

        // Get a db with a new readPreference
        db.collection('test')
          .find({})
          .withReadPreference(readPreference)
          .toArray(function (err) {
            expect(err).to.not.exist;
            expect(test.checkCommand).to.eql({
              $query: { find: 'test', filter: {}, returnKey: false, showRecordId: false },
              $readPreference: { mode: 'secondary', maxStalenessSeconds: 250 }
            });

            client.close(done);
          });
      });
    }
  });
});
