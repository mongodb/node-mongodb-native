import { expect } from 'chai';

import {
  type Collection,
  type CommandStartedEvent,
  type Db,
  type Document,
  type MongoClient,
  MongoServerError
} from '../../mongodb';

/**
 * By default the driver filters index options against an allowlist before sending them
 * to the server, so options the server supports but the driver has not learned about yet are
 * silently dropped. `{ validateOptions: false }` turns the filter off.
 *
 * `createIndex` and `createIndexes` are separated here because they build their index descriptions
 * by different routes. `createIndexes` receives `IndexDescription` objects the user wrote directly,
 * so index options and command options never mix. `createIndex` takes a single flat options bag
 * that is *both*, and only becomes an index description via a merge in `fromIndexSpecification` —
 * which is why turning the allowlist off is far more delicate on that path.
 *
 * The allowlist is what sorts that mixed bag today: index options survive into the description and
 * everything else is dropped. Turning it off removes the only mechanism doing that sorting, so on
 * the three parameter overload the separation becomes the caller's responsibility — index options
 * in the second parameter, command options in the third. A command option left in the second
 * parameter is forwarded to the server verbatim and the server rejects it, which is the intended
 * (and loud) outcome rather than something the driver silently repairs.
 */

/**
 * The `key` of an index description is a Map by the time it reaches the wire, so that index key
 * ordering is preserved. Convert it back to a plain object so descriptions can be compared with
 * `deep.equal`.
 */
function indexesSentBy(event: CommandStartedEvent): Document[] {
  return event.command.indexes.map(({ key, ...rest }: Document) => ({
    ...rest,
    key: Object.fromEntries(key)
  }));
}

