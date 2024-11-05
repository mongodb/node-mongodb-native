import { expect } from 'chai';
import { once } from 'events';
import * as net from 'net';
import * as sinon from 'sinon';

import {
  type CommandFailedEvent,
  type CommandStartedEvent,
  type CommandSucceededEvent,
  Connection,
  Db,
  getTopology,
  MongoClient,
  MongoNotConnectedError,
  MongoServerSelectionError,
  ReadPreference,
  ServerDescription,
  Topology
} from '../../mongodb';
import { runLater } from '../../tools/utils';
import { setupDatabase } from '../shared';

describe('class MongoClient', function () {
  let client: MongoClient;

  before(function () {
    return setupDatabase(this.configuration);
  });

  afterEach(async () => {
    sinon.restore();
    await client?.close();
    // @ts-expect-error: Put this variable back to undefined to force tests to make their own client
    client = undefined;
  });

  it('should correctly pass through extra db options', {
    metadata: { requires: { topology: ['single'] } },
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

        expect(db).to.have.property('writeConcern');
        expect(db.writeConcern).to.have.property('w', 1);
        expect(db.writeConcern).to.have.property('wtimeoutMS', 1000);
        expect(db.writeConcern).to.have.property('journal', true);

        expect(db).to.have.property('s');
        expect(db.s).to.have.property('readPreference');
        expect(db.s.readPreference).to.have.property('mode', 'nearest');
        expect(db.s.readPreference)
          .to.have.property('tags')
          .that.deep.equals([{ loc: 'ny' }]);

        expect(db.s).to.have.nested.property('options.forceServerObjectId');
        expect(db.s.options).to.have.property('forceServerObjectId', true);
        expect(db.s).to.have.nested.property('pkFactory.createPk').that.is.a('function');
        expect(db.s.pkFactory.createPk()).to.equal(1);
        expect(db).to.have.nested.property('bsonOptions.serializeFunctions');

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
        expect(err).to.exist;

        done();
      });
    }
  });

  it('should correctly connect to mongodb using domain socket', {
    metadata: { requires: { topology: ['single'], os: '!win32' } },

    test: function (done) {
      const configuration = this.configuration;
      const client = configuration.newClient('mongodb://%2Ftmp%2Fmongodb-27017.sock/test');
      client.connect(function (err) {
        expect(err).to.not.exist;
        client.close(done);
      });
    }
  });

  it('should fail to connect due to unknown host in connection string', async function () {
    const configuration = this.configuration;
    const client = configuration.newClient('mongodb://iLoveJavascript:36363/ddddd', {
      serverSelectionTimeoutMS: 10
    });

    const error = await client.connect().catch(error => error);
    expect(error).to.be.instanceOf(MongoServerSelectionError);
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
        expect(client)
          .to.have.nested.property('topology.clientMetadata.application.name')
          .to.equal('hello world');

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
        expect(client)
          .to.have.nested.property('topology.clientMetadata.application.name')
          .to.equal('hello world');

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

  it('should open a new MongoClient connection', {
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
            expect(r).to.be.an('object');

            mongoclient.close(done);
          });
      });
    }
  });

  it('should correctly connect with MongoClient `connect` using Promise', function () {
    const configuration = this.configuration;
    let url = configuration.url();
    url = url.indexOf('?') !== -1 ? `${url}&maxPoolSize=100` : `${url}?maxPoolSize=100`;

    const client = configuration.newClient(url);
    return client.connect().then(() => client.close());
  });

  it('should open a new MongoClient connection using promise', {
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
            expect(r).to.exist;

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
      .catch(() => {
        // ignore
      })
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
      const configuration = this.configuration;
      MongoClient.connect(
        configuration.url(),
        {
          maxPoolSize: 4,
          // @ts-expect-error: unexpected option test
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
      const options = {
        maxPoolSize: 4,
        notlegal: {},
        validateOptions: true
      };
      MongoClient.connect(this.configuration.url(), options)
        .then(() => expect.fail())
        .catch(err => {
          expect(err)
            .property('message')
            .to.match(/options notlegal, validateoptions are not supported/);
        });
    }
  });

  it('must respect an infinite connectTimeoutMS for the streaming protocol', {
    metadata: { requires: { topology: 'replicaset', mongodb: '>= 4.4' } },
    test: async function () {
      client = this.configuration.newClient({
        connectTimeoutMS: 0,
        heartbeatFrequencyMS: 500
      });

      const spy = sinon.spy(Connection.prototype, 'command');

      await client.connect();

      const options = spy.getCall(0).args[2];
      expect(options).property('socketTimeoutMS').to.equal(0);
    }
  });

  it('must respect a finite connectTimeoutMS for the streaming protocol', {
    metadata: { requires: { topology: 'replicaset', mongodb: '>= 4.4' } },
    test: async function () {
      client = this.configuration.newClient({
        connectTimeoutMS: 10,
        heartbeatFrequencyMS: 500
      });

      const spy = sinon.spy(Connection.prototype, 'command');

      await client.connect();

      const options = spy.getCall(0).args[2];
      expect(options).property('socketTimeoutMS').to.equal(10);
    }
  });

  context('explict #connect()', () => {
    let client: MongoClient;
    beforeEach(function () {
      client = this.configuration.newClient(this.configuration.url(), {
        monitorCommands: true
      });
    });

    afterEach(async function () {
      await client.close();
    });

    it(
      'creates topology and send ping when auth is enabled',
      { requires: { auth: 'enabled' } },
      async function () {
        const commandToBeStarted = once(client, 'commandStarted');
        await client.connect();
        const [pingOnConnect] = await commandToBeStarted;
        expect(pingOnConnect).to.have.property('commandName', 'ping');
        expect(client).to.have.property('topology').that.is.instanceOf(Topology);
      }
    );

    it(
      'does not send ping when authentication is disabled',
      { requires: { auth: 'disabled' } },
      async function () {
        const commandToBeStarted = once(client, 'commandStarted');
        await client.connect();
        const delayedFind = runLater(async () => {
          await client.db().collection('test').findOne();
        }, 300);
        const [findOneOperation] = await commandToBeStarted;
        // Proves that the first command started event that is emitted is a find and not a ping
        expect(findOneOperation).to.have.property('commandName', 'find');
        await delayedFind;
        expect(client).to.have.property('topology').that.is.instanceOf(Topology);
      }
    );

    it(
      'permits operations to be run after connect is called',
      { requires: { auth: 'enabled' } },
      async function () {
        const pingCommandToBeStarted = once(client, 'commandStarted');
        await client.connect();
        const [pingOnConnect] = await pingCommandToBeStarted;

        const findCommandToBeStarted = once(client, 'commandStarted');
        await client.db('test').collection('test').findOne();
        const [findCommandStarted] = await findCommandToBeStarted;

        expect(pingOnConnect).to.have.property('commandName', 'ping');
        expect(findCommandStarted).to.have.property('commandName', 'find');
        expect(client).to.have.property('topology').that.is.instanceOf(Topology);
      }
    );
  });

  context('implicit #connect()', () => {
    let client: MongoClient;
    beforeEach(function () {
      client = this.configuration.newClient(this.configuration.url(), {
        monitorCommands: true
      });
    });

    afterEach(async function () {
      await client.close();
    });

    it(
      'automatically connects upon first operation (find)',
      { requires: { auth: 'enabled' } },
      async function () {
        const findCommandToBeStarted = once(client, 'commandStarted');
        await client.db().collection('test').findOne();
        const [findCommandStarted] = await findCommandToBeStarted;

        expect(findCommandStarted).to.have.property('commandName', 'find');
        expect(client.options).to.not.have.property(Symbol.for('@@mdb.skipPingOnConnect'));
        expect(client.s.options).to.not.have.property(Symbol.for('@@mdb.skipPingOnConnect'));

        // Assertion is redundant but it shows that no initial ping is run
        expect(findCommandStarted.commandName).to.not.equal('ping');

        expect(client).to.have.property('topology').that.is.instanceOf(Topology);
      }
    );

    it(
      'automatically connects upon first operation (insertOne)',
      { requires: { auth: 'enabled' } },
      async function () {
        const insertOneCommandToBeStarted = once(client, 'commandStarted');
        await client.db().collection('test').insertOne({ a: 1 });
        const [insertCommandStarted] = await insertOneCommandToBeStarted;

        expect(insertCommandStarted).to.have.property('commandName', 'insert');
        expect(client.options).to.not.have.property(Symbol.for('@@mdb.skipPingOnConnect'));
        expect(client.s.options).to.not.have.property(Symbol.for('@@mdb.skipPingOnConnect'));

        // Assertion is redundant but it shows that no initial ping is run
        expect(insertCommandStarted.commandName).to.not.equal('ping');

        expect(client).to.have.property('topology').that.is.instanceOf(Topology);
      }
    );

    it(
      'passes connection errors to the user through the first operation',
      { requires: { auth: 'enabled' } },
      async function () {
        const client = this.configuration.newClient(
          'mongodb://iLoveJavascript?serverSelectionTimeoutMS=100',
          { monitorCommands: true }
        );

        const result = await client
          .db('test')
          .collection('test')
          .findOne()
          .catch(error => error);

        expect(result).to.be.instanceOf(MongoServerSelectionError);
        expect(client).to.be.instanceOf(MongoClient);
        expect(client).to.have.property('topology').that.is.instanceOf(Topology);
      }
    );
  });

  context('concurrent #connect()', () => {
    let client: MongoClient;
    let topologyOpenEvents;

    /** Keep track number of call to client connect to close as many as connect (otherwise leak_checker hook will failed) */
    let clientConnectCounter: number;

    /**
     * Wrap the connect method of the client to keep track
     * of number of times connect is called
     */
    async function clientConnect() {
      if (!client) {
        return;
      }
      clientConnectCounter++;
      return client.connect();
    }

    beforeEach(async function () {
      client = this.configuration.newClient();
      topologyOpenEvents = [];
      clientConnectCounter = 0;
      client.on('open', event => topologyOpenEvents.push(event));
    });

    afterEach(async function () {
      // close `clientConnectCounter` times
      const clientClosePromises = Array.from({ length: clientConnectCounter }, () =>
        client.close()
      );
      await Promise.all(clientClosePromises);
    });

    it('parallel client connect calls only create one topology', async function () {
      await Promise.all([clientConnect(), clientConnect(), clientConnect()]);

      expect(topologyOpenEvents).to.have.lengthOf(1);
      expect(client.topology?.isConnected()).to.be.true;
    });

    it('when connect rejects lock is released regardless', async function () {
      const internalConnectStub = sinon.stub(client, '_connect' as keyof MongoClient);
      internalConnectStub.onFirstCall().rejects(new Error('cannot connect'));

      // first call rejected to simulate a connection failure
      const error = await clientConnect().catch(error => error);
      expect(error).to.match(/cannot connect/);

      internalConnectStub.restore();

      // second call should connect
      await clientConnect();

      expect(topologyOpenEvents).to.have.lengthOf(1);
      expect(client.topology?.isConnected()).to.be.true;
    });
  });

  context('#close()', () => {
    let client: MongoClient;
    let db: Db;

    const RD_ONLY_HAS_BEEN_CLOSED = {
      value: true,
      enumerable: true,
      configurable: false,
      writable: false
    };

    const INIT_HAS_BEEN_CLOSED = {
      value: false,
      enumerable: true,
      configurable: true,
      writable: true
    };

    beforeEach(function () {
      client = this.configuration.newClient({ monitorCommands: true });
      db = client.db();
    });

    afterEach(async function () {
      await client.close();
      db = null;
    });

    it('prevents automatic connection on a closed non-connected client', async () => {
      expect(client.s).to.have.ownPropertyDescriptor('hasBeenClosed', INIT_HAS_BEEN_CLOSED);
      await client.close();
      expect(client.s).to.have.ownPropertyDescriptor('hasBeenClosed', RD_ONLY_HAS_BEEN_CLOSED);
      const error = await db.command({ ping: 1 }).catch(error => error);
      expect(error).to.be.instanceOf(MongoNotConnectedError);
    });

    it('allows explicit connection on a closed non-connected client', async () => {
      expect(client.s).to.have.ownPropertyDescriptor('hasBeenClosed', INIT_HAS_BEEN_CLOSED);
      await client.close();
      expect(client.s).to.have.ownPropertyDescriptor('hasBeenClosed', RD_ONLY_HAS_BEEN_CLOSED);
      await client.connect();
      const result = await db.command({ ping: 1 }).catch(error => error);
      expect(result).to.not.be.instanceOf(MongoNotConnectedError);
      expect(result).to.have.property('ok', 1);
    });

    it('prevents automatic reconnect on a closed previously explicitly connected client', async () => {
      await client.connect();
      expect(client.s).to.have.ownPropertyDescriptor('hasBeenClosed', INIT_HAS_BEEN_CLOSED);
      await client.close();
      expect(client.s).to.have.ownPropertyDescriptor('hasBeenClosed', RD_ONLY_HAS_BEEN_CLOSED);
      const error = await db.command({ ping: 1 }).catch(error => error);
      expect(error).to.be.instanceOf(MongoNotConnectedError);
    });

    it('allows explicit reconnect on a closed previously explicitly connected client', async () => {
      await client.connect();
      expect(client.s).to.have.ownPropertyDescriptor('hasBeenClosed', INIT_HAS_BEEN_CLOSED);
      await client.close();
      expect(client.s).to.have.ownPropertyDescriptor('hasBeenClosed', RD_ONLY_HAS_BEEN_CLOSED);
      await client.connect();
      const result = await db.command({ ping: 1 }).catch(error => error);
      expect(result).to.not.be.instanceOf(MongoNotConnectedError);
      expect(result).to.have.property('ok', 1);
    });

    it('prevents auto reconnect on closed previously implicitly connected client', async () => {
      expect(client.s).to.have.ownPropertyDescriptor('hasBeenClosed', INIT_HAS_BEEN_CLOSED);
      const result = await db.command({ ping: 1 }).catch(error => error); // auto connect
      expect(result).to.not.be.instanceOf(MongoNotConnectedError);
      expect(result).to.have.property('ok', 1);
      await client.close();
      expect(client.s).to.have.ownPropertyDescriptor('hasBeenClosed', RD_ONLY_HAS_BEEN_CLOSED);
      const error = await db.command({ ping: 1 }).catch(error => error);
      expect(error).to.be.instanceOf(MongoNotConnectedError);
    });

    it('allows explicit reconnect on closed previously implicitly connected client', async () => {
      expect(client.s).to.have.ownPropertyDescriptor('hasBeenClosed', INIT_HAS_BEEN_CLOSED);
      const result = await db.command({ ping: 1 }).catch(error => error); // auto connect
      expect(result).to.not.be.instanceOf(MongoNotConnectedError);
      expect(result).to.have.property('ok', 1);
      await client.close();
      await client.connect();
      expect(client.s).to.have.ownPropertyDescriptor('hasBeenClosed', RD_ONLY_HAS_BEEN_CLOSED);
      const result2 = await db.command({ ping: 1 }).catch(error => error);
      expect(result2).to.not.be.instanceOf(MongoNotConnectedError);
      expect(result2).to.have.property('ok', 1);
    });

    it('prevents auto reconnect on closed explicitly connected client after an operation', async () => {
      expect(client.s).to.have.ownPropertyDescriptor('hasBeenClosed', INIT_HAS_BEEN_CLOSED);
      await client.connect();
      const result = await db.command({ ping: 1 }).catch(error => error);
      expect(result).to.not.be.instanceOf(MongoNotConnectedError);
      expect(result).to.have.property('ok', 1);
      await client.close();
      expect(client.s).to.have.ownPropertyDescriptor('hasBeenClosed', RD_ONLY_HAS_BEEN_CLOSED);
      const error = await db.command({ ping: 1 }).catch(error => error);
      expect(error).to.be.instanceOf(MongoNotConnectedError);
    });

    it('allows explicit reconnect on closed explicitly connected client after an operation', async () => {
      expect(client.s).to.have.ownPropertyDescriptor('hasBeenClosed', INIT_HAS_BEEN_CLOSED);
      await client.connect();
      const result = await db.command({ ping: 1 }).catch(error => error);
      expect(result).to.not.be.instanceOf(MongoNotConnectedError);
      expect(result).to.have.property('ok', 1);
      await client.close();
      await client.connect();
      expect(client.s).to.have.ownPropertyDescriptor('hasBeenClosed', RD_ONLY_HAS_BEEN_CLOSED);
      const result2 = await db.command({ ping: 1 }).catch(error => error);
      expect(result2).to.not.be.instanceOf(MongoNotConnectedError);
      expect(result2).to.have.property('ok', 1);
    });

    it('sends endSessions with writeConcern w = 0 set', async () => {
      const session = client.startSession(); // make a session to be ended
      await client.db('test').command({ ping: 1 }, { session });
      await session.endSession();

      const startedEvents: CommandStartedEvent[] = [];
      const endEvents: Array<CommandFailedEvent | CommandSucceededEvent> = [];
      client.on('commandStarted', event => startedEvents.push(event));
      client.on('commandSucceeded', event => endEvents.push(event));
      client.on('commandFailed', event => endEvents.push(event));

      await client.close();

      expect(startedEvents).to.have.lengthOf(1);
      expect(startedEvents[0]).to.have.property('commandName', 'endSessions');
      expect(endEvents).to.have.lengthOf(1);
      expect(endEvents[0]).to.containSubset({ reply: { ok: 1 } }); // moreToCome = true
    });

    context('when server selection would return no servers', () => {
      const serverDescription = new ServerDescription('a:1');

      it('short circuits and does not end sessions', async () => {
        const session = client.startSession(); // make a session to be ended
        await client.db('test').command({ ping: 1 }, { session });
        await session.endSession();

        const startedEvents: CommandStartedEvent[] = [];
        client.on('commandStarted', event => startedEvents.push(event));

        const servers = new Map<string, ServerDescription>();
        servers.set(serverDescription.address, serverDescription);
        client.topology.description.servers = servers;
        await client.close();

        expect(startedEvents).to.be.empty;
        expect(client.s.sessionPool.sessions).to.have.lengthOf(1);
      });
    });
  });

  context('when connecting', function () {
    let netSpy;

    beforeEach(function () {
      netSpy = sinon.spy(net, 'createConnection');
    });

    afterEach(function () {
      sinon.restore();
    });

    context('when auto select options are provided', function () {
      beforeEach(function () {
        client = this.configuration.newClient({
          autoSelectFamily: false,
          autoSelectFamilyAttemptTimeout: 100
        });
      });

      it('sets the provided options', {
        metadata: { requires: { topology: ['single'] } },
        test: async function () {
          await client.connect();
          expect(netSpy).to.have.been.calledWith({
            autoSelectFamily: false,
            autoSelectFamilyAttemptTimeout: 100,
            host: 'localhost',
            port: 27017
          });
        }
      });
    });

    context('when auto select options are not provided', function () {
      beforeEach(function () {
        client = this.configuration.newClient();
      });

      it('sets the default options', {
        metadata: { requires: { topology: ['single'] } },
        test: async function () {
          await client.connect();
          expect(netSpy).to.have.been.calledWith({
            autoSelectFamily: true,
            host: 'localhost',
            port: 27017
          });
        }
      });
    });
  });
});
