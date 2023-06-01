import { expect } from 'chai';
import Sinon, * as sinon from 'sinon';

import {
  Connection,
  LEGACY_HELLO_COMMAND,
  MongoClient,
  MongoServerError,
  MongoServerSelectionError,
  Monitor
} from '../../mongodb';

describe('MongoDB Handshake', () => {
  let client;

  afterEach(() => client.close());

  context('when hello is too large', () => {
    before(() => {
      sinon.stub(Connection.prototype, 'command').callsFake(function (ns, cmd, options, callback) {
        // @ts-expect-error: sinon will place wrappedMethod there
        const command = Connection.prototype.command.wrappedMethod.bind(this);

        if (cmd.hello || cmd[LEGACY_HELLO_COMMAND]) {
          return command(
            ns,
            { ...cmd, client: { driver: { name: 'a'.repeat(1000) } } },
            options,
            callback
          );
        }
        return command(ns, cmd, options, callback);
      });
    });

    after(() => sinon.restore());

    it('should fail with an error relating to size', async function () {
      client = this.configuration.newClient({ serverSelectionTimeoutMS: 2000 });
      const error = await client.connect().catch(error => error);
      if (this.configuration.isLoadBalanced) {
        expect(error).to.be.instanceOf(MongoServerError);
      } else {
        expect(error).to.be.instanceOf(MongoServerSelectionError);
      }
      expect(error).to.match(/client metadata document must be less/);
    });
  });

  context('when compressors are provided on the mongo client', () => {
    let spy: Sinon.SinonSpy;
    before(() => {
      spy = sinon.spy(Connection.prototype, 'command');
    });

    after(() => sinon.restore());

    it('constructs a handshake with the specified compressors', async function () {
      client = this.configuration.newClient({ compressors: ['snappy'] });
      await client.connect();
      expect(spy.called).to.be.true;
      const handshakeDoc = spy.getCall(0).args[1];
      expect(handshakeDoc).to.have.property('compression').to.deep.equal(['snappy']);
    });
  });
});
context('when running against a server version >= 4.4', function () {
  const HEARTBEAT_FREQUENCY_MS = 1000;
  const MIN_HEARTBEAT_FREQUENCY_MS = 500;
  const metadata = { requires: { mongodb: '>= 4.4', topology: '!load-balanced' } };
  let cachedEnv: NodeJS.ProcessEnv;
  let client: MongoClient;

  beforeEach(async function () {
    cachedEnv = process.env;
    client = this.configuration.newClient(
      {},
      {
        heartbeatFrequencyMS: HEARTBEAT_FREQUENCY_MS,
        minHeartbeatFrequencyMS: MIN_HEARTBEAT_FREQUENCY_MS
      }
    );
  });

  afterEach(async function () {
    await client.close().catch(() => null);
    process.env = cachedEnv;
  });

  context('in a FaaS environment', function () {
    beforeEach(function () {
      process.env.AWS_EXECUTION_ENV = 'AWS_Lambda_test';
      process.env.AWS_REGION = 'test_region';
    });

    it('uses the polling protocol', metadata, async function () {
      await client.connect();
      const servers = client?.topology.s?.servers;
      expect(servers).to.exist;
      for (const server of servers.values()) {
        const symbolMap = {};
        Object.getOwnPropertySymbols(server).forEach(s => {
          symbolMap[s.toString()] = s;
        });

        expect(server[symbolMap['Symbol(monitor)']]).to.exist;
        const monitor: Monitor = server[symbolMap['Symbol(monitor)']];
        expect(monitor.heartbeatProtocol).to.equal('polling');
      }
    });
  });

  context('in a non-FaaS environment', function () {
    beforeEach(function () {
      delete process.env.AWS_EXECUTION_ENV;
      delete process.env.AWS_REGION;
      delete process.env.AWS_LAMBDA_RUNTIME_API;
      delete process.env.FUNCTIONS_WORKER_RUNTIME;
      delete process.env.K_SERVICE;
      delete process.env.FUNCTION_NAME;
      delete process.env.VERCEL;
      delete process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE;
      delete process.env.FUNCTION_MEMORY_MB;
      delete process.env.FUNCTION_REGION;
      delete process.env.FUNCTION_TIMEOUT_SEC;
      delete process.env.VERCEL_REGION;
    });

    it('uses the streaming protocol', metadata, async function () {
      await client.connect();
      const servers = client?.topology.s?.servers;
      expect(servers).to.exist;
      for (const server of servers.values()) {
        const symbolMap = {};
        Object.getOwnPropertySymbols(server).forEach(s => {
          symbolMap[s.toString()] = s;
        });

        expect(server[symbolMap['Symbol(monitor)']]).to.exist;
        const monitor: Monitor = server[symbolMap['Symbol(monitor)']];
        expect(monitor.heartbeatProtocol).to.equal('streaming');
      }
    });
  });
});
