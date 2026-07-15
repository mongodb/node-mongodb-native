import { expect } from 'chai';
import * as process from 'process';

import {
  MongoClient,
  type MongoClient as MongoClientType,
  type MongoClientOptions,
  ObjectId
} from '../mongodb';

/**
 * Atlas Secure Frontend Processor (SFP) testing.
 *
 * See specifications/source/atlas-sfp-testing/atlas-sfp-testing.md.
 *
 * The SFP is a transparent proxy that sits in front of preconfigured Atlas clusters.  These tests
 * verify connectivity and authentication (unauthenticated, SCRAM-SHA-256, X.509) through the proxy.
 * Connection URIs and credentials are provided via environment variables.
 */

function required(name: string): string {
  const value = process.env[name];
  if (value == null || value === '') {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

describe('Atlas Secure Frontend Processor (SFP)', function () {
  // A unique collection name per test run, dropped in the after hook (spec: Test Isolation).
  const collectionName = `sfp_test_${new ObjectId().toString()}`;
  let client: MongoClient;

  this.timeout(60000);

  afterEach(async function () {
    await client?.close();
  });

  async function assertPing(client: MongoClientType) {
    const result = await client.db('admin').command({ ping: 1 });
    expect(result).to.have.property('ok', 1);
  }

  async function assertConnectionStatus(
    client: MongoClientType,
    { authenticated }: { authenticated: boolean }
  ) {
    const result = await client.db('admin').command({ connectionStatus: 1 });
    expect(result).to.have.property('ok', 1);
    const authenticatedUsers = result.authInfo?.authenticatedUsers ?? [];
    if (authenticated) {
      expect(authenticatedUsers).to.have.length.of.at.least(1);
    } else {
      expect(authenticatedUsers).to.have.lengthOf(0);
    }
  }

  async function assertCRUD(client: MongoClientType) {
    const collection = client.db('db').collection(collectionName);
    const _id = new ObjectId();
    const { insertedId } = await collection.insertOne({ _id });
    expect(insertedId).to.deep.equal(_id);

    const found = await collection.findOne({ _id });
    expect(found).to.deep.equal({ _id });
  }

  context('when unauthenticated', function () {
    it('pings and reports no authenticated users', async function () {
      client = new MongoClient(required('SFP_ATLAS_URI'));
      await client.connect();

      await assertPing(client);
      await assertConnectionStatus(client, { authenticated: false });
    });
  });

  // Each authenticated test runs under three variations: baseline, with a compressor, and with
  // Server API version 1.
  const variations: Array<{ name: string; options: MongoClientOptions }> = [
    { name: 'baseline', options: {} },
    // zlib is built into Node, so it needs no optional native addon (unlike zstd/snappy).
    { name: 'with zlib compression', options: { compressors: ['zlib'] } },
    { name: 'with Server API v1', options: { serverApi: { version: '1' } } }
  ];

  context('when authenticating with SCRAM-SHA-256', function () {
    for (const { name, options } of variations) {
      it(`succeeds ${name}`, async function () {
        const uri = required('SFP_ATLAS_URI');
        client = new MongoClient(uri, {
          auth: { username: required('SFP_ATLAS_USER'), password: required('SFP_ATLAS_PASSWORD') },
          authMechanism: 'SCRAM-SHA-256',
          ...options
        });
        await client.connect();

        await assertPing(client);
        await assertConnectionStatus(client, { authenticated: true });
        await assertCRUD(client);
      });
    }
  });

  context('when authenticating with X.509', function () {
    for (const { name, options } of variations) {
      it(`succeeds ${name}`, async function () {
        client = new MongoClient(required('SFP_ATLAS_X509_URI'), {
          tlsCertificateKeyFile: required('SFP_ATLAS_X509_CERT'),
          authMechanism: 'MONGODB-X509',
          ...options
        });
        await client.connect();

        await assertPing(client);
        await assertConnectionStatus(client, { authenticated: true });
        await assertCRUD(client);
      });
    }
  });

  after(async function () {
    const cleanup = new MongoClient(required('SFP_ATLAS_URI'), {
      auth: { username: required('SFP_ATLAS_USER'), password: required('SFP_ATLAS_PASSWORD') },
      authMechanism: 'SCRAM-SHA-256'
    });
    try {
      await cleanup.db('db').collection(collectionName).drop();
    } finally {
      await cleanup.close();
    }
  });
});