describe('createIndex option validation', function () {
  let client: MongoClient;
  let db: Db;
  let collection: Collection;
  let commands: CommandStartedEvent[];

  /** The `indexes` array as it appeared on the wire for the last createIndexes command. */
  function sentIndexes(): Document[] {
    expect(commands).to.have.lengthOf.at.least(1);
    return indexesSentBy(commands[commands.length - 1]);
  }

  /** The last createIndexes command itself, without its `indexes` array. */
  function sentCommand(): Document {
    expect(commands).to.have.lengthOf.at.least(1);
    const { indexes: _indexes, ...rest } = commands[commands.length - 1].command;
    return rest;
  }

  beforeEach(async function () {
    client = this.configuration.newClient({}, { monitorCommands: true });
    commands = [];
    client.on('commandStarted', ev => {
      if (ev.commandName === 'createIndexes') commands.push(ev);
    });
    db = client.db('node6893_create_index');
    collection = db.collection('c');
  });

  afterEach(async function () {
    await db.dropDatabase().catch(() => null);
    await client.close();
  });

  // The two parameter overload keeps the historical behaviour: one flat options bag, sorted by the
  // allowlist. These tests guard that the filter is still in place and still doing the sorting.
  describe('when validateOptions is not specified', function () {
    it('sends only the key and a generated name for a bare call', async function () {
      await collection.createIndex({ a: 1 });

      expect(sentIndexes()).to.deep.equal([{ key: { a: 1 }, name: 'a_1' }]);
    });

    it('sends index options and maps version to v', async function () {
      await collection.createIndex(
        { b: 1 },
        { unique: true, sparse: true, name: 'b_ix', version: 2 }
      );

      expect(sentIndexes()).to.deep.equal([
        { unique: true, sparse: true, name: 'b_ix', v: 2, key: { b: 1 } }
      ]);
    });

    it('sends text index options', async function () {
      await collection.createIndex(
        { c: 'text' },
        { weights: { c: 5 }, default_language: 'english', textIndexVersion: 3 }
      );

      expect(sentIndexes()).to.deep.equal([
        {
          weights: { c: 5 },
          default_language: 'english',
          textIndexVersion: 3,
          name: 'c_text',
          key: { c: 'text' }
        }
      ]);
    });

    it('drops an unknown option from the options bag', async function () {
      // @ts-expect-error CreateIndexesOptions is a closed interface
      await collection.createIndex({ d: 1 }, { unique: true, notARealOption: true });

      expect(sentIndexes()).to.deep.equal([{ unique: true, name: 'd_1', key: { d: 1 } }]);
    });

    it('keeps user-supplied command options out of the index description', async function () {
      await collection.createIndex(
        { e: 1 },
        { unique: true, comment: 'a comment', maxTimeMS: 1000, expireAfterSeconds: 100 }
      );

      expect(sentIndexes()).to.deep.equal([
        { unique: true, expireAfterSeconds: 100, name: 'e_1', key: { e: 1 } }
      ]);
      expect(sentCommand()).to.have.property('maxTimeMS', 1000);
    });

    it('keeps command options out of the index description for db.createIndex', async function () {
      await db.createIndex('c', { f: 1 }, { unique: true, comment: 'a comment' });

      expect(sentIndexes()).to.deep.equal([{ unique: true, name: 'f_1', key: { f: 1 } }]);
    });
  });

  describe('when validateOptions is true', function () {
    it('sends only the key and a generated name for a bare call', async function () {
      await collection.createIndex({ a: 1 }, {}, { validateOptions: true });

      expect(sentIndexes()).to.deep.equal([{ key: { a: 1 }, name: 'a_1' }]);
    });

    it('drops an unknown option from the options bag', async function () {
      await collection.createIndex(
        { d: 1 },
        // @ts-expect-error CreateIndexesOptions is a closed interface
        { unique: true, notARealOption: true },
        { validateOptions: true }
      );

      expect(sentIndexes()).to.deep.equal([{ unique: true, name: 'd_1', key: { d: 1 } }]);
    });

    it('keeps user-supplied command options out of the index description', async function () {
      await collection.createIndex(
        { e: 1 },
        { unique: true, comment: 'a comment', maxTimeMS: 1000 },
        { validateOptions: true }
      );

      expect(sentIndexes()).to.deep.equal([{ unique: true, name: 'e_1', key: { e: 1 } }]);
    });
  });

  describe('when validateOptions is false', function () {
    it('does not send driver options the user never supplied', async function () {
      await collection.createIndex({ a: 1 }, {}, { validateOptions: false });

      expect(sentIndexes()).to.deep.equal([{ key: { a: 1 }, name: 'a_1' }]);
    });

    it('sends an unknown option to the server', async function () {
      const error = await collection
        // @ts-expect-error CreateIndexesOptions is a closed interface
        .createIndex({ d: 1 }, { notARealOption: true }, { validateOptions: false })
        .catch(error => error);

      // the driver forwards the option; the server is what rejects it
      expect(sentIndexes()[0]).to.have.property('notARealOption', true);
      expect(error).to.be.instanceOf(MongoServerError);
      expect(error.message).to.match(/not valid for an index specification/);
    });

    it(
      'creates an index using a server option the driver does not know about',
      { metadata: { requires: { mongodb: '>=5.3' } } },
      async function () {
        // `prepareUnique` is supported by the server but is not in the driver's allowlist
        await collection.createIndex(
          { e: 1 },
          // @ts-expect-error CreateIndexesOptions is a closed interface
          { prepareUnique: true },
          { validateOptions: false }
        );

        expect(sentIndexes()[0]).to.have.property('prepareUnique', true);
        const indexes = await collection.listIndexes().toArray();
        expect(indexes.find(index => index.name === 'e_1')).to.have.property('prepareUnique', true);
      }
    );

    it('sends index options as normal', async function () {
      await collection.createIndex(
        { f: 1 },
        { unique: true, sparse: true, version: 2 },
        { validateOptions: false }
      );

      expect(sentIndexes()).to.deep.equal([
        { unique: true, sparse: true, v: 2, name: 'f_1', key: { f: 1 } }
      ]);
    });

    describe('and command options are passed in the third parameter', function () {
      it('keeps a comment out of the index description', async function () {
        await collection.createIndex(
          { g: 1 },
          { unique: true },
          { validateOptions: false, comment: 'a comment' }
        );

        expect(sentIndexes()).to.deep.equal([{ unique: true, name: 'g_1', key: { g: 1 } }]);
        // `comment` is accepted by CommandOperationOptions but createIndexes has never written it
        // into its command document, so it does not reach the wire on either overload. This
        // asserts only that the third parameter does not leak it into the index description.
        expect(sentCommand()).to.not.have.property('comment');
      });

      it('sends maxTimeMS on the command and not in the index description', async function () {
        await collection.createIndex(
          { h: 1 },
          { unique: true },
          { validateOptions: false, maxTimeMS: 1000 }
        );

        expect(sentIndexes()).to.deep.equal([{ unique: true, name: 'h_1', key: { h: 1 } }]);
        expect(sentCommand()).to.have.property('maxTimeMS', 1000);
      });

      it('sends a session on the command and not in the index description', async function () {
        const session = client.startSession();
        try {
          await collection.createIndex(
            { i: 1 },
            { unique: true },
            { validateOptions: false, session }
          );

          expect(sentIndexes()).to.deep.equal([{ unique: true, name: 'i_1', key: { i: 1 } }]);
          expect(sentCommand()).to.have.property('lsid');
        } finally {
          await session.endSession();
        }
      });

      it('sends a writeConcern on the command and not in the index description', async function () {
        await collection.createIndex(
          { j: 1 },
          { unique: true },
          { validateOptions: false, writeConcern: { w: 1 } }
        );

        expect(sentIndexes()).to.deep.equal([{ unique: true, name: 'j_1', key: { j: 1 } }]);
        expect(sentCommand()).to.have.property('writeConcern');
      });

      it('sends index options and command options together', async function () {
        await collection.createIndex(
          { k: 1 },
          { unique: true, sparse: true, expireAfterSeconds: 100 },
          { validateOptions: false, maxTimeMS: 1000, writeConcern: { w: 1 } }
        );

        expect(sentIndexes()).to.deep.equal([
          { unique: true, sparse: true, expireAfterSeconds: 100, name: 'k_1', key: { k: 1 } }
        ]);
        expect(sentCommand()).to.have.property('maxTimeMS', 1000);
        expect(sentCommand()).to.have.property('writeConcern');
      });
    });

    describe('and a command option is left in the index options', function () {
      it('forwards a comment to the server, which rejects it', async function () {
        const error = await collection
          .createIndex({ l: 1 }, { unique: true, comment: 'a comment' }, { validateOptions: false })
          .catch(error => error);

        expect(sentIndexes()[0]).to.have.property('comment', 'a comment');
        expect(error).to.be.instanceOf(MongoServerError);
        expect(error.message).to.match(/not valid for an index specification/);
      });

      it('forwards maxTimeMS to the server, which rejects it', async function () {
        const error = await collection
          .createIndex({ m: 1 }, { unique: true, maxTimeMS: 1000 }, { validateOptions: false })
          .catch(error => error);

        expect(sentIndexes()[0]).to.have.property('maxTimeMS', 1000);
        expect(error).to.be.instanceOf(MongoServerError);
        expect(error.message).to.match(/not valid for an index specification/);
      });
    });
  });
});

