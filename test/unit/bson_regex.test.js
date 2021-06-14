'use strict';

const { expect } = require('chai');
const { BSONRegExp } = require('../../src/index');

describe('BSONRegExp', () => {
  describe('bsonRegExp option', () => {
    it('should respond with BSONRegExp class with option passed to db', async function () {
      let client;
      try {
        // create and connect to client
        client = this.configuration.newClient();
        await client.connect();

        const db = client.db('a', { bsonRegExp: true });
        const collection = db.collection('b');

        await collection.insertOne({ regex: new BSONRegExp('abc', 'imx') });
        const res = await collection.findOne({ regex: new BSONRegExp('abc', 'imx') });

        expect(res).has.property('regex').that.is.instanceOf(BSONRegExp);
      } finally {
        await client.close();
      }
    });

    it('should respond with BSONRegExp class with option passed to collection', async function () {
      let client;
      try {
        // create and connect to client
        client = this.configuration.newClient(); // bsonRegex
        await client.connect();

        const db = client.db('a');
        const collection = db.collection('b', { bsonRegExp: true });

        await collection.insertOne({ regex: new BSONRegExp('abc', 'imx') });
        const res = await collection.findOne({ regex: new BSONRegExp('abc', 'imx') });

        expect(res).has.property('regex').that.is.instanceOf(BSONRegExp);
      } finally {
        await client.close();
      }
    });

    it('should respond with BSONRegExp class with option passed to operation', async function () {
      let client;
      try {
        // create and connect to client
        client = this.configuration.newClient(); // bsonRegex
        await client.connect();

        const db = client.db('a');
        const collection = db.collection('b');

        await collection.insertOne({ regex: new BSONRegExp('abc', 'imx') });
        const res = await collection.findOne(
          { regex: new BSONRegExp('abc', 'imx') },
          { bsonRegExp: true }
        );

        expect(res).has.property('regex').that.is.instanceOf(BSONRegExp);
      } finally {
        await client.close();
      }
    });
  });
});
