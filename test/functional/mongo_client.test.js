'use strict';

var f = require('util').format;
var test = require('./shared').assert;
var setupDatabase = require('./shared').setupDatabase;
const { ReadPreference } = require('../../src');
const { Db } = require('../../src/db');
const expect = require('chai').expect;
const { getTopology } = require('../../src/utils');

describe('MongoClient', function () {
  before(function () {
    return setupDatabase(this.configuration);
  });

  it('Should correctly pass through extra db options', {
    metadata: {
      requires: {
        topology: ['single']
      }
    },

    test: function (done) {
      var configuration = this.configuration;
      const client = configuration.newClient(
        {},
        {
          writeConcern: { w: 1, wtimeout: 1000, fsync: true, j: true },
          readPreference: 'nearest',
          readPreferenceTags: { loc: 'ny' },
          forceServerObjectId: true,
          pkFactory: {
            createPk() {
              return 1;
            }
          },
          serializeFunctions: true,
          raw: true,
          numberOfRetries: 10
        }
      );

      client.connect(function (err, client) {
        var db = client.db(configuration.db);

        test.equal(1, db.writeConcern.w);
        test.equal(1000, db.writeConcern.wtimeout);
        test.equal(true, db.writeConcern.fsync);
        test.equal(true, db.writeConcern.j);

        test.equal('nearest', db.s.readPreference.mode);
        test.deepEqual({ loc: 'ny' }, db.s.readPreference.tags);

        test.equal(true, db.s.options.forceServerObjectId);
        test.equal(1, db.s.pkFactory.createPk());
        test.equal(true, db.bsonOptions.serializeFunctions);
        test.equal(true, db.bsonOptions.raw);
        test.equal(10, db.s.options.numberOfRetries);

        client.close(done);
      });
    }
  });

  it('Should fail due to wrong uri user:password@localhost', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },
    test() {
      expect(() => this.configuration.newClient('user:password@localhost:27017/test')).to.throw(
        'Invalid connection string user:password@localhost:27017/test'
      );
    }
  });

  it('correctly error out when no socket available on MongoClient `connect`', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      const client = configuration.newClient('mongodb://localhost:27088/test', {
        serverSelectionTimeoutMS: 10
      });

      client.connect(function (err) {
        test.ok(err != null);

        done();
      });
    }
  });

  it('should correctly connect to mongodb using domain socket', {
    metadata: { requires: { topology: ['single'], os: '!win32' } },

    test: function (done) {
      var configuration = this.configuration;
      const client = configuration.newClient('mongodb://%2Ftmp%2Fmongodb-27017.sock/test');
      client.connect(function (err) {
        expect(err).to.not.exist;
        client.close(done);
      });
    }
  });

  it('should fail dure to garbage connection string', {
    metadata: {
      requires: {
        topology: ['single']
      }
    },

    test: function (done) {
      var configuration = this.configuration;
      const client = configuration.newClient('mongodb://unknownhost:36363/ddddd', {
        serverSelectionTimeoutMS: 10
      });

      client.connect(function (err) {
        test.ok(err != null);
        done();
      });
    }
  });

  it('Should correctly pass through appname', {
    metadata: {
      requires: {
        topology: ['single', 'replicaset', 'sharded']
      }
    },

    test: function (done) {
      var configuration = this.configuration;
      var url = configuration.url();
      if (url.indexOf('replicaSet') !== -1) {
        url = f('%s&appname=hello%20world', configuration.url());
      } else {
        url = f('%s?appname=hello%20world', configuration.url());
      }

      const client = configuration.newClient(url);
      client.connect(function (err, client) {
        expect(err).to.not.exist;
        test.equal('hello world', client.topology.clientMetadata.application.name);

        client.close(done);
      });
    }
  });

  it('Should correctly pass through appname in options', {
    metadata: {
      requires: {
        topology: ['single', 'replicaset', 'sharded']
      }
    },

    test: function (done) {
      var configuration = this.configuration;
      var url = configuration.url();

      const client = configuration.newClient(url, { appname: 'hello world' });
      client.connect(err => {
        expect(err).to.not.exist;
        test.equal('hello world', client.topology.clientMetadata.application.name);

        client.close(done);
      });
    }
  });

  it('Should correctly pass through socketTimeoutMS and connectTimeoutMS', {
    metadata: {
      requires: {
        topology: ['single', 'replicaset', 'sharded']
      }
    },

    test: function (done) {
      var configuration = this.configuration;
      const client = configuration.newClient(
        {},
        {
          socketTimeoutMS: 0,
          connectTimeoutMS: 0
        }
      );

      client.connect(function (err, client) {
        expect(err).to.not.exist;
        const topology = getTopology(client.db(configuration.db));
        expect(topology).nested.property('s.options.connectTimeoutMS').to.equal(0);
        expect(topology).nested.property('s.options.socketTimeoutMS').to.equal(0);

        client.close(done);
      });
    }
  });

  //////////////////////////////////////////////////////////////////////////////////////////
  //
  // new MongoClient connection tests
  //
  //////////////////////////////////////////////////////////////////////////////////////////
  it('Should open a new MongoClient connection', {
    metadata: {
      requires: {
        topology: ['single']
      }
    },

    test: function (done) {
      var configuration = this.configuration;
      const client = configuration.newClient();
      client.connect(function (err, mongoclient) {
        expect(err).to.not.exist;

        mongoclient
          .db('integration_tests')
          .collection('new_mongo_client_collection')
          .insertOne({ a: 1 }, function (err, r) {
            expect(err).to.not.exist;
            test.ok(r);

            mongoclient.close(done);
          });
      });
    }
  });

  it('Should open a new MongoClient connection using promise', {
    metadata: {
      requires: {
        topology: ['single']
      }
    },

    test: function (done) {
      var configuration = this.configuration;
      const client = configuration.newClient();
      client.connect().then(function (mongoclient) {
        mongoclient
          .db('integration_tests')
          .collection('new_mongo_client_collection')
          .insertOne({ a: 1 })
          .then(function (r) {
            test.ok(r);

            mongoclient.close(done);
          });
      });
    }
  });

  it('should be able to access a database named "constructor"', function () {
    const client = this.configuration.newClient();
    let err;
    return client
      .connect()
      .then(() => {
        const db = client.db('constructor');
        expect(db).to.not.be.a('function');
        expect(db).to.be.an.instanceOf(Db);
      })
      .catch(_err => (err = _err))
      .then(() => client.close())
      .catch(() => {})
      .then(() => {
        if (err) {
          throw err;
        }
      });
  });

  it('should cache a resolved readPreference from options', function () {
    const client = this.configuration.newClient({}, { readPreference: ReadPreference.SECONDARY });
    expect(client.readPreference).to.be.instanceOf(ReadPreference);
    expect(client.readPreference).to.have.property('mode', ReadPreference.SECONDARY);
  });
});
