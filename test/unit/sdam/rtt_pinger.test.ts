import * as net from 'node:net';

import { expect } from 'chai';
import * as sinon from 'sinon';
import { setImmediate } from 'timers/promises';

import { isHello, Monitor, RTTPinger, ServerDescription, ServerType } from '../../mongodb';
import * as mock from '../../tools/mongodb-mock/index';
import { sleep } from '../../tools/utils';

class MockServer {
  pool: { generation: number };
  description: ServerDescription;
  topology: {
    s: { topologyId: number };
    client: { mongoLogger: { debug: () => void }; options: Record<string, never> };
  };

  constructor(options: { host: string; port: number; family?: string }) {
    this.pool = { generation: 1 };
    const isIPv6 = options.family?.toLowerCase() === 'ipv6';
    const host = isIPv6 ? `[${options.host}]` : options.host;
    this.description = new ServerDescription(`${host}:${options.port}`);
    this.description.type = ServerType.Unknown;
    this.topology = {
      s: { topologyId: 1 },
      client: {
        mongoLogger: {
          debug: () => {
            return;
          }
        },
        options: {}
      }
    };
  }
}

async function waitFor(predicate: () => boolean, timeoutMS = 2000): Promise<boolean> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMS) {
      return false;
    }
    await sleep(5);
  }
  return true;
}

describe('RTTPinger', function () {
  afterEach(() => sinon.restore());

  it('schedules another sample after connect fails and does not record that failure as an RTT', async function () {
    const server = new MockServer({ host: '127.0.0.1', port: 1, family: 'ipv4' });
    const monitor = new Monitor(server as unknown as ConstructorParameters<typeof Monitor>[0], {
      heartbeatFrequencyMS: 40,
      connectTimeoutMS: 200
    });
    const createConnection = sinon.spy(net, 'createConnection');
    const pinger = new RTTPinger(monitor);

    try {
      const sampledAgain = await waitFor(() => createConnection.callCount >= 2, 1000);
      expect(sampledAgain, 'connect failure must arm another sample').to.equal(true);
      expect(pinger.latestRtt).to.equal(undefined);
    } finally {
      pinger.close();
    }
  });

  describe('against a mock server', function () {
    let server: {
      address: () => { host: string; port: number; family: string };
      setMessageHandler: (handler: (request: any) => void) => void;
    };

    beforeEach(async function () {
      server = await mock.createServer();
    });

    afterEach(async function () {
      await mock.cleanup();
    });

    it('samples again after hello fails and keeps the last successful RTT across that failure', async function () {
      let hellos = 0;
      server.setMessageHandler(request => {
        if (!isHello(request.document)) {
          return;
        }
        hellos += 1;
        // 1 is the handshake inside connect(). 2 is the dedicated hello on that socket.
        // Dropping 2 is the command-failure path. 3 is the next connect(), which only
        // happens when the failure arms another sample.
        if (hellos === 2) {
          request.connection.destroy();
          return;
        }
        request.reply(mock.HELLO);
      });

      const monitor = new Monitor(
        new MockServer(server.address()) as unknown as ConstructorParameters<typeof Monitor>[0],
        {
          heartbeatFrequencyMS: 50
        }
      );
      const pinger = new RTTPinger(monitor);

      try {
        expect(await waitFor(() => hellos >= 1)).to.equal(true);
        expect(pinger.latestRtt).to.be.a('number');
        const rttAfterSuccess = pinger.latestRtt;

        expect(await waitFor(() => hellos >= 2)).to.equal(true);
        // The rejection handler runs after destroy(). It must not publish the failed duration.
        await setImmediate();
        await setImmediate();
        expect(pinger.latestRtt).to.equal(rttAfterSuccess);

        expect(await waitFor(() => hellos >= 3)).to.equal(true);
        expect(pinger.latestRtt).to.be.a('number');
      } finally {
        pinger.close();
      }
    });
  });
});
