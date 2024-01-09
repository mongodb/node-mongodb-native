import { expect } from 'chai';
import { createServer, type Server } from 'net';

import { MongoClient, SERVER_HEARTBEAT_FAILED, SERVER_HEARTBEAT_STARTED } from '../../mongodb';

describe('Heartbeat tests', function () {
  let client: MongoClient;
  // Mock server
  let server: Server;
  // Shared array
  const events: string[] = [];

  beforeEach(async function () {
    // Create TCP server that responds to hellos by closing the connection
    // and pushing "client connection created" to shared array
    server = createServer(clientSocket => {
      events.push('client connected');

      clientSocket.once('data', () => {
        events.push('client hello received');
        clientSocket.end();
      });
    });
    server.listen(9999);

    // set up client to connect to mock server with the following configuration
    // {
    //    serverSelectionTimeoutMS: 500,
    //    maxPoolSize: 1,
    //    minPoolSize: 0
    // }
    client = new MongoClient('mongodb://localhost:9999', {
      serverSelectionTimeoutMS: 500,
      maxPoolSize: 1,
      minPoolSize: 0
    });

    // Listen to `ServerHeartbeatStartedEvent` and `ServerHeartbeatSucceededEvent`, pushing the
    // event name to the shared array when event is emitted
    for (const e of [SERVER_HEARTBEAT_STARTED, SERVER_HEARTBEAT_FAILED]) {
      client.on(e, () => {
        events.push(e);
      });
    }

    // Attempt to connect to mock server
    const maybeError = await client.connect().catch(e => e);
    // Catch error
    expect(maybeError).to.be.instanceOf(Error);
  });

  afterEach(async function () {
    if (server.listening) server.close();
  });

  it('emits the first HeartbeatStartedEvent after the monitoring socket was created and before hello is sent', async function () {
    expect(events).to.have.lengthOf(4);
    expect(events[0]).to.equal('client connection created');
    expect(events[1]).to.equal(SERVER_HEARTBEAT_STARTED);
    expect(events[2]).to.equal('client hello received');
    expect(events[3]).to.equal(SERVER_HEARTBEAT_FAILED);
  });
});
