'use strict';
const { expect } = require('chai');

const sinon = require('sinon');

const { setupDatabase, assert: test } = require('../shared');
const { format: f } = require('util');

const { MongoClient, ReadPreference } = require('../../../src');
const { Db } = require('../../../src/db');
const { Connection } = require('../../../src/cmap/connection');
const { getTopology, isHello } = require('../../../src/utils');

describe('MongoClient integration', function () {
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
      const configuration = this.configuration;
      const client = configuration.newClient(
        {},
        {
          writeConcern: { w: 1, wtimeoutMS: 1000, fsync: true, j: true },
          readPreference: 'nearest',
          readPreferenceTags: { loc: 'ny' },
          forceServerObjectId: true,
          pkFactory: {
            createPk() {
              return 1;
            }
          },
          serializeFunctions: true
        }
      );

      client.connect(function (err, client) {
        expect(err).to.be.undefined;

        const db = client.db(configuration.db);

        test.equal(1, db.writeConcern.w);
        test.equal(1000, db.writeConcern.wtimeout);
        test.equal(true, db.writeConcern.fsync);
        test.equal(true, db.writeConcern.j);

        test.equal('nearest', db.s.readPreference.mode);
        test.deepEqual([{ loc: 'ny' }], db.s.readPreference.tags);

        test.equal(true, db.s.options.forceServerObjectId);
        test.equal(1, db.s.pkFactory.createPk());
        test.equal(true, db.bsonOptions.serializeFunctions);

        client.close(done);
      });
    }
  });

  it('Should fail due to wrong uri user:password@localhost', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded'] }
    },
    test() {
      expect(() => this.configuration.newClient('user:password@localhost:27017/test')).to.throw(
        'Invalid scheme, expected connection string to start with "mongodb://" or "mongodb+srv://"'
      );
    }
  });

  it('correctly error out when no socket available on MongoClient `connect`', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded'] }
    },

    test: function (done) {
      const configuration = this.configuration;
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
      const configuration = this.configuration;
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
      const configuration = this.configuration;
      const options = {
        appName: 'hello world'
      };
      const client = configuration.newClient(options);

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
      const configuration = this.configuration;
      const url = configuration.url();

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
      const configuration = this.configuration;
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
      const configuration = this.configuration;
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

  it('Should correctly connect with MongoClient `connect` using Promise', function () {
    const configuration = this.configuration;
    let url = configuration.url();
    url =
      url.indexOf('?') !== -1
        ? f('%s&%s', url, 'maxPoolSize=100')
        : f('%s?%s', url, 'maxPoolSize=100');

    const client = configuration.newClient(url);
    return client.connect().then(() => client.close());
  });

  it('Should open a new MongoClient connection using promise', {
    metadata: {
      requires: {
        topology: ['single']
      }
    },

    test: function (done) {
      const configuration = this.configuration;
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

  it('should error on unexpected options', {
    metadata: { requires: { topology: 'single' } },

    test: function (done) {
      var configuration = this.configuration;
      MongoClient.connect(
        configuration.url(),
        {
          maxPoolSize: 4,
          notlegal: {},
          validateOptions: true
        },
        function (err, client) {
          expect(err)
            .property('message')
            .to.match(/options notlegal, validateoptions are not supported/);
          expect(client).to.not.exist;
          done();
        }
      );
    }
  });

  it('should error on unexpected options (promise)', {
    metadata: { requires: { topology: 'single' } },

    test() {
      MongoClient.connect(this.configuration.url(), {
        maxPoolSize: 4,
        notlegal: {},
        validateOptions: true
      })
        .then(() => expect().fail())
        .catch(err => {
          expect(err)
            .property('message')
            .to.match(/options notlegal, validateoptions are not supported/);
        });
    }
  });

  it('must respect an infinite connectTimeoutMS for the streaming protocol', {
    metadata: { requires: { topology: 'replicaset', mongodb: '>= 4.4' } },
    test: function (done) {
      const client = this.configuration.newClient({
        connectTimeoutMS: 0,
        heartbeatFrequencyMS: 500
      });
      client.connect(err => {
        expect(err).to.not.exist;
        const stub = sinon.stub(Connection.prototype, 'command').callsFake(function () {
          const args = Array.prototype.slice.call(arguments);
          const ns = args[0];
          const command = args[1];
          const options = args[2] || {};
          if (ns.toString() === 'admin.$cmd' && isHello(command) && options.exhaustAllowed) {
            expect(options).property('socketTimeoutMS').to.equal(0);
            stub.restore();
            client.close(done);
          }
          stub.wrappedMethod.apply(this, args);
        });
      });
    }
  });

  it('must respect a finite connectTimeoutMS for the streaming protocol', {
    metadata: { requires: { topology: 'replicaset', mongodb: '>= 4.4' } },
    test: function (done) {
      const client = this.configuration.newClient({
        connectTimeoutMS: 10,
        heartbeatFrequencyMS: 500
      });
      client.connect(err => {
        expect(err).to.not.exist;
        const stub = sinon.stub(Connection.prototype, 'command').callsFake(function () {
          const args = Array.prototype.slice.call(arguments);
          const ns = args[0];
          const command = args[1];
          const options = args[2] || {};
          if (ns.toString() === 'admin.$cmd' && isHello(command) && options.exhaustAllowed) {
            expect(options).property('socketTimeoutMS').to.equal(510);
            stub.restore();
            client.close(done);
          }
          stub.wrappedMethod.apply(this, args);
        });
      });
    }
  });
});
