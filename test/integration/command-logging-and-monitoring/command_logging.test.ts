import { expect } from 'chai';
import * as process from 'process';

import {
  CommandFailedEvent,
  CommandStartedEvent,
  CommandSucceededEvent,
  Db,
  Log,
  MongoClient
} from '../../mongodb';
import { setupDatabase } from '../shared';

describe('Command Logging', function () {
  before(function () {
    return setupDatabase(this.configuration);
  });

  const logDestination = {
    buffer: [],
    write(log: Log) {
      this.buffer.push(log);
    }
  } as { buffer: any[]; write: (log: Log) => void };
  let client: MongoClient;
  let db: Db;
  //let coll: Collection;

  beforeEach(async function () {
    client = new MongoClient(
      process.env.MONGODB_URI as string,
      {
        monitorCommands: true,
        [Symbol.for('@@mdb.internalLoggerConfig')]: {
          MONGODB_LOG_ALL: 'emergency',
          MONGODB_LOG_COMMAND: 'emergency'
        },
        [Symbol.for('@@mdb.enableMongoLogger')]: true,
        mongodbLogPath: logDestination
      } as any
    );
    await client.connect();
    db = client.db('command_logging');
  });

  afterEach(async function () {
    if (db) {
      await db.dropDatabase();
    }
    await client.close().catch(() => null);
  });

  context('sensitive commands', function () {
    it('should redact sensitive commands', async function () {
      const log = (ev: CommandStartedEvent | CommandSucceededEvent | CommandFailedEvent) => {
        client.mongoLogger.emergency('command', ev);
      };
      client.on('commandStarted', log);
      client.on('commandSucceeded', log);
      client.on('commandFailed', log);

      const result = await db.command({ hello: 1, speculativeAuthenticate: { saslStart: 1 } });
      expect(result).to.exist;
      expect(logDestination.buffer).to.have.lengthOf(2);

      const commandStarted = logDestination.buffer[0];
      const commandSucceeded = logDestination.buffer[1];
      expect(commandStarted).to.exist;
      expect(commandStarted).to.have.property('command', '{}');
      expect(commandStarted).to.have.property('message', 'Command started');

      expect(commandSucceeded).to.exist;
      expect(commandSucceeded).to.have.property('reply', '{}');
      expect(commandSucceeded).to.have.property('message', 'Command succeeded');
    });
  });
});