describe('createIndexes option validation', function () {
  let client: MongoClient;
  let db: Db;
  let collection: Collection;
  let commands: CommandStartedEvent[];

  function sentIndexes(): Document[] {
    expect(commands).to.have.lengthOf.at.least(1);
    return indexesSentBy(commands[commands.length - 1]);
  }

  function sentCommand(): Document {
    expect(commands).to.have.lengthOf.at.least(1);
    const { indexes: _indexes, ...rest } = commands[commands.length - 1].command;
    return rest;
  }

  beforeEach(async function () {
    client = this.configuration.newClient({}, { monitorCommands: true });
    commands = [];
    client.on('commandStarted', ev => {
      if (ev.commandName === 'createIndexes') commands.push(ev);
    });
    db = client.db('node6893_create_indexes');
    collection = db.collection('c');
  });

  afterEach(async function () {
    await db.dropDatabase().catch(() => null);
    await client.close();
  });

  describe('when validateOptions is not specified', function () {
    it('sends only the key and a generated name for a bare description', async function () {
      await collection.createIndexes([{ key: { a: 1 } }]);

      expect(sentIndexes()).to.deep.equal([{ key: { a: 1 }, name: 'a_1' }]);
    });

    it('sends index options and maps version to v', async function () {
      await collection.createIndexes([
        { key: { b: 1 }, name: 'b_ix', unique: true, version: 2 },
        { key: { c: -1 }, hidden: true, expireAfterSeconds: 60 }
      ]);

      expect(sentIndexes()).to.deep.equal([
        { name: 'b_ix', unique: true, v: 2, key: { b: 1 } },
        { hidden: true, expireAfterSeconds: 60, name: 'c_-1', key: { c: -1 } }
      ]);
    });

    it('drops an unknown option from an index description', async function () {
      await collection.createIndexes([
        // @ts-expect-error IndexDescription is a closed interface
        { key: { d: 1 }, name: 'd_1', unique: true, notARealOption: true }
      ]);

      expect(sentIndexes()).to.deep.equal([{ name: 'd_1', unique: true, key: { d: 1 } }]);
    });

    it('keeps user-supplied command options out of the index description', async function () {
      await collection.createIndexes([{ key: { e: 1 } }], { writeConcern: { w: 1 } });

      expect(sentIndexes()).to.deep.equal([{ key: { e: 1 }, name: 'e_1' }]);
      expect(sentCommand()).to.have.property('writeConcern');
    });
  });

  describe('when validateOptions is true', function () {
    it('sends only the key and a generated name for a bare description', async function () {
      await collection.createIndexes([{ key: { a: 1 } }], {}, { validateOptions: true });

      expect(sentIndexes()).to.deep.equal([{ key: { a: 1 }, name: 'a_1' }]);
    });

    it('drops an unknown option from an index description', async function () {
      await collection.createIndexes(
        // @ts-expect-error IndexDescription is a closed interface
        [{ key: { d: 1 }, name: 'd_1', unique: true, notARealOption: true }],
        {},
        { validateOptions: true }
      );

      expect(sentIndexes()).to.deep.equal([{ name: 'd_1', unique: true, key: { d: 1 } }]);
    });
  });

  describe('when validateOptions is false', function () {
    it('does not send driver options the user never supplied', async function () {
      await collection.createIndexes([{ key: { a: 1 } }], {}, { validateOptions: false });

      expect(sentIndexes()).to.deep.equal([{ key: { a: 1 }, name: 'a_1' }]);
    });

    it('sends an unknown option to the server', async function () {
      const error = await collection
        .createIndexes(
          // @ts-expect-error IndexDescription is a closed interface
          [{ key: { d: 1 }, name: 'd_1', notARealOption: true }],
          {},
          { validateOptions: false }
        )
        .catch(error => error);

      expect(sentIndexes()[0]).to.have.property('notARealOption', true);
      expect(error).to.be.instanceOf(MongoServerError);
      expect(error.message).to.match(/not valid for an index specification/);
    });

    it(
      'creates an index using a server option the driver does not know about',
      { metadata: { requires: { mongodb: '>=5.3' } } },
      async function () {
        await collection.createIndexes(
          // @ts-expect-error IndexDescription is a closed interface
          [{ key: { e: 1 }, name: 'e_1', prepareUnique: true }],
          {},
          { validateOptions: false }
        );

        expect(sentIndexes()[0]).to.have.property('prepareUnique', true);
        const indexes = await collection.listIndexes().toArray();
        expect(indexes.find(index => index.name === 'e_1')).to.have.property('prepareUnique', true);
      }
    );

    it('sends index options as normal', async function () {
      await collection.createIndexes(
        [{ key: { f: 1 }, unique: true, sparse: true, version: 2 }],
        {},
        { validateOptions: false }
      );

      expect(sentIndexes()).to.deep.equal([
        { unique: true, sparse: true, v: 2, name: 'f_1', key: { f: 1 } }
      ]);
    });

    it('keeps user-supplied command options out of the index description', async function () {
      await collection.createIndexes(
        [{ key: { g: 1 }, unique: true }],
        { writeConcern: { w: 1 } },
        { validateOptions: false }
      );

      expect(sentIndexes()).to.deep.equal([{ unique: true, name: 'g_1', key: { g: 1 } }]);
      expect(sentCommand()).to.have.property('writeConcern');
    });

    it('keeps a user-supplied session out of the index description', async function () {
      const session = client.startSession();
      try {
        await collection.createIndexes(
          [{ key: { i: 1 }, unique: true }],
          { session },
          { validateOptions: false }
        );

        expect(sentIndexes()).to.deep.equal([{ unique: true, name: 'i_1', key: { i: 1 } }]);
        expect(sentCommand()).to.have.property('lsid');
      } finally {
        await session.endSession();
      }
    });
  });
});
