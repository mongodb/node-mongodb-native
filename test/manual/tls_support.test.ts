import * as process from 'node:process';

import { expect } from 'chai';
import { promises as fs } from 'fs';

import {
  LEGACY_HELLO_COMMAND,
  MongoClient,
  type MongoClientOptions,
  MongoServerSelectionError
} from '../mongodb';

const REQUIRED_ENV = ['MONGODB_URI', 'TLS_KEY_FILE', 'TLS_CA_FILE', 'TLS_CRL_FILE'];
describe('TLS Support', function () {
  for (const key of REQUIRED_ENV) {
    if (process.env[key] == null) {
      throw new Error(`skipping TLS tests, ${key} environment variable is not defined`);
    }
  }
  const CONNECTION_STRING = process.env.MONGODB_URI as string;
  const TLS_CERT_KEY_FILE = process.env.TLS_KEY_FILE as string;
  const TLS_CA_FILE = process.env.TLS_CA_FILE as string;
  const TLS_CRL_FILE = process.env.TLS_CRL_FILE as string;
  const tlsSettings = {
    tls: true,
    tlsCertificateKeyFile: TLS_CERT_KEY_FILE,
    tlsCAFile: TLS_CA_FILE
  };

  it(
    'should connect with tls via client options',
    makeConnectionTest(CONNECTION_STRING, tlsSettings)
  );

  beforeEach(function () {
    if (
      this.currentTest?.title === 'should connect with tls via url options' &&
      process.platform === 'win32'
    ) {
      this.currentTest.skipReason = 'TODO(NODE-5803): Un-skip Windows TLS tests via URL';
      return this.skip();
    }
  });

  it(
    'should connect with tls via url options',
    makeConnectionTest(
      `${CONNECTION_STRING}?${Object.keys(tlsSettings)
        .map(key => `${key}=${tlsSettings[key]}`)
        .join('&')}`
    )
  );

  describe('when tls filepaths are provided', () => {
    let client: MongoClient;

    afterEach(async () => {
      await client?.close();
    });

    describe('when tls filepaths have length > 0', () => {
      describe('when connection will succeed', () => {
        beforeEach(async () => {
          client = new MongoClient(CONNECTION_STRING, tlsSettings);
        });

        it('should read in files async at connect time', async () => {
          expect(client.options).property('tlsCAFile', TLS_CA_FILE);
          expect(client.options).property('tlsCertificateKeyFile', TLS_CERT_KEY_FILE);
          expect(client.options).not.have.property('ca');
          expect(client.options).not.have.property('key');
          expect(client.options).not.have.property('cert');
          await client.connect();
          expect(client.options).property('ca').to.exist;
          expect(client.options).property('key').to.exist;
          expect(client.options).property('cert').to.exist;
        });

        describe('when client has been opened and closed more than once', function () {
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

      describe('when the connection will fail', () => {
        beforeEach(async () => {
          client = new MongoClient(CONNECTION_STRING, {
            tls: true,
            tlsCRLFile: TLS_CRL_FILE,
            serverSelectionTimeoutMS: 2000,
            connectTimeoutMS: 2000
          });
        });

        it('should read in files async at connect time', async () => {
          expect(client.options).property('tlsCRLFile', TLS_CRL_FILE);
          expect(client.options).not.have.property('crl');
          const err = await client.connect().catch(e => e);
          expect(err).to.be.instanceof(Error);
          expect(client.options).property('crl').to.exist;
        });

        describe('when client has been opened and closed more than once', function () {
          it('should only read files once', async () => {
            await client.connect().catch(e => e);
            await client.close();
            const crlFileAccessTime = (await fs.stat(TLS_CRL_FILE)).atime;
            const err = await client.connect().catch(e => e);
            expect(err).to.be.instanceof(Error);
            expect((await fs.stat(TLS_CRL_FILE)).atime).to.deep.equal(crlFileAccessTime);
          });
        });
      });
    });

    describe('when tlsCAFile has length === 0', () => {
      beforeEach(() => {
        client = new MongoClient(CONNECTION_STRING, {
          tls: true,
          tlsCAFile: '',
          tlsCertificateKeyFile: TLS_CERT_KEY_FILE
        });
      });

      it('should throw an error at connect time', async () => {
        const err = await client.connect().catch(e => e);
        expect(err).to.be.instanceof(Error);
      });
    });

    describe('when tlsCertificateKeyFile has length === 0', () => {
      beforeEach(() => {
        client = new MongoClient(CONNECTION_STRING, {
          tls: true,
          tlsCAFile: TLS_CA_FILE,
          tlsCertificateKeyFile: ''
        });
      });

      it('should throw an error at connect time', async () => {
        const err = await client.connect().catch(e => e);
        expect(err).to.be.instanceof(Error);
      });
    });
  });

  describe('when providing tlsCRLFile', () => {
    describe('when the file will revoke the certificate', () => {
      let client: MongoClient;

      beforeEach(() => {
        client = new MongoClient(CONNECTION_STRING, {
          tls: true,
          tlsCAFile: TLS_CA_FILE,
          tlsCRLFile: TLS_CRL_FILE,
          serverSelectionTimeoutMS: 5000,
          connectTimeoutMS: 5000
        });
      });

      afterEach(async () => {
        await client?.close();
      });

      it('throws a MongoServerSelectionError', async () => {
        const err = await client.connect().catch(e => e);
        expect(err).to.be.instanceOf(MongoServerSelectionError);
      });
    });
  });

  describe('when tlsCertificateKeyFile is provided, but tlsCAFile is missing', () => {
    let client: MongoClient;

    beforeEach(() => {
      client = new MongoClient(CONNECTION_STRING, {
        tls: true,
        tlsCertificateKeyFile: TLS_CERT_KEY_FILE,
        serverSelectionTimeoutMS: 5000,
        connectTimeoutMS: 5000
      });
    });

    afterEach(async () => {
      if (client) await client.close();
    });

    it('throws a MongoServerSelectionError', async () => {
      const err = await client.connect().catch(e => e);
      expect(err).to.be.instanceOf(MongoServerSelectionError);
    });
  });

  describe('when tlsCAFile is provided, but tlsCertificateKeyFile is missing', () => {
    let client: MongoClient;

    beforeEach(() => {
      client = new MongoClient(CONNECTION_STRING, {
        tls: true,
        tlsCAFile: TLS_CA_FILE
      });
    });

    afterEach(async () => {
      if (client) await client.close();
    });

    it('connects without error', async () => {
      const clientOrError = await client.connect().catch(e => e);
      expect(clientOrError).to.be.instanceOf(MongoClient);
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
