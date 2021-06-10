'use strict';

const { expect } = require('chai');
const { BSONRegExp } = require('../../src/index');
const mock = require('../tools/mock');

describe('BSONRegExp', () => {
  let server;
  afterEach(() => mock.cleanup());
  beforeEach(async () => {
    server = await mock.createServer();
    server.setMessageHandler(request => {
      const doc = request.document;
      if (doc.ismaster || doc.hello) {
        request.reply({ ...mock.DEFAULT_ISMASTER });
      } else if (doc.insert) {
        // insertOne handle
        request.reply({ ok: 1 });
      } else if (doc.find) {
        // findOne handle
        request.reply({
          ok: 1,
          cursor: { id: 1, firstBatch: [{ regex: new BSONRegExp('abc', 'imx') }] }
        });
      } else if (doc.endSessions) {
        request.reply({ ok: 1 });
      }
    });
  });

  describe('option passed to client', () => {});
  describe('option passed to db', () => {});
  describe('option passed to collection', () => {});

  // Start here
  describe('bsonRegex option passed to operation', () => {
    // it('should respond with BSONRexExp class', async function () {
    //   // create and connect to client
    //   const client = this.configuration.newClient(`mongodb://${server.uri()}/`); // bsonRegex
    //   await client.connect();

    //   const db = client.db('a');
    //   const collection = db.collection('b');

    //   await collection.insertOne({ regex: new BSONRegExp('abc', 'imx') });
    //   const res = await collection.findOne(
    //     { regex: new BSONRegExp('abc', 'imx') },
    //     { bsonRegExp: true }
    //   );

    //   expect(res).has.property('regex').that.is.instanceOf(BSONRegExp);
    // });

    it('should respond with BSONRexExp class REAL MONGO', async function () {
      // create and connect to client
      const client = this.configuration.newClient(); // bsonRegex
      await client.connect();

      const db = client.db('a');
      const collection = db.collection('b');

      await collection.insertOne({ regex: new BSONRegExp('abc', 'imx') });
      const res = await collection.findOne(
        { regex: new BSONRegExp('abc', 'imx') },
        { bsonRegExp: false }
      );

      expect(res).has.property('regex').that.is.instanceOf(BSONRegExp);

      await client.close();
    });
  });
});
