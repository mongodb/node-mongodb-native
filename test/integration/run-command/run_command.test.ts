import { expect } from 'chai';

import {
  CommandStartedEvent,
  Db,
  MongoClient,
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
    await db.command(command, { writeConcern: new WriteConcern('majority') });
    expect(commandsStarted).to.not.have.nested.property('[0].command.writeConcern');
    expect(command).to.not.have.property('writeConcern');
  });

  // TODO(NODE-4936): We do support readConcern in options, the spec forbids this
  it.skip(
    'does not support readConcern in options',
    { requires: { mongodb: '>=5.0' } },
    async () => {
      const command = Object.freeze({ find: 'test', filter: {} });
      const res = await db.command(command, { readConcern: ReadConcern.MAJORITY });
      expect(res).to.have.property('ok', 1);
      expect(commandsStarted).to.not.have.nested.property('[0].command.readConcern');
      expect(command).to.not.have.property('readConcern');
    }
  ).skipReason =
    'TODO(NODE-4936): Enable this test when readConcern support has been removed from runCommand';
});
