import { expect } from 'chai';
import ConnectionString from 'mongodb-connection-string-url';

import { LEGACY_HELLO_COMMAND, MongoClient, MongoParseError } from '../mongodb';

/**
 * The SOCKS5_CONFIG environment variable is either a JSON 4-tuple
 * [host, port, username, password] or just [host, port].
 */

describe('Socks5 Connectivity', function () {
  if (!process.env.SOCKS5_CONFIG == null) {
    console.error('skipping Socks5 tests, SOCKS5_CONFIG environment variable is not defined');

    return;
  }

  this.timeout(10000);

  const [proxyHost, proxyPort, proxyUsername, proxyPassword] = JSON.parse(
    process.env.SOCKS5_CONFIG
  );
  const rsConnectionString = new ConnectionString(process.env.MONGODB_URI);
  const singleConnectionString = new ConnectionString(process.env.MONGODB_URI_SINGLEHOST);

  if (process.env.SSL === 'ssl') {
    rsConnectionString.searchParams.set('tls', 'true');
    rsConnectionString.searchParams.set('tlsCAFile', process.env.SSL_CA_FILE);
    singleConnectionString.searchParams.set('tls', 'true');
    singleConnectionString.searchParams.set('tlsCAFile', process.env.SSL_CA_FILE);
  }
  rsConnectionString.searchParams.set('serverSelectionTimeoutMS', '2000');
  singleConnectionString.searchParams.set('serverSelectionTimeoutMS', '2000');
  singleConnectionString.searchParams.set('readPreference', 'primaryPreferred');

  context((proxyUsername ? 'with' : 'without') + ' Socks5 auth required', function () {
    context('with missing required Socks5 auth configuration', function () {
      if (!proxyUsername) {
        beforeEach(function () {
          this.skip();
        });
      }

      it('fails to connect to a single host (connection string)', async function () {
        const cs = singleConnectionString.clone();
        cs.searchParams.set('proxyHost', proxyHost);
        cs.searchParams.set('proxyPort', String(proxyPort));
        cs.searchParams.set('directConnection', 'true');
        try {
          await testConnection(cs.toString(), {});
        } catch (err) {
          expect(err.name).to.equal('MongoServerSelectionError');
          expect(err.message).to.match(/Received invalid Socks5 initial handshake/);
          return;
        }
        expect.fail('missed exception');
      });

      it('fails to connect to a single host (config options)', async function () {
        try {
          await testConnection(singleConnectionString.toString(), {
            proxyHost,
            proxyPort,
            directConnection: true
          });
        } catch (err) {
          expect(err.name).to.equal('MongoServerSelectionError');
          expect(err.message).to.match(/Received invalid Socks5 initial handshake/);
          return;
        }
        expect.fail('missed exception');
      });

      it('fails to connect to a replica set (connection string)', async function () {
        const cs = rsConnectionString.clone();
        cs.searchParams.set('proxyHost', proxyHost);
        cs.searchParams.set('proxyPort', String(proxyPort));
        try {
          await testConnection(cs.toString(), {});
        } catch (err) {
          expect(err.name).to.equal('MongoServerSelectionError');
          expect(err.message).to.match(/Received invalid Socks5 initial handshake/);
          return;
        }
        expect.fail('missed exception');
      });

      it('fails to connect to a replica set (config options)', async function () {
        try {
          await testConnection(rsConnectionString.toString(), {
            proxyHost,
            proxyPort
          });
        } catch (err) {
          expect(err.name).to.equal('MongoServerSelectionError');
          expect(err.message).to.match(/Received invalid Socks5 initial handshake/);
          return;
        }
        expect.fail('missed exception');
      });

      it('fails to connect to a single host (connection string) if auth is present but wrong', async function () {
        const cs = singleConnectionString.clone();
        cs.searchParams.set('proxyHost', proxyHost);
        cs.searchParams.set('proxyPort', String(proxyPort));
        cs.searchParams.set('proxyUsername', 'nonexistentuser');
        cs.searchParams.set('proxyPassword', 'badauth');
        cs.searchParams.set('directConnection', 'true');
        try {
          await testConnection(cs.toString(), {});
        } catch (err) {
          expect(err.name).to.equal('MongoServerSelectionError');
          expect(err.message).to.match(/Socket closed/);
          return;
        }
        expect.fail('missed exception');
      });
    });

    context('with extraneous Socks5 auth configuration', function () {
      if (proxyUsername) {
        beforeEach(function () {
          this.skip();
        });
      }

      it('can connect to a single host (connection string)', async function () {
        const cs = singleConnectionString.clone();
        cs.searchParams.set('proxyHost', proxyHost);
        cs.searchParams.set('proxyPort', String(proxyPort));
        cs.searchParams.set('proxyUsername', 'nonexistentuser');
        cs.searchParams.set('proxyPassword', 'badauth');
        cs.searchParams.set('directConnection', 'true');
        await testConnection(cs.toString(), {});
      });

      it('can connect to a single host (config options)', async function () {
        await testConnection(singleConnectionString.toString(), {
          proxyHost,
          proxyPort,
          ...(proxyUsername
            ? {}
            : {
                proxyUsername: 'nonexistentuser',
                proxyPassword: 'badauth'
              }),
          directConnection: true
        });
      });

      it('can connect to a replica set (connection string)', async function () {
        const cs = rsConnectionString.clone();
        cs.searchParams.set('proxyHost', proxyHost);
        cs.searchParams.set('proxyPort', String(proxyPort));
        cs.searchParams.set('proxyUsername', 'nonexistentuser');
        cs.searchParams.set('proxyPassword', 'badauth');
        await testConnection(cs.toString(), {});
      });

      it('can connect to a replica set (config options)', async function () {
        await testConnection(rsConnectionString.toString(), {
          proxyHost,
          proxyPort,
          ...(proxyUsername
            ? {}
            : {
                proxyUsername: 'nonexistentuser',
                proxyPassword: 'badauth'
              })
        });
      });
    });

    context('with matching socks5 authentication', () => {
      it('can connect to a single host (connection string, with directConnection)', async function () {
        const cs = singleConnectionString.clone();
        cs.searchParams.set('proxyHost', proxyHost);
        cs.searchParams.set('proxyPort', String(proxyPort));
        if (proxyUsername) {
          cs.searchParams.set('proxyUsername', proxyUsername);
          cs.searchParams.set('proxyPassword', proxyPassword);
        }
        cs.searchParams.set('directConnection', 'true');
        expect(await testConnection(cs.toString(), {})).to.equal('Single');
      });

      it('can connect to a single host (config options, with directConnection)', async function () {
        expect(
          await testConnection(singleConnectionString.toString(), {
            proxyHost,
            proxyPort,
            ...(proxyUsername
              ? {
                  proxyUsername,
                  proxyPassword
                }
              : {}),
            directConnection: true
          })
        ).to.equal('Single');
      });

      it('can connect to a single host (connection string, without directConnection)', async function () {
        const cs = singleConnectionString.clone();
        cs.searchParams.set('proxyHost', proxyHost);
        cs.searchParams.set('proxyPort', String(proxyPort));
        if (proxyUsername) {
          cs.searchParams.set('proxyUsername', proxyUsername);
          cs.searchParams.set('proxyPassword', proxyPassword);
        }
        cs.searchParams.set('directConnection', 'false');
        expect(await testConnection(cs.toString(), {})).to.equal('ReplicaSetWithPrimary');
      });

      it('can connect to a single host (config options, without directConnection)', async function () {
        expect(
          await testConnection(singleConnectionString.toString(), {
            proxyHost,
            proxyPort,
            ...(proxyUsername
              ? {
                  proxyUsername,
                  proxyPassword
                }
              : {}),
            directConnection: false
          })
        ).to.equal('ReplicaSetWithPrimary');
      });

      it('can connect to a replica set (connection string)', async function () {
        const cs = rsConnectionString.clone();
        cs.searchParams.set('proxyHost', proxyHost);
        cs.searchParams.set('proxyPort', String(proxyPort));
        if (proxyUsername) {
          cs.searchParams.set('proxyUsername', proxyUsername);
          cs.searchParams.set('proxyPassword', proxyPassword);
        }
        expect(await testConnection(cs.toString(), {})).to.equal('ReplicaSetWithPrimary');
      });

      it('can connect to a replica set (config options)', async function () {
        expect(
          await testConnection(rsConnectionString.toString(), {
            proxyHost,
            proxyPort,
            ...(proxyUsername
              ? {
                  proxyUsername,
                  proxyPassword
                }
              : {})
          })
        ).to.equal('ReplicaSetWithPrimary');
      });

      it('does not mention the proxy in command monitoring events', async function () {
        const client = new MongoClient(singleConnectionString.toString(), {
          proxyHost,
          proxyPort,
          ...(proxyUsername
            ? {
                proxyUsername,
                proxyPassword
              }
            : {}),
          directConnection: true,
          monitorCommands: true
        });
        const seenCommandAddresses = new Set();
        client.on('commandSucceeded', ev => seenCommandAddresses.add(ev.address));

        await client.connect();
        await client.db('admin').command({ [LEGACY_HELLO_COMMAND]: 1 });
        await client.close();
        expect([...seenCommandAddresses]).to.deep.equal(singleConnectionString.hosts);
      });
    });
  });

  context('MongoClient option validation', () => {
    for (const proxyOptions of [
      { proxyPort: 1080 },
      { proxyUsername: 'abc' },
      { proxyPassword: 'def' },
      { proxyPort: 1080, proxyUsername: 'abc', proxyPassword: 'def' },
      { proxyHost: 'localhost', proxyUsername: 'abc' },
      { proxyHost: 'localhost', proxyPassword: 'def' }
    ]) {
      it(`rejects invalid MongoClient options ${JSON.stringify(proxyOptions)}`, () => {
        expect(() => new MongoClient('mongodb://localhost', proxyOptions)).to.throw(
          MongoParseError
        );
      });
    }
  });
});

async function testConnection(connectionString, clientOptions) {
  const client = new MongoClient(connectionString, clientOptions);
  let topologyType;
  client.on('topologyDescriptionChanged', ev => (topologyType = ev.newDescription.type));

  try {
    await client.connect();
    await client.db('admin').command({ hello: 1 });
    await client.db('test').collection('test').findOne({});
  } finally {
    await client.close();
  }
  return topologyType;
}
