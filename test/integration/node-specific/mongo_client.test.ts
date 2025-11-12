import { expect } from 'chai';
import { once } from 'events';
import * as net from 'net';
import * as sinon from 'sinon';

import {
  type Collection,
  type CommandStartedEvent,
  type CommandSucceededEvent,
  Db,
  MongoClient,
  MongoNetworkError,
  MongoNotConnectedError,
  MongoServerSelectionError,
  ReadPreference
} from '../../../src';
import { Connection } from '../../../src/cmap/connection';
import { ServerDescription } from '../../../src/sdam/server_description';
import { Topology } from '../../../src/sdam/topology';
import { clearFailPoint, configureFailPoint } from '../../tools/utils';
import { setupDatabase } from '../shared';

describe('class MongoClient', function () {
  let client: MongoClient;

  before(function () {
    return setupDatabase(this.configuration);
  });

  afterEach(async () => {
    sinon.restore();
    await client?.close();
    client = undefined;
  });

  it(
    'should correctly pass through extra db options',
    { requires: { topology: 'single' } },
    async function () {
      const configuration = this.configuration;
      const client = configuration.newClient(
        {},
        {
          writeConcern: { w: 1, wtimeoutMS: 1000, fsync: true, j: true },
          readPreference: 'nearest',
          readPreferenceTags: [{ loc: 'ny' }],
          forceServerObjectId: true,
          pkFactory: {
            createPk() {
              return 1;
            }
          },
          serializeFunctions: true
        }
      );

      await client.connect();

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

      await client.close();
    }
  );

  it('Should fail due to wrong uri user:password@localhost', function () {
    expect(() => this.configuration.newClient('user:password@localhost:27017/test')).to.throw(
      'Invalid scheme, expected connection string to start with "mongodb://" or "mongodb+srv://"'
    );
  });

  it('correctly error out when no socket available on MongoClient `connect`', async function () {
    const configuration = this.configuration;
    const client = configuration.newClient('mongodb://localhost:27088/test', {
      serverSelectionTimeoutMS: 10
    });

    const error = await client.connect().catch(e => e);
    expect(error).to.be.instanceOf(MongoServerSelectionError);
  });

  it('should correctly connect to mongodb using domain socket', {
    metadata: { requires: { topology: ['single'], os: '!win32' } },
    test: async function () {
      const configuration = this.configuration;
      const client = configuration.newClient('mongodb://%2Ftmp%2Fmongodb-27017.sock/test');
      await client.connect();
      await client.close();
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

  describe('#connect', function () {
    context('when keepAliveInitialDelay is provided', function () {
      context('when the value is 0', function () {
        const options = { keepAliveInitialDelay: 0 };
        let client;
        let spy;

        beforeEach(async function () {
          spy = sinon.spy(net, 'createConnection');
          const uri = this.configuration.url();
          client = new MongoClient(uri, options);
          await client.connect();
        });

        afterEach(async function () {
          await client?.close();
          spy.restore();
        });

        it('passes through the option', {
          metadata: { requires: { apiVersion: false } },
          test: function () {
            expect(spy).to.have.been.calledWith(
              sinon.match({
                keepAlive: true,
                keepAliveInitialDelay: 0
              })
            );
          }
        });
      });

      context('when the value is positive', function () {
        const options = { keepAliveInitialDelay: 100 };
        let client;
        let spy;

        beforeEach(async function () {
          spy = sinon.spy(net, 'createConnection');
          const uri = this.configuration.url();
          client = new MongoClient(uri, options);
          await client.connect();
        });

        afterEach(async function () {
          await client?.close();
          spy.restore();
        });

        it('passes through the option', {
          metadata: { requires: { apiVersion: false } },
          test: function () {
            expect(spy).to.have.been.calledWith(
              sinon.match({
                keepAlive: true,
                keepAliveInitialDelay: 100
              })
            );
          }
        });
      });

      context('when the value is negative', function () {
        const options = { keepAliveInitialDelay: -100 };
        let client;
        let spy;

        beforeEach(async function () {
          spy = sinon.spy(net, 'createConnection');
          const uri = this.configuration.url();
          client = new MongoClient(uri, options);
          await client.connect();
        });

        afterEach(async function () {
          await client?.close();
          spy.restore();
        });

        it('the Node.js runtime sets the option to 0', {
          metadata: { requires: { apiVersion: false } },
          test: function () {
            expect(spy).to.have.been.calledWith(
              sinon.match({
                keepAlive: true,
                keepAliveInitialDelay: 0
              })
            );
          }
        });
      });

      context('when the value is mistyped', function () {
        // Set server selection timeout to get the error quicker.
        const options = { keepAliveInitialDelay: 'test', serverSelectionTimeoutMS: 1000 };
        let client;
        let spy;

        beforeEach(async function () {
          spy = sinon.spy(net, 'createConnection');
          const uri = this.configuration.url();
          // @ts-expect-error Intentional test of invalid options
          client = new MongoClient(uri, options);
        });

        afterEach(async function () {
          await client?.close();
          spy.restore();
        });

        it('throws an error', {
          metadata: { requires: { apiVersion: false } },
          test: async function () {
            const error = await client.connect().catch(error => error);
            expect(error.message).to.include(
              'property must be of type number. Received type string'
            );
          }
        });
      });
    });

    context('when keepAliveInitialDelay is not provided', function () {
      let client;
      let spy;

      beforeEach(async function () {
        spy = sinon.spy(net, 'createConnection');
        client = this.configuration.newClient();
        await client.connect();
      });

      afterEach(async function () {
        await client?.close();
        spy.restore();
      });

      it('sets keepalive to 120000', function () {
        expect(spy).to.have.been.calledWith(
          sinon.match({
            keepAlive: true,
            keepAliveInitialDelay: 120000
          })
        );
      });
    });

    context('when noDelay is not provided', function () {
      let client;
      let spy;

      beforeEach(async function () {
        spy = sinon.spy(net, 'createConnection');
        client = this.configuration.newClient();
        await client.connect();
      });

      afterEach(async function () {
        await client?.close();
        spy.restore();
      });

      it('sets noDelay to true', function () {
        expect(spy).to.have.been.calledWith(
          sinon.match({
            noDelay: true
          })
        );
      });
    });

    context('when noDelay is provided', function () {
      let client;
      let spy;

      beforeEach(async function () {
        const options = { noDelay: false };
        spy = sinon.spy(net, 'createConnection');
        const uri = this.configuration.url();
        client = new MongoClient(uri, options);
        await client.connect();
      });

      afterEach(async function () {
        await client?.close();
        spy.restore();
      });

      it('sets noDelay', {
        metadata: { requires: { apiVersion: false } },
        test: function () {
          expect(spy).to.have.been.calledWith(
            sinon.match({
              noDelay: false
            })
          );
        }
      });
    });

    it('throws ENOTFOUND error when connecting to non-existent host with no auth and loadBalanced=true', async function () {
      const configuration = this.configuration;
      const client = configuration.newClient(
        'mongodb://iLoveJavaScript:27017/test?loadBalanced=true',
        { serverSelectionTimeoutMS: 100 }
      );

      const error = await client.connect().catch(error => error);
      expect(error).to.be.instanceOf(MongoNetworkError); // not server selection like other topologies
      expect(error.message).to.match(/ENOTFOUND/);
    });

    it('throws an error when srv is not a real record', async function () {
      const client = this.configuration.newClient('mongodb+srv://iLoveJavaScript/test', {
        serverSelectionTimeoutMS: 100
      });

      const error = await client.connect().catch(error => error);
      expect(error).to.be.instanceOf(Error);
      expect(error.message).to.match(/ENOTFOUND/);
    });
  });

  it('Should correctly pass through appname', async function () {
    const configuration = this.configuration;
    const options = {
      appName: 'hello world'
    };
    const client = configuration.newClient(options);

    const {
      application: { name }
    } = await client.options.metadata;
    expect(name).to.equal('hello world');
  });

  it('Should correctly pass through appname in options', async function () {
    const configuration = this.configuration;
    const url = this.configuration.url();
    const client = configuration.newClient(url, { appName: 'hello world' });

    const {
      application: { name }
    } = await client.options.metadata;
    expect(name).to.equal('hello world');
  });

  it('Should correctly pass through socketTimeoutMS and connectTimeoutMS', async function () {
    const configuration = this.configuration;
    const client = configuration.newClient(
      {},
      {
        socketTimeoutMS: 0,
        connectTimeoutMS: 0
      }
    );

    await client.connect();
    const topology = client.topology;
    expect(topology).nested.property('s.options.connectTimeoutMS').to.equal(0);
    expect(topology).nested.property('s.options.socketTimeoutMS').to.equal(0);

    await client.close();
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

  it('should error on unexpected options', async function () {
    const configuration = this.configuration;
    const error = await MongoClient.connect(configuration.url(), {
      maxPoolSize: 4,
      // @ts-expect-error: unexpected option test
      notlegal: {},
      validateOptions: true
    }).catch(e => e);

    expect(error)
      .property('message')
      .to.match(/options notlegal, validateoptions are not supported/);
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
      'creates topology and checks out connection when auth is enabled',
      { requires: { auth: 'enabled' } },
      async function () {
        const checkoutStarted = once(client, 'connectionCheckOutStarted');
        await client.connect();
        const checkout = await checkoutStarted;
        expect(checkout).to.exist;
        expect(client).to.have.property('topology').that.is.instanceOf(Topology);
      }
    );

    it(
      'checks out connection to confirm connectivity even when authentication is disabled',
      { requires: { auth: 'disabled' } },
      async function () {
        const checkoutStarted = once(client, 'connectionCheckOutStarted');
        await client.connect();
        const checkout = await checkoutStarted;
        expect(checkout).to.exist;
        expect(client).to.have.property('topology').that.is.instanceOf(Topology);
      }
    );

    it(
      'permits operations to be run after connect is called',
      { requires: { auth: 'enabled' } },
      async function () {
        const checkoutStarted = once(client, 'connectionCheckOutStarted');
        await client.connect();
        const checkout = await checkoutStarted;
        expect(checkout).to.exist;

        const findCommandToBeStarted = once(client, 'commandStarted');
        await client.db('test').collection('test').findOne();
        const [findCommandStarted] = await findCommandToBeStarted;

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
        expect(client.options).to.not.have.property('__skipPingOnConnect');
        expect(client.s.options).to.not.have.property('__skipPingOnConnect');

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
        expect(client.options).to.not.have.property('__skipPingOnConnect');
        expect(client.s.options).to.not.have.property('__skipPingOnConnect');

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
        await client.close();
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

  describe('active cursors', function () {
    let client: MongoClient;
    let collection: Collection<{ _id: number }>;
    const kills = [];

    beforeEach(async function () {
      client = this.configuration.newClient();
      collection = client.db('activeCursors').collection('activeCursors');
      await collection.drop();
      await collection.insertMany(Array.from({ length: 50 }, (_, _id) => ({ _id })));

      kills.length = 0;
      client.on('commandStarted', ev => ev.commandName === 'killCursors' && kills.push(ev));
    });

    afterEach(async function () {
      await client.close();
    });

    it('are tracked upon creation and removed upon exhaustion', async () => {
      const cursors = Array.from({ length: 30 }, (_, skip) =>
        collection.find({}, { skip, batchSize: 1 })
      );
      expect(client.s.activeCursors).to.have.lengthOf(30);
      await Promise.all(cursors.map(c => c.toArray()));
      expect(client.s.activeCursors).to.have.lengthOf(0);
      expect(kills).to.have.lengthOf(0);
    });

    it('are removed from tracking if exhausted in first batch', async () => {
      const cursors = Array.from({ length: 30 }, () => collection.find());
      expect(client.s.activeCursors).to.have.lengthOf(30);
      await Promise.all(cursors.map(c => c.next())); // only one document pulled from each.
      expect(client.s.activeCursors).to.have.lengthOf(0);
    });
  });

  describe('#close()', () => {
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

    it('sends endSessions with w: 0 set', async () => {
      const session = client.startSession(); // make a session to be ended
      await client.db('test').command({ ping: 1 }, { session });
      await session.endSession();

      const startedEvents: CommandStartedEvent[] = [];
      const endEvents: Array<CommandSucceededEvent> = [];
      client.on('commandStarted', event => startedEvents.push(event));
      client.on('commandSucceeded', event => endEvents.push(event));

      await client.close();

      expect(startedEvents).to.have.lengthOf(1);
      const [
        {
          command: { endSessions, writeConcern }
        }
      ] = startedEvents;
      expect(endSessions).to.exist;
      expect(writeConcern).to.deep.equal({ w: 0 });
      expect(endEvents).to.have.lengthOf(1);

      const [{ reply }] = endEvents;

      // when unacknowledged writes are used, the driver uses `{ ok: 1 }` as a placeholder
      // `reply` in CommandSucceededEvents
      expect(reply).to.deep.equal({ ok: 1 });
    });

    describe('when server selection would return no servers', () => {
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

    context('concurrent calls', () => {
      let topologyClosedSpy;
      beforeEach(async function () {
        await client.connect();
        const coll = client.db('db').collection('concurrentCalls');
        const session = client.startSession();
        await coll.findOne({}, { session: session });
        topologyClosedSpy = sinon.spy(Topology.prototype, 'close');
      });

      afterEach(async function () {
        sinon.restore();
      });

      context('when two concurrent calls to close() occur', () => {
        it('does not throw', async function () {
          await Promise.all([client.close(), client.close()]);
        });

        it('clean-up logic is performed only once', async function () {
          await Promise.all([client.close(), client.close()]);
          expect(topologyClosedSpy).to.have.been.calledOnce;
        });
      });

      context('when more than two concurrent calls to close() occur', () => {
        it('does not throw', async function () {
          await Promise.all([client.close(), client.close(), client.close(), client.close()]);
        });

        it('clean-up logic is performed only once', async function () {
          await client.connect();
          await Promise.all([
            client.close(),
            client.close(),
            client.close(),
            client.close(),
            client.close()
          ]);
          expect(topologyClosedSpy).to.have.been.calledOnce;
        });
      });

      it('when connect rejects lock is released regardless', async function () {
        expect(client.topology?.isConnected()).to.be.true;

        const closeStub = sinon.stub(client, 'close');
        closeStub.onFirstCall().rejects(new Error('cannot close'));

        // first call rejected to simulate a close failure
        const error = await client.close().catch(error => error);
        expect(error).to.match(/cannot close/);

        expect(client.topology?.isConnected()).to.be.true;
        closeStub.restore();

        // second call should close
        await client.close();

        expect(client.topology).to.be.undefined;
      });
    });

    describe('active cursors', function () {
      let collection: Collection<{ _id: number }>;
      const kills = [];

      beforeEach(async () => {
        collection = client.db('test').collection('activeCursors');
        await collection.drop();
        await collection.insertMany(Array.from({ length: 50 }, (_, _id) => ({ _id })));

        kills.length = 0;
        client.on('commandStarted', ev => ev.commandName === 'killCursors' && kills.push(ev));
      });

      it('are all closed', async function () {
        const cursors = Array.from({ length: 30 }, (_, skip) =>
          collection.find({}, { skip, batchSize: 1 })
        );
        await Promise.all(cursors.map(c => c.next()));
        expect(client.s.activeCursors).to.have.lengthOf(30);
        await client.close();
        expect(client.s.activeCursors).to.have.lengthOf(0);
        expect(kills).to.have.lengthOf(this.configuration.topologyType === 'LoadBalanced' ? 0 : 30);
      });

      it('creating cursors after close adds to activeCursors', async () => {
        expect(client.s.activeCursors).to.have.lengthOf(0);
        await client.close();
        collection.find({});
        expect(client.s.activeCursors).to.have.lengthOf(1);
      });

      it('rewinding cursors after close adds to activeCursors', async () => {
        expect(client.s.activeCursors).to.have.lengthOf(0);
        const cursor = collection.find({}, { batchSize: 1 });
        await cursor.next();
        expect(client.s.activeCursors).to.have.lengthOf(1);
        await client.close();
        expect(client.s.activeCursors).to.have.lengthOf(0);
        cursor.rewind();
        expect(client.s.activeCursors).to.have.lengthOf(1);
      });
    });

    const metadata: MongoDBMetadataUI = { requires: { mongodb: '>=4.4', topology: 'single' } };

    describe(
      'maxPoolSize is not fully used when running clean up operations',
      metadata,
      function () {
        let client;

        beforeEach(async function () {
          if (!this.configuration.filters.MongoDBVersionFilter.filter({ metadata })) {
            return;
          }
          if (!this.configuration.filters.MongoDBTopologyFilter.filter({ metadata })) {
            return;
          }

          await configureFailPoint(this.configuration, {
            configureFailPoint: 'failCommand',
            mode: 'alwaysOn',
            data: {
              failCommands: ['insert'],
              blockConnection: true,
              blockTimeMS: 500
            }
          });

          client = this.configuration.newClient({}, { maxPoolSize: 1, monitorCommands: true });
        });

        afterEach(async function () {
          await clearFailPoint(this.configuration);
          await client.close();
        });

        it(
          'closes in-use connections before running clean up operations avoiding a deadlock',
          metadata,
          async () => {
            const inserted = client
              .db('t')
              .collection('t')
              .insertOne({ a: 1 })
              .catch(error => error);

            await once(client, 'commandStarted');

            const start = performance.now();
            await client.close();
            await inserted;
            const end = performance.now();

            expect(end - start).to.be.lessThan(100);
          }
        );
      }
    );
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
          expect(netSpy).to.have.been.calledWith(
            sinon.match({
              autoSelectFamily: false,
              autoSelectFamilyAttemptTimeout: 100
            })
          );
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
          expect(netSpy).to.have.been.calledWith(
            sinon.match({
              autoSelectFamily: true
            })
          );
        }
      });
    });
  });

  describe('internal options', function () {
    describe('__skipPingOnConnect', () => {
      beforeEach(function () {
        if (process.env.AUTH !== 'auth') {
          this.currentTest.skipReason = 'ping count relies on auth to be enabled';
          this.skip();
        }
      });

      const tests = [
        // only skipInitialPing=true will have no events upon connect
        {
          description: 'should skip connection checkout when set to true',
          value: true,
          expectEvents: 0
        },
        {
          description: 'should not skip connection checkout when set to false',
          value: false,
          expectEvents: 1
        },
        {
          description: 'should not skip connection checkout command when unset',
          value: undefined,
          expectEvents: 1
        }
      ];
      for (const { description, value, expectEvents } of tests) {
        it(description, async function () {
          const options = value === undefined ? {} : { __skipPingOnConnect: value };
          const client = this.configuration.newClient({}, { ...options });
          const events = [];
          client.on('connectionCheckOutStarted', event => events.push(event));

          try {
            await client.connect();
          } finally {
            await client.close();
          }

          expect(events).to.have.lengthOf(expectEvents);
        });
      }
    });
  });
});
