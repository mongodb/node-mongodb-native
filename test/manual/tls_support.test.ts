import { expect } from 'chai';
import { promises as fs } from 'fs';
import * as sinon from 'sinon';

import { LEGACY_HELLO_COMMAND, MongoClient, type MongoClientOptions } from '../mongodb';

const REQUIRED_ENV = ['MONGODB_URI', 'SSL_KEY_FILE', 'SSL_CA_FILE'];

describe('TLS Support', function () {
  for (const key of REQUIRED_ENV) {
    if (process.env[key] == null) {
      throw new Error(`skipping SSL tests, ${key} environment variable is not defined`);
    }
  }

  const CONNECTION_STRING = process.env.MONGODB_URI as string;
  const TLS_CERT_KEY_FILE = process.env.SSL_KEY_FILE as string;
  const TLS_CA_FILE = process.env.SSL_CA_FILE as string;
  const tlsSettings = {
    tls: true,
    tlsCertificateKeyFile: TLS_CERT_KEY_FILE,
    tlsCAFile: TLS_CA_FILE
  };

  it(
    'should connect with tls via client options',
    makeConnectionTest(CONNECTION_STRING, tlsSettings)
  );

  it(
    'should connect with tls via url options',
    makeConnectionTest(
      `${CONNECTION_STRING}?${Object.keys(tlsSettings)
        .map(key => `${key}=${tlsSettings[key]}`)
        .join('&')}`
    )
  );

  context('when tls filepaths are provided', () => {
    let client: MongoClient;
    context('when tls filepaths have length > 0', () => {
      beforeEach(async () => {
        client = new MongoClient(CONNECTION_STRING, tlsSettings);
      });

      afterEach(async () => {
        if (client) await client.close();
      });

      it('should read in files async at connect time', async () => {
        expect(client.options).property('caFileName', TLS_CA_FILE);
        expect(client.options).property('certKeyFileName', TLS_CERT_KEY_FILE);
        expect(client.options).not.have.property('ca');
        expect(client.options).not.have.property('key');

        await client.connect();

        expect(client.options).property('ca').to.exist;
        expect(client.options).property('key').to.exist;
      });

      context('when client has been opened and closed more than once', function () {
        it('should only read files once', async () => {
          await client.connect();
          await client.close();

          const caFileAccessTime = (await fs.stat(TLS_CA_FILE)).atime;
          const certKeyFileAccessTime = (await fs.stat(TLS_CERT_KEY_FILE)).atime;

          await client.connect();

          expect((await fs.stat(TLS_CA_FILE)).atime).to.deep.equal(caFileAccessTime);
          expect((await fs.stat(TLS_CERT_KEY_FILE)).atime).to.deep.equal(certKeyFileAccessTime);
        });
      });
    });
    context('when tls filepaths have length == 0', () => {
      beforeEach(async () => {
        client = new MongoClient(CONNECTION_STRING, {
          tls: true,
          tlsCAFile: '',
          tlsCertificateKeyFile: ''
        });
      });
      afterEach(() => sinon.restore());

      it('ignores file path and fails to connect', () => {
        expect(async () => {
          await client.connect();
        }).to.throw();
      });
    });
  });
});

function makeConnectionTest(connectionString: string, clientOptions?: MongoClientOptions) {
  return async function () {
    const client = new MongoClient(connectionString, clientOptions);

    await client.connect();
    await client.db('admin').command({ [LEGACY_HELLO_COMMAND]: 1 });
    await client.db('test').collection('test').findOne({});
    return await client.close();
  };
}
