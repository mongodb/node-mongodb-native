import { expect } from 'chai';

import { CommandStartedEvent, Db, MongoClient } from '../../mongodb';

describe('class RunCommandCursor', () => {
  let client: MongoClient;
  let db: Db;
  let commandsStarted: CommandStartedEvent[];

  beforeEach(async function () {
    client = this.configuration.newClient({}, { monitorCommands: true });
    db = client.db();
    await db.dropDatabase().catch(() => null);
    await db
      .collection<{ _id: number }>('collection')
      .insertMany([{ _id: 0 }, { _id: 1 }, { _id: 2 }]);
    commandsStarted = [];
    client.on('commandStarted', started => commandsStarted.push(started));
  });

  afterEach(async function () {
    commandsStarted = [];
    await client.close();
  });

  it('should only run init command once', async () => {
    const cursor = db.runCursorCommand({ find: 'collection', filter: {}, batchSize: 1 });
    cursor.setBatchSize(1);
    const it0 = cursor[Symbol.asyncIterator]();
    const it1 = cursor[Symbol.asyncIterator]();

    const next0it0 = await it0.next(); // find, 1 doc
    const next0it1 = await it1.next(); // getMore, 1 doc

    expect(next0it0).to.deep.equal({ value: { _id: 0 }, done: false });
    expect(next0it1).to.deep.equal({ value: { _id: 1 }, done: false });
    expect(commandsStarted.map(c => c.commandName)).to.have.lengthOf(2);

    const next1it0 = await it0.next(); // getMore, 1 doc
    const next1it1 = await it1.next(); // getMore, 0 doc & exhausted id

    expect(next1it0).to.deep.equal({ value: { _id: 2 }, done: false });
    expect(next1it1).to.deep.equal({ value: undefined, done: true });
    expect(commandsStarted.map(c => c.commandName)).to.have.lengthOf(4);

    const next2it0 = await it0.next();
    const next2it1 = await it1.next();

    expect(next2it0).to.deep.equal({ value: undefined, done: true });
    expect(next2it1).to.deep.equal({ value: undefined, done: true });
    expect(commandsStarted.map(c => c.commandName)).to.have.lengthOf(4);
  });
});
