import { expect } from 'chai';

import { type CommandStartedEvent, MongoServerError, ObjectId } from '../../mongodb';
import { setupDatabase } from '../shared';

describe('Collection (#findOneAnd...)', function () {
  before(function () {
    return setupDatabase(this.configuration);
  });

  describe('#findOneAndDelete', function () {
    context('when no options are passed', function () {
      let client;
      let collection;

      beforeEach(async function () {
        client = this.configuration.newClient({}, { maxPoolSize: 1 });
        collection = client.db('test').collection('findAndModifyTest');
        await collection.insertMany([{ a: 1, b: 1 }], { writeConcern: { w: 1 } });
      });

      afterEach(async function () {
        await collection.drop();
        await client?.close();
      });

      it('returns the raw result', async function () {
        const result = await collection.findOneAndDelete({ a: 1 });
        expect(result.value.b).to.equal(1);
      });
    });

    context('when passing an object id filter', function () {
      let client;
      let collection;
      const started: CommandStartedEvent[] = [];

      beforeEach(async function () {
        client = this.configuration.newClient({}, { maxPoolSize: 1, monitorCommands: true });
        client.on('commandStarted', function (event) {
          if (event.commandName === 'findAndModify') started.push(event);
        });
        collection = client.db('test').collection('findAndModifyTest');
        await collection.insertMany([{ a: 1, b: 1 }], { writeConcern: { w: 1 } });
      });

      afterEach(async function () {
        await collection.drop();
        await client?.close();
      });

      it('does not support object ids as a query predicate', async function () {
        const oid = new ObjectId();
        const error = await collection.findOneAndDelete(oid).catch(error => error);
        expect(error).to.be.instanceOf(MongoServerError);
        expect(started).to.have.lengthOf(1);
        expect(started[0].command).to.have.property('query', oid);
      });
    });

    context('when passing in writeConcern', function () {
      let client;
      let collection;
      let started: CommandStartedEvent[] = [];

      beforeEach(async function () {
        client = this.configuration.newClient({}, { maxPoolSize: 1, monitorCommands: true });
        client.on('commandStarted', function (event) {
          if (event.commandName === 'findAndModify') started.push(event);
        });
      });

      afterEach(async function () {
        started = [];
        await collection.drop();
        await client?.close();
      });

      context('when provided at the operation level', function () {
        beforeEach(async function () {
          collection = client.db('test').collection('findAndModifyTest');
          await collection.insertMany([{ a: 1, b: 1 }], { writeConcern: { w: 1 } });
        });

        it('passes through the writeConcern', async function () {
          await collection.findOneAndDelete({}, { writeConcern: { fsync: 1 } });
          expect(started[0].command.writeConcern).to.deep.equal({ fsync: 1 });
        });
      });

      context('when provided at the collection level', function () {
        beforeEach(async function () {
          collection = client
            .db('test')
            .collection('findAndModifyTest', { writeConcern: { fsync: 1 } });
          await collection.insertMany([{ a: 1, b: 1 }], { writeConcern: { w: 1 } });
        });

        it('passes through the writeConcern', async function () {
          await collection.findOneAndDelete({});
          expect(started[0].command.writeConcern).to.deep.equal({ fsync: 1 });
        });
      });

      context('when provided at the db level', function () {
        beforeEach(async function () {
          collection = client
            .db('test', { writeConcern: { fsync: 1 } })
            .collection('findAndModifyTest');
          await collection.insertMany([{ a: 1, b: 1 }], { writeConcern: { w: 1 } });
        });

        it('passes through the writeConcern', async function () {
          await collection.findOneAndDelete({});
          expect(started[0].command.writeConcern).to.deep.equal({ fsync: 1 });
        });
      });
    });
  });

  describe('#findOneAndUpdate', function () {
    context('when no options are passed', function () {
      let client;
      let collection;

      beforeEach(async function () {
        client = this.configuration.newClient({}, { maxPoolSize: 1 });
        collection = client.db('test').collection('findAndModifyTest');
        await collection.insertMany([{ a: 1, b: 1 }], { writeConcern: { w: 1 } });
      });

      afterEach(async function () {
        await collection.drop();
        await client?.close();
      });

      it('returns the raw result', async function () {
        const result = await collection.findOneAndUpdate({ a: 1 }, { $set: { a: 1 } });
        expect(result.value.b).to.equal(1);
      });
    });

    context('when passing an object id filter', function () {
      let client;
      let collection;
      const started: CommandStartedEvent[] = [];

      beforeEach(async function () {
        client = this.configuration.newClient({}, { maxPoolSize: 1, monitorCommands: true });
        client.on('commandStarted', function (event) {
          if (event.commandName === 'findAndModify') started.push(event);
        });
        collection = client.db('test').collection('findAndModifyTest');
        await collection.insertMany([{ a: 1, b: 1 }], { writeConcern: { w: 1 } });
      });

      afterEach(async function () {
        await collection.drop();
        await client?.close();
      });

      it('does not support object ids as a query predicate', async function () {
        const oid = new ObjectId();
        const error = await collection
          .findOneAndUpdate(oid, { $set: { a: 1 } })
          .catch(error => error);
        expect(error).to.be.instanceOf(MongoServerError);
        expect(started).to.have.lengthOf(1);
        expect(started[0].command).to.have.property('query', oid);
      });
    });

    context('when passing in a non-primary read preference', {
      metadata: {
        requires: { topology: ['replicaset'] }
      },
      test: function () {
        let client;
        let collection;

        beforeEach(async function () {
          client = this.configuration.newClient(
            { readPreference: 'secondary' },
            { maxPoolSize: 1 }
          );
          collection = client.db('test').collection('findAndModifyTest');
          await collection.insertMany([{ a: 1, b: 1 }], { writeConcern: { w: 1 } });
        });

        afterEach(async function () {
          await collection.drop();
          await client?.close();
        });

        it('returns the raw result', async function () {
          const result = await collection.findOneAndUpdate({ a: 1 }, { $set: { a: 1 } });
          expect(result.value.b).to.equal(1);
        });
      }
    });

    context('when passing in writeConcern', function () {
      let client;
      let collection;
      const started: CommandStartedEvent[] = [];

      beforeEach(async function () {
        client = this.configuration.newClient({}, { maxPoolSize: 1, monitorCommands: true });
        client.on('commandStarted', function (event) {
          if (event.commandName === 'findAndModify') started.push(event);
        });
      });

      afterEach(async function () {
        await collection.drop();
        await client?.close();
      });

      context('when provided at the operation level', function () {
        beforeEach(async function () {
          collection = client.db('test').collection('findAndModifyTest');
          await collection.insertMany([{ a: 1, b: 1 }], { writeConcern: { w: 1 } });
        });

        it('passes through the writeConcern', async function () {
          await collection.findOneAndUpdate({}, { $set: { a: 1 } }, { writeConcern: { fsync: 1 } });
          expect(started[0].command.writeConcern).to.deep.equal({ fsync: 1 });
        });
      });

      context('when provided at the collection level', function () {
        beforeEach(async function () {
          collection = client
            .db('test')
            .collection('findAndModifyTest', { writeConcern: { fsync: 1 } });
          await collection.insertMany([{ a: 1, b: 1 }], { writeConcern: { w: 1 } });
        });

        it('passes through the writeConcern', async function () {
          await collection.findOneAndUpdate({}, { $set: { a: 1 } });
          expect(started[0].command.writeConcern).to.deep.equal({ fsync: 1 });
        });
      });

      context('when provided at the db level', function () {
        beforeEach(async function () {
          collection = client
            .db('test', { writeConcern: { fsync: 1 } })
            .collection('findAndModifyTest');
          await collection.insertMany([{ a: 1, b: 1 }], { writeConcern: { w: 1 } });
        });

        it('passes through the writeConcern', async function () {
          await collection.findOneAndUpdate({}, { $set: { a: 1 } });
          expect(started[0].command.writeConcern).to.deep.equal({ fsync: 1 });
        });
      });
    });
  });

  describe('#findOneAndReplace', function () {
    context('when no options are passed', function () {
      let client;
      let collection;

      beforeEach(async function () {
        client = this.configuration.newClient({}, { maxPoolSize: 1 });
        collection = client.db('test').collection('findAndModifyTest');
        await collection.insertMany([{ a: 1, b: 1 }], { writeConcern: { w: 1 } });
      });

      afterEach(async function () {
        await collection.drop();
        await client?.close();
      });

      it('returns the raw result', async function () {
        const result = await collection.findOneAndReplace({ a: 1 }, { a: 1 });
        expect(result.value.b).to.equal(1);
      });
    });

    context('when passing an object id filter', function () {
      let client;
      let collection;
      const started: CommandStartedEvent[] = [];

      beforeEach(async function () {
        client = this.configuration.newClient({}, { maxPoolSize: 1, monitorCommands: true });
        client.on('commandStarted', function (event) {
          if (event.commandName === 'findAndModify') started.push(event);
        });
        collection = client.db('test').collection('findAndModifyTest');
        await collection.insertMany([{ a: 1, b: 1 }], { writeConcern: { w: 1 } });
      });

      afterEach(async function () {
        await collection.drop();
        await client?.close();
      });

      it('does not support object ids as a query predicate', async function () {
        const oid = new ObjectId();
        const error = await collection.findOneAndReplace(oid, {}).catch(error => error);
        expect(error).to.be.instanceOf(MongoServerError);
        expect(started).to.have.lengthOf(1);
        expect(started[0].command).to.have.property('query', oid);
      });
    });

    context('when providing atomic operators', function () {
      let client;
      let collection;

      beforeEach(async function () {
        client = this.configuration.newClient({}, { maxPoolSize: 1 });
        collection = client.db('test').collection('findAndModifyTest');
        await collection.insertMany([{ a: 1, b: 1 }], { writeConcern: { w: 1 } });
      });

      afterEach(async function () {
        await collection.drop();
        await client?.close();
      });

      it('returns an error', async function () {
        const error = await collection
          .findOneAndReplace({ a: 1 }, { $set: { a: 14 } })
          .catch(error => error);
        expect(error.message).to.match(/must not contain atomic operators/);
      });
    });

    context('when passing in writeConcern', function () {
      let client;
      let collection;
      let started: CommandStartedEvent[] = [];

      beforeEach(async function () {
        client = this.configuration.newClient({}, { maxPoolSize: 1, monitorCommands: true });
        client.on('commandStarted', function (event) {
          if (event.commandName === 'findAndModify') started.push(event);
        });
      });

      afterEach(async function () {
        started = [];
        await collection.drop();
        await client?.close();
      });

      context('when provided at the operation level', function () {
        beforeEach(async function () {
          collection = client.db('test').collection('findAndModifyTest');
          await collection.insertMany([{ a: 1, b: 1 }], { writeConcern: { w: 1 } });
        });

        it('passes through the writeConcern', async function () {
          await collection.findOneAndReplace({}, { b: 1 }, { writeConcern: { fsync: 1 } });
          expect(started[0].command.writeConcern).to.deep.equal({ fsync: 1 });
        });
      });

      context('when provided at the collection level', function () {
        beforeEach(async function () {
          collection = client
            .db('test')
            .collection('findAndModifyTest', { writeConcern: { w: 1 } });
          await collection.insertMany([{ a: 1, b: 1 }]);
        });

        it('passes through the writeConcern', async function () {
          await collection.findOneAndReplace({}, { b: 1 });
          expect(started[0].command.writeConcern).to.deep.equal({ w: 1 });
        });
      });

      context('when provided at the db level', function () {
        beforeEach(async function () {
          collection = client
            .db('test', { writeConcern: { w: 1 } })
            .collection('findAndModifyTest');
          await collection.insertMany([{ a: 1, b: 1 }]);
        });

        it('passes through the writeConcern', async function () {
          await collection.findOneAndReplace({}, { b: 1 });
          expect(started[0].command.writeConcern).to.deep.equal({ w: 1 });
        });
      });
    });
  });
});
