import { expect } from 'chai';

import { type CommandStartedEvent, type MongoClient } from '../../mongodb';
import { filterForCommands } from '../shared';

// NODE-7958: timeoutMS is deprecated and has no effect
describe('timeoutMS is a no-op', function () {
  let client: MongoClient;
  const commands: CommandStartedEvent[] = [];

  afterEach(async function () {
    commands.length = 0;
    await client?.close();
  });

  context('when timeoutMS is set on the client', function () {
    beforeEach(async function () {
      client = this.configuration.newClient({}, { timeoutMS: 1, monitorCommands: true });
      client.on('commandStarted', filterForCommands('insert', commands));
    });

    it('does not time out operations and does not send maxTimeMS', async function () {
      const result = await client.db('timeout_ms_noop').collection('test').insertOne({ a: 1 });

      expect(result).to.have.property('acknowledged', true);
      expect(commands).to.have.lengthOf(1);
      expect(commands[0].command).to.not.have.property('maxTimeMS');
    });

    it('is not set on the client options', function () {
      expect(client.options).to.not.have.property('timeoutMS');
    });
  });

  context('when timeoutMS is set on an operation', function () {
    beforeEach(async function () {
      client = this.configuration.newClient({}, { monitorCommands: true });
      client.on('commandStarted', filterForCommands('find', commands));
    });

    it('does not time out the operation and does not send maxTimeMS', async function () {
      const docs = await client
        .db('timeout_ms_noop')
        .collection('test')
        .find({}, { timeoutMS: 1 })
        .toArray();

      expect(docs).to.be.an('array');
      expect(commands).to.have.lengthOf(1);
      expect(commands[0].command).to.not.have.property('maxTimeMS');
    });

    it('does not throw when timeoutMode is also set', async function () {
      const docs = await client
        .db('timeout_ms_noop')
        .collection('test')
        .find({}, { timeoutMode: 'iteration' })
        .toArray();

      expect(docs).to.be.an('array');
    });
  });
});
