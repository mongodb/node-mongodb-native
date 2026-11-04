'use strict';

const {
  ConnectionPool,
  MongoError,
  PoolClearedError,
  WaitQueueTimeoutError,
  isHello,
  ns,
  MongoClientAuthProviders,
  TimeoutContext
} = require('../../mongodb');
const mock = require('../../tools/mongodb-mock/index');
const sinon = require('sinon');
const { expect } = require('chai');
const { setImmediate } = require('timers/promises');
const { createTimerSandbox } = require('../timer_sandbox');
const { topologyWithPlaceholderClient } = require('../../tools/utils');

describe('Connection Pool', function () {
  let timeoutContext;
  let mockMongod;
  let pool;
  const stubServer = {
    topology: {
      client: {
        mongoLogger: {
          debug: () => null,
          willLog: () => null
        },
        s: {
          authProviders: new MongoClientAuthProviders()
        },
        options: {
          extendedMetadata: {}
        }
      },
      s: {
        serverSelectionTimeoutMS: 0
      }
    }
  };

  after(() => mock.cleanup());

  before(() =>
    mock.createServer().then(s => {
      mockMongod = s;
      mockMongod.s = {
        topology: topologyWithPlaceholderClient([], {})
      };
    })
  );

  beforeEach(() => {
    timeoutContext = TimeoutContext.create({ waitQueueTimeoutMS: 0, serverSelectionTimeoutMS: 0 });
  });

  afterEach(() => pool?.close());

  it('should destroy connections which have been closed', async function () {
    mockMongod.setMessageHandler(request => {
      const doc = request.document;
      if (isHello(doc)) {
        request.reply(mock.HELLO);
      } else {
        // destroy on any other command
        request.connection.destroy();
      }
    });

    pool = new ConnectionPool(stubServer, {
      maxPoolSize: 1,
      hostAddress: mockMongod.hostAddress()
    });
    pool.ready();

    const events = [];
    pool.on('connectionClosed', event => events.push(event));

    const conn = await pool.checkOut({ timeoutContext });
    const error = await conn
      .command(ns('admin.$cmd'), { ping: 1 }, { timeoutContext })
      .catch(error => error);

    expect(error).to.be.instanceOf(Error);
    pool.checkIn(conn);

    expect(events).to.have.length(1);
    const closeEvent = events[0];
    expect(closeEvent).have.property('reason').equal('error');

    conn.destroy();
  });

  it('should propagate socket timeouts to connections', async function () {
    mockMongod.setMessageHandler(request => {
      const doc = request.document;
      if (isHello(doc)) {
        request.reply(mock.HELLO);
      } else {
        // blackhole other requests
      }
    });

    pool = new ConnectionPool(stubServer, {
      maxPoolSize: 1,
      socketTimeoutMS: 200,
      hostAddress: mockMongod.hostAddress()
    });

    pool.ready();

    const conn = await pool.checkOut({ timeoutContext });
    const maybeError = await conn.command(ns('admin.$cmd'), { ping: 1 }, undefined).catch(e => e);
    expect(maybeError).to.be.instanceOf(MongoError);
    expect(maybeError).to.match(/timed out/);

    pool.checkIn(conn);
  });

  it('should clear timed out wait queue members if no connections are available', async function () {
    mockMongod.setMessageHandler(request => {
      const doc = request.document;
      if (isHello(doc)) {
        request.reply(mock.HELLO);
      }
    });

    pool = new ConnectionPool(stubServer, {
      maxPoolSize: 1,
      waitQueueTimeoutMS: 200,
      hostAddress: mockMongod.hostAddress()
    });
    const timeoutContext = TimeoutContext.create({
      waitQueueTimeoutMS: 200,
      serverSelectionTimeoutMS: 0
    });

    pool.ready();

    const conn = await pool.checkOut({ timeoutContext });
    const err = await pool.checkOut({ timeoutContext }).catch(e => e);
    expect(err).to.exist.and.be.instanceOf(WaitQueueTimeoutError);
    sinon.stub(pool, 'availableConnectionCount').get(() => 0);
    pool.checkIn(conn);

    await setImmediate();

    expect(pool).property('waitQueueSize').to.equal(0);
  });

  it('does not check out a connection created before clear once the pool is ready again', async function () {
    let releaseFirstHello;
    const firstHello = new Promise(resolve => {
      releaseFirstHello = resolve;
    });
    let helloCount = 0;
    mockMongod.setMessageHandler(request => {
      if (!isHello(request.document)) {
        return;
      }
      helloCount += 1;
      if (helloCount === 1) {
        // Hold the handshake that createConnection already stamped with generation 0.
        firstHello.then(() => request.reply(mock.HELLO));
        return;
      }
      request.reply(mock.HELLO);
    });

    pool = new ConnectionPool(stubServer, {
      maxPoolSize: 1,
      hostAddress: mockMongod.hostAddress()
    });
    pool.ready();

    const checkout = pool.checkOut({ timeoutContext });
    const started = Date.now();
    while (helloCount < 1 && Date.now() - started < 2000) {
      await setImmediate();
    }
    expect(helloCount).to.equal(1);

    pool.clear();
    pool.ready();
    expect(pool.generation).to.equal(1);

    releaseFirstHello();
    const connection = await checkout;
    expect(connection.generation).to.equal(pool.generation);
    pool.checkIn(connection);
  });

  it('rejects a queued checkout when clear runs while a connection is being created', async function () {
    let releaseHello;
    const hello = new Promise(resolve => {
      releaseHello = resolve;
    });
    mockMongod.setMessageHandler(request => {
      if (isHello(request.document)) {
        hello.then(() => request.reply(mock.HELLO));
      }
    });

    // PoolClearedError reads server.description. The shared stub has no description.
    const server = {
      ...stubServer,
      description: {}
    };
    pool = new ConnectionPool(server, {
      maxPoolSize: 2,
      maxConnecting: 1,
      hostAddress: mockMongod.hostAddress()
    });
    let cleared = false;
    pool.on('connectionCreated', () => {
      if (!cleared) {
        cleared = true;
        pool.clear();
      }
    });
    pool.ready();

    const first = pool.checkOut({ timeoutContext });
    const second = pool.checkOut({ timeoutContext });
    const secondError = await second.catch(error => error);
    expect(secondError).to.be.instanceOf(PoolClearedError);

    releaseHello();
    const firstError = await first.catch(error => error);
    expect(firstError).to.be.instanceOf(PoolClearedError);
  });

  describe('minPoolSize population', function () {
    let clock, timerSandbox;

    beforeEach(() => {
      timerSandbox = createTimerSandbox();
      clock = sinon.useFakeTimers();
    });

    afterEach(() => {
      if (clock) {
        timerSandbox.restore();
        clock.restore();
        clock = undefined;
      }
    });

    it('should respect the minPoolSizeCheckFrequencyMS option', function () {
      pool = new ConnectionPool(stubServer, {
        minPoolSize: 2,
        minPoolSizeCheckFrequencyMS: 42,
        hostAddress: mockMongod.hostAddress()
      });
      const ensureSpy = sinon.spy(pool, 'ensureMinPoolSize');

      // return a fake connection that won't get identified as perished
      const createConnStub = sinon
        .stub(pool, 'createConnection')
        .yields(null, { destroy: () => null, generation: 0 });

      pool.ready();

      // expect ensureMinPoolSize to execute immediately
      expect(ensureSpy).to.have.been.calledOnce;
      expect(createConnStub).to.have.been.calledOnce;

      // check that the successful connection return schedules another run
      clock.tick(42);
      expect(ensureSpy).to.have.been.calledTwice;
      expect(createConnStub).to.have.been.calledTwice;

      // check that the 2nd successful connection return schedules another run
      // but don't expect to get a new connection since we are at minPoolSize
      clock.tick(42);
      expect(ensureSpy).to.have.been.calledThrice;
      expect(createConnStub).to.have.been.calledTwice;

      // check that the next scheduled check runs even after we're at minPoolSize
      clock.tick(42);
      expect(ensureSpy).to.have.callCount(4);
      expect(createConnStub).to.have.been.calledTwice;
    });

    it('should default minPoolSizeCheckFrequencyMS to 100ms', function () {
      pool = new ConnectionPool(stubServer, {
        minPoolSize: 2,
        hostAddress: mockMongod.hostAddress()
      });
      const ensureSpy = sinon.spy(pool, 'ensureMinPoolSize');

      // return a fake connection that won't get identified as perished
      const createConnStub = sinon
        .stub(pool, 'createConnection')
        .yields(null, { destroy: () => null, generation: 0 });

      pool.ready();

      // expect ensureMinPoolSize to execute immediately
      expect(ensureSpy).to.have.been.calledOnce;
      expect(createConnStub).to.have.been.calledOnce;

      // check that the successful connection return schedules another run
      clock.tick(100);
      expect(ensureSpy).to.have.been.calledTwice;
      expect(createConnStub).to.have.been.calledTwice;

      // check that the 2nd successful connection return schedules another run
      // but don't expect to get a new connection since we are at minPoolSize
      clock.tick(100);
      expect(ensureSpy).to.have.been.calledThrice;
      expect(createConnStub).to.have.been.calledTwice;

      // check that the next scheduled check runs even after we're at minPoolSize
      clock.tick(100);
      expect(ensureSpy).to.have.callCount(4);
      expect(createConnStub).to.have.been.calledTwice;
    });
  });
});
