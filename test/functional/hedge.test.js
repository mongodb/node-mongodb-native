'use strict';

const Long = require('bson').Long,
  expect = require('chai').expect,
  mock = require('mongodb-mock-server');

const test = {};
describe('Hedge', function() {
  afterEach(() => mock.cleanup());
  beforeEach(() => {
    return mock.createServer().then(server => {
      test.server = server;

      const defaultFields = Object.assign({}, mock.DEFAULT_ISMASTER, {
        msg: 'isdbgrid'
      });

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

  it('should correctly set hedge using find option', {
    metadata: {
      requires: {
        generators: true,
        topology: 'single'
      }
    },

    test: function(done) {
      var self = this;
      const configuration = this.configuration;
      const ReadPreference = self.configuration.require.ReadPreference;

      const client = configuration.newClient(`mongodb://${test.server.uri()}/test`);
      client.connect(function(err, client) {
        expect(err).to.not.exist;
        var db = client.db(self.configuration.db);
        var readPreference = new ReadPreference(ReadPreference.SECONDARY, null, { hedge: {} });

        // Get a db with a new readPreference
        db.collection('test')
          .find({}, { readPreference })
          .toArray(function(err) {
            expect(err).to.not.exist;
            expect(test.checkCommand).to.eql({
              $query: { find: 'test', filter: {}, returnKey: false, showRecordId: false },
              $readPreference: { mode: ReadPreference.SECONDARY, hedge: {} }
            });

            client.close(done);
          });
      });
    }
  });

  it('should correctly set hedge using setReadPreference', {
    metadata: {
      requires: {
        generators: true,
        topology: 'single'
      }
    },

    test: function(done) {
      var self = this;
      const configuration = this.configuration;
      const ReadPreference = self.configuration.require.ReadPreference;

      const client = configuration.newClient(`mongodb://${test.server.uri()}/test`);
      client.connect(function(err, client) {
        expect(err).to.not.exist;
        var db = client.db(self.configuration.db);
        var readPreference = new ReadPreference(ReadPreference.SECONDARY, null, { hedge: {} });

        // Get a db with a new readPreference
        db.collection('test')
          .find({})
          .setReadPreference(readPreference)
          .toArray(function(err) {
            expect(err).to.not.exist;
            expect(test.checkCommand).to.eql({
              $query: { find: 'test', filter: {}, returnKey: false, showRecordId: false },
              $readPreference: { mode: ReadPreference.SECONDARY, hedge: {} }
            });

            client.close(done);
          });
      });
    }
  });

  it('should correctly set hedge.enabled true', {
    metadata: {
      requires: {
        generators: true,
        topology: 'single'
      }
    },

    test: function(done) {
      var self = this;
      const configuration = this.configuration;
      const ReadPreference = self.configuration.require.ReadPreference;

      const client = configuration.newClient(`mongodb://${test.server.uri()}/test`);
      client.connect(function(err, client) {
        expect(err).to.not.exist;
        var db = client.db(self.configuration.db);
        var readPreference = new ReadPreference(ReadPreference.SECONDARY, null, {
          hedge: { enabled: true }
        });

        // Get a db with a new readPreference
        db.collection('test')
          .find({})
          .setReadPreference(readPreference)
          .toArray(function(err) {
            expect(err).to.not.exist;
            expect(test.checkCommand).to.eql({
              $query: { find: 'test', filter: {}, returnKey: false, showRecordId: false },
              $readPreference: { mode: ReadPreference.SECONDARY, hedge: { enabled: true } }
            });

            client.close(done);
          });
      });
    }
  });

  it('should correctly set hedge.enabled false', {
    metadata: {
      requires: {
        generators: true,
        topology: 'single'
      }
    },

    test: function(done) {
      var self = this;
      const configuration = this.configuration;
      const ReadPreference = self.configuration.require.ReadPreference;

      const client = configuration.newClient(`mongodb://${test.server.uri()}/test`);
      client.connect(function(err, client) {
        expect(err).to.not.exist;
        var db = client.db(self.configuration.db);
        var readPreference = new ReadPreference(ReadPreference.SECONDARY, null, {
          hedge: { enabled: false }
        });

        // Get a db with a new readPreference
        db.collection('test')
          .find({})
          .setReadPreference(readPreference)
          .toArray(function(err) {
            expect(err).to.not.exist;
            expect(test.checkCommand).to.eql({
              $query: { find: 'test', filter: {}, returnKey: false, showRecordId: false },
              $readPreference: { mode: ReadPreference.SECONDARY, hedge: { enabled: false } }
            });

            client.close(done);
          });
      });
    }
  });

  it('should correctly not set hedge', {
    metadata: {
      requires: {
        generators: true,
        topology: 'single'
      }
    },

    test: function(done) {
      var self = this;
      const configuration = this.configuration;
      const ReadPreference = self.configuration.require.ReadPreference;

      const client = configuration.newClient(`mongodb://${test.server.uri()}/test`);
      client.connect(function(err, client) {
        expect(err).to.not.exist;
        var db = client.db(self.configuration.db);
        var readPreference = new ReadPreference(ReadPreference.SECONDARY);

        // Get a db with a new readPreference
        db.collection('test')
          .find({})
          .setReadPreference(readPreference)
          .toArray(function(err) {
            expect(err).to.not.exist;
            expect(test.checkCommand.$readPreference).to.not.have.property('hedge');
            client.close(done);
          });
      });
    }
  });
});
