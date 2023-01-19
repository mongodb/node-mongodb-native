import { expect } from 'chai';
import { once } from 'events';

import { type Db, type MongoClient, CommandStartedEvent, GridFSBucket } from '../../mongodb';
import { sleep } from '../../tools/utils';

describe('GridFS', () => {
  let client: MongoClient;
  let db: Db;
  let bucket: GridFSBucket;
  let commandStartedEvents: CommandStartedEvent[];

  beforeEach(async function () {
    client = this.configuration.newClient({ monitorCommands: true });
    db = client.db('gridfsTest');

    // Reset namespace
    await db.dropCollection('fs.files').catch(() => null);
    await db.dropCollection('fs.chunks').catch(() => null);
    await db.dropDatabase().catch(() => null);
    await sleep(100);

    commandStartedEvents = [];
    client.on('commandStarted', e => commandStartedEvents.push(e));
    bucket = new GridFSBucket(db);
  });

  afterEach(async function () {
    commandStartedEvents = [];
    await client.close();
  });

  describe('class GridFSBucket', () => {
    const assertIndexesExist = () => {
      expect(bucket.s).to.have.property('checkedIndexes', true);

      const listIndexes = commandStartedEvents.filter(e => e.commandName === 'listIndexes');
      expect(listIndexes).to.have.lengthOf(2);

      const createIndexes = commandStartedEvents.filter(e => e.commandName === 'createIndexes');
      expect(createIndexes).to.have.lengthOf(2);
      expect(createIndexes[0]).to.have.deep.nested.property('command.createIndexes', 'fs.files');
      expect(createIndexes[0]).to.have.deep.nested.property(
        'command.indexes[0].key',
        new Map([
          ['filename', 1],
          ['uploadDate', 1]
        ])
      );
      expect(createIndexes[1]).to.have.deep.nested.property('command.createIndexes', 'fs.chunks');
      expect(createIndexes[1]).to.have.deep.nested.property(
        'command.indexes[0].key',
        new Map([
          ['files_id', 1],
          ['n', 1]
        ])
      );
    };

    it('ensures chunks and files collection have required indexes when namespace does not exist', async () => {
      // Ensure the namespace does not exist; beforeEach should drop the Db, keeping this true
      expect(
        (await db.collections()).filter(({ namespace }) => namespace.startsWith('fs'))
      ).to.have.lengthOf(0);

      const upload = bucket.openUploadStream('test.txt');
      await once(bucket, 'index');
      await upload.abort();

      assertIndexesExist();
    });

    it('ensures chunks and files collection have required indexes when namespace does', async () => {
      // Ensure the namespace does exist
      await db.createCollection('fs.files');
      await db.createCollection('fs.chunks');

      const upload = bucket.openUploadStream('test.txt');
      await once(bucket, 'index');
      await upload.abort();

      assertIndexesExist();
    });

    it('skips creating required indexes if they already exist', async () => {
      const files = await db.createCollection('fs.files');
      const chunks = await db.createCollection('fs.chunks');

      await files.createIndex(
        new Map([
          ['filename', 1],
          ['uploadDate', 1]
        ])
      );

      await chunks.createIndex(
        new Map([
          ['files_id', 1],
          ['n', 1]
        ])
      );

      // reset events array
      commandStartedEvents = [];

      const upload = bucket.openUploadStream('test.txt');
      await once(bucket, 'index');
      await upload.abort();

      // Still listed indexes
      const listIndexes = commandStartedEvents.filter(e => e.commandName === 'listIndexes');
      expect(listIndexes).to.have.lengthOf(2);

      // But since it found them, we didn't attempt creation
      const createIndexes = commandStartedEvents.filter(e => e.commandName === 'createIndexes');
      expect(createIndexes).to.have.lengthOf(0);
    });
  });
});
