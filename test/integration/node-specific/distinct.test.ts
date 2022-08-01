import { expect } from 'chai';

import { Collection, CommandStartedEvent, Db, MongoClient } from '../../../src';
import { falsyToString, falsyValues } from './comment_with_falsy_values.test';

context('command distinct', function () {
  let client: MongoClient;
  let collection: Collection;
  let commands: CommandStartedEvent[] = [];

  beforeEach(async function () {
    client = this.configuration.newClient({ monitorCommands: true });
    client.on('commandStarted', e => commands.push(e));
    await client.connect();
    collection = await client.db('comment-falsy-values').createCollection('collection');
    commands = [];
  });

  afterEach(async function () {
    await collection.drop();
    await client.close();
  });

  context('comment with falsy values', function () {
    for (const falsyValue of falsyValues) {
      it(`should send falsy value ${falsyToString(falsyValue)} on the command`, async function () {
        await collection.distinct('some-key', {}, { comment: falsyValue }).catch(() => null);

        expect(commands).to.have.lengthOf(1);
        const distinctCommand = commands.find(command => command.commandName === 'distinct');
        expect(distinctCommand).to.exist;

        // chai does not narrow types, so TS doesn't know the distinct command exists at this point.
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        expect(distinctCommand!.command).to.haveOwnProperty('comment');
      });
    }
  });
});
