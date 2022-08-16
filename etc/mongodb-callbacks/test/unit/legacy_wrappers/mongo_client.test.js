'use strict';

const sinon = require('sinon');
const { expect } = require('chai');
const { MongoClient: DriverMongoClient } = require('mongodb');
const { MongoClient: LegacyMongoClient } = require('../../../src');
const { promisify } = require('util');

const ILJ_URL = 'mongodb://iLoveJavaScript';

describe('legacy-wrappers/mongo_client.js', () => {
  let client;

  beforeEach(async () => {
    client = new LegacyMongoClient(ILJ_URL);
  });

  afterEach(async () => {
    sinon.restore();
    await client.close();
  });

  describe('MongoClient', () => {
    describe('constructor()', () => {
      it('should accept an instance of MongoClient from driver', () => {
        const clientFromDriver = new DriverMongoClient(ILJ_URL);
        // @ts-expect-error: Testing undocumented constructor support for super types
        const legacyClient = new LegacyMongoClient(clientFromDriver);
        expect(legacyClient).to.have.nested.property('s.url', ILJ_URL);
      });
    });

    describe('static connect()', () => {
      const staticConnectSpy = sinon.spy(DriverMongoClient, 'connect');

      it('should call static connect on driver MongoClient class', async () => {
        const client = await LegacyMongoClient.connect(ILJ_URL);
        expect(staticConnectSpy).to.have.been.calledOnce;
        await client.close();
      });

      it('should return a promise if no callback provided', async () => {
        const clientPromise = LegacyMongoClient.connect(ILJ_URL);
        expect(clientPromise).to.be.instanceOf(Promise);
        expect(staticConnectSpy).to.have.been.calledOnce;
        expect(await clientPromise).to.be.instanceOf(LegacyMongoClient);
        expect(await clientPromise).to.not.be.instanceOf(DriverMongoClient);
        await client.close();
      });

      it('should support callback style usage', async () => {
        const clientPromise = promisify(LegacyMongoClient.connect)(ILJ_URL);
        expect(clientPromise).to.be.instanceOf(Promise);
        expect(staticConnectSpy).to.have.been.calledOnce;
        expect(await clientPromise).to.be.instanceOf(LegacyMongoClient);
        expect(await clientPromise).to.not.be.instanceOf(DriverMongoClient);
        await client.close();
      });
    });
  });
});
