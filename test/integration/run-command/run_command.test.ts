import { expect } from 'chai';

import {
  CommandStartedEvent,
  Db,
  MongoClient,
  ReadConcern,
  ReadPreference,
  WriteConcern
} from '../../mongodb';

describe.only('RunCommand API', () => {
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

  context('does not modify user input', () => {
    it('for session', async () => {
      const command = { ping: 1 };
      const res = await db.command(command);
      expect(res).to.have.property('ok', 1);
      expect(commandsStarted).to.have.nested.property('[0].command.lsid');
      expect(command).to.not.have.property('lsid');
    });

    it('for readPreference', async () => {
      const command = { ping: 1 };
      const res = await db.command(command, { readPreference: ReadPreference.nearest });
      expect(res).to.have.property('ok', 1);
      expect(commandsStarted).to.have.nested.property('[0].command.$readPreference');
      expect(command).to.not.have.property('$readPreference');
    });

    it('for $db', async () => {
      const command = { ping: 1 };
      const res = await db.command(command, { readPreference: ReadPreference.nearest });
      expect(res).to.have.property('ok', 1);
      expect(commandsStarted).to.have.nested.property('[0].command.$db');
      expect(command).to.not.have.property('$db');
    });

    it('for apiVersion, apiStrict, apiDeprecationErrors', async () => {
      const command = { ping: 1 };
      const res = await db.command(command, { readPreference: ReadPreference.nearest });
      expect(res).to.have.property('ok', 1);
      expect(commandsStarted).to.have.nested.property('[0].command.apiVersion');
      expect(commandsStarted).to.have.nested.property('[0].command.apiStrict');
      expect(commandsStarted).to.have.nested.property('[0].command.apiDeprecationErrors');
      expect(command).to.not.have.property('apiVersion');
      expect(command).to.not.have.property('apiStrict');
      expect(command).to.not.have.property('apiDeprecationErrors');
    });

    it.skip('for readConcern', async () => {
      const command = { find: 'test', filter: {} };
      const res = await db.command(command, { readConcern: ReadConcern.MAJORITY });
      expect(res).to.have.property('ok', 1);
      expect(commandsStarted).to.not.have.nested.property('[0].command.readConcern');
      expect(command).to.not.have.property('readConcern');
    }).skipReason =
      'TODO(NODE-4936): Enable this test when readConcern support has been removed from runCommand';

    it('for writeConcern', async () => {
      const command = { insert: 'test', documents: [{ x: 1 }] };
      const res = await db.command(command, { writeConcern: new WriteConcern('majority') });
      expect(res).to.have.property('ok', 1);
      expect(commandsStarted).to.not.have.nested.property('[0].command.writeConcern');
      expect(command).to.not.have.property('writeConcern');
    });
  });

  it('does not modify user input', async () => {
    const command = Object.freeze({ ping: 1 });
    const res = await db.command(command); // will throw if it tries to modify command
    expect(res).to.have.property('ok', 1);
  });
});
