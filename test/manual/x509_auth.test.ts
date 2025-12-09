import * as process from 'node:process';

import { expect } from 'chai';
import { ConnectionString } from 'mongodb-connection-string-url';

import {
  MongoClient,
  type MongoClientOptions,
  MongoServerError,
  MongoServerSelectionError
} from '../../src';

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
const connectionString = new ConnectionString(process.env.MONGODB_URI!);

describe('x509 Authentication', function () {
  let client: MongoClient;
  const validOptions: MongoClientOptions = {
    tlsCertificateKeyFile: process.env.SSL_KEY_FILE
  };

  this.afterEach(() => {
    return client?.close();
  });

  context('When the user provides a valid certificate', function () {
    it('successfully authenticates using x509', async function () {
      client = new MongoClient(connectionString.toString(), validOptions);
      const result = await client
        .db('aws')
        .collection('x509_test')
        .estimatedDocumentCount()
        .catch(error => error);

      expect(result).to.not.be.instanceOf(MongoServerError);
      expect(result).to.be.a('number');
    });

    context('when an incorrect username is supplied', function () {
      it('fails to authenticate', async function () {
        const uri = connectionString.clone();
        uri.username = 'bob';
        client = new MongoClient(uri.toString(), validOptions);
        const error = await client.connect().catch(error => error);

        expect(error).to.be.instanceOf(MongoServerError);
        expect(error.codeName).to.match(/AuthenticationFailed/i);
      });
    });
  });

  context('when the client connects with an invalid certificate', function () {
    // unlike other authentication mechanisms, x509 authentication 1) requires TLS and
    // 2) the server uses the client certificate to derive a username to authenticate with
    // against the $external database.  This means that if a user attempts to connect to a
    // cluster with an invalid certificate and tls is enabled, then the driver fails to connect and
    // a server selection error is thrown.
    it('throws a server selection error', async function () {
      const invalidOptions: MongoClientOptions = {
        // use an expired key file
        tlsCertificateKeyFile: process.env.SSL_KEY_FILE_EXPIRED,
        serverSelectionTimeoutMS: 2000
      };
      client = new MongoClient(connectionString.toString(), {
        ...invalidOptions,
        serverSelectionTimeoutMS: 5000
      });
      const error = await client.connect().catch(e => e);

      expect(error).to.be.instanceOf(MongoServerSelectionError);
    });
  });

  context(
    'when a valid cert is provided but the certificate does not correspond to a user',
    function () {
      it('fails to authenticate', async function () {
        client = new MongoClient(connectionString.toString(), {
          tlsCertificateKeyFile: process.env.SSL_KEY_FILE_NO_USER,
          serverSelectionTimeoutMS: 2000
        });
        const error = await client.connect().catch(error => error);

        expect(error).to.be.instanceOf(MongoServerError);
        expect(error.codeName).to.match(/UserNotFound/i);
      });
    }
  );
});
