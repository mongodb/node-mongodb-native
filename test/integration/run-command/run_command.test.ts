import { expect } from 'chai';

import {
  type CommandStartedEvent,
  type Db,
  type MongoClient,
  ReadConcern,
  ReadPreference,
  WriteConcern
} from '../../mongodb';

describe('RunCommand API', () => {
  let client: MongoClient;
  let db: Db;
  let commandsStarted: CommandStartedEvent[];

  beforeEach(async function () {
    const options = {
      serverApi: { version: '1', strict: true, deprecationErrors: false },
      monitorCommands: true
    };
    client = this.configuration.newClient({}, options);
    db = client.db();
    commandsStarted = [];
    client.on('commandStarted', started => commandsStarted.push(started));
  });

  afterEach(async function () {
    commandsStarted = [];
    await client.close();
  });

  it('does not modify user input', { requires: { mongodb: '>=5.0' } }, async () => {
    const command = Object.freeze({ ping: 1 });
    // will throw if it tries to modify command
    await db.command(command, { readPreference: ReadPreference.nearest });
  });

  it('does not support writeConcern in options', { requires: { mongodb: '>=5.0' } }, async () => {
    const command = Object.freeze({ insert: 'test', documents: [{ x: 1 }] });
    //@ts-expect-error: Testing WC is not supported
    await db.command(command, { writeConcern: new WriteConcern('majority') });
    expect(commandsStarted).to.not.have.nested.property('[0].command.writeConcern');
    expect(command).to.not.have.property('writeConcern');
  });

  it('does not support readConcern in options', { requires: { mongodb: '>=5.0' } }, async () => {
    const command = Object.freeze({ find: 'test', filter: {} });
    //@ts-expect-error: Testing RC is not supported
    const res = await db.command(command, { readConcern: ReadConcern.MAJORITY });
    expect(res).to.have.property('ok', 1);
    expect(commandsStarted).to.not.have.nested.property('[0].command.readConcern');
    expect(command).to.not.have.property('readConcern');
  });
});
