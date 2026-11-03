import { expect } from 'chai';

import { type AutoEncrypter, Encrypter, MongoClient, type MongoClientOptions } from '../../mongodb';

const URI = 'mongodb://127.0.0.1:27017';

/**
 * `new Encrypter()` constructs `AutoEncrypter`, which loads mongocrypt and can
 * spawn mongocryptd. Listener forwarding happens in `getInternalClient` before
 * that, so these tests call it on an uninitialized instance.
 */
function internalClientFor(userClient: MongoClient): {
  encrypter: Encrypter;
  internalClient: MongoClient;
} {
  const encrypter = Object.create(Encrypter.prototype) as Encrypter;
  const internalClient = encrypter.getInternalClient(userClient, URI, {} as MongoClientOptions);
  return { encrypter, internalClient };
}

describe('Encrypter.getInternalClient listener forwarding', function () {
  let userClient: MongoClient;
  let internalClient: MongoClient | undefined;

  beforeEach(function () {
    userClient = new MongoClient(URI);
  });

  afterEach(async function () {
    await internalClient?.close();
    internalClient = undefined;
    await userClient.close();
  });

  it('copies a command listener that already exists and removes it with the user client', function () {
    const calls: string[] = [];
    const listener = () => {
      calls.push('ran');
    };
    userClient.on('commandStarted', listener);

    internalClient = internalClientFor(userClient).internalClient;

    internalClient.emit('commandStarted');
    expect(calls).to.deep.equal(['ran']);

    userClient.removeListener('commandStarted', listener);
    internalClient.emit('commandStarted');
    expect(calls).to.deep.equal(['ran']);
    expect(internalClient.listeners('commandStarted')).to.not.include(listener);
  });

  it('forwards a listener added later, including events outside MONGO_CLIENT_EVENTS, and removes it', function () {
    internalClient = internalClientFor(userClient).internalClient;

    const commandCalls: string[] = [];
    const commandListener = () => {
      commandCalls.push('command');
    };
    const customCalls: string[] = [];
    const customListener = () => {
      customCalls.push('custom');
    };

    userClient.on('commandStarted', commandListener);
    userClient.on('keyVaultTraffic', customListener);

    internalClient.emit('commandStarted');
    internalClient.emit('keyVaultTraffic');
    expect(commandCalls).to.deep.equal(['command']);
    expect(customCalls).to.deep.equal(['custom']);

    userClient.removeListener('commandStarted', commandListener);
    userClient.removeListener('keyVaultTraffic', customListener);
    internalClient.emit('commandStarted');
    internalClient.emit('keyVaultTraffic');
    expect(commandCalls).to.deep.equal(['command']);
    expect(customCalls).to.deep.equal(['custom']);
  });

  it('stops forwarding listeners once the encrypter is closed', async function () {
    const { encrypter, internalClient: created } = internalClientFor(userClient);
    internalClient = created;
    encrypter.autoEncrypter = {
      async close() {
        return;
      }
    } as AutoEncrypter;

    await encrypter.close(userClient);

    const calls: string[] = [];
    userClient.on('commandStarted', () => {
      calls.push('ran');
    });
    internalClient.emit('commandStarted');
    expect(calls).to.deep.equal([]);
    expect(userClient.listenerCount('newListener')).to.equal(0);
    expect(userClient.listenerCount('removeListener')).to.equal(0);
    expect(internalClient.listenerCount('removeListener')).to.equal(0);
  });
});
