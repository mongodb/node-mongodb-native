import { expect } from 'chai';
import { once } from 'events';
import { createServer, type Server } from 'net';

import { MongoClient, SERVER_HEARTBEAT_FAILED, SERVER_HEARTBEAT_STARTED } from '../../mongodb';

describe('Heartbeat tests', function () {
  let client: MongoClient;
  // Mock server
  let server: Server;
  // Shared array
  const events: string[] = [];
  const PORT = 9999;
  const CONN_STRING = `mongodb://localhost:${PORT}`;

  beforeEach(async function () {
    // Create TCP server that responds to hellos by closing the connection
    // and pushing "client connection created" to shared array
    server = createServer(clientSocket => {
      events.push('client connected');

      clientSocket.once('data', () => {
        events.push('client hello received');
        clientSocket.destroy();
      });
    });
    server.listen(PORT);

    await once(server, 'listening');

    // set up client to connect to mock server with the following configuration
    // {
    //    serverSelectionTimeoutMS: 500,
    // }
    client = new MongoClient(CONN_STRING, {
      serverSelectionTimeoutMS: 500
    });

    // Listen to `ServerHeartbeatStartedEvent` and `ServerHeartbeatSucceededEvent`, pushing the
    // event name to the shared array when event is emitted
    for (const e of [SERVER_HEARTBEAT_STARTED, SERVER_HEARTBEAT_FAILED]) {
      client.on(e, () => {
        events.push(e);
      });
    }
  });

  afterEach(async function () {
    if (server.listening) server.close();
  });

  it('emits the first HeartbeatStartedEvent before the monitoring socket was created', async function () {
    // Attempt to connect to mock server
    const maybeError = await client.connect().catch(e => e);
    // Catch error
    expect(maybeError).to.be.instanceOf(Error);

    expect(events).to.deep.equal([
      SERVER_HEARTBEAT_STARTED,
      'client connected',
      'client hello received',
      SERVER_HEARTBEAT_FAILED
    ]);
  });
});
