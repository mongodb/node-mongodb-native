import { expect } from 'chai';

import { type MongoClient, ReadConcernLevel } from '../../../src';
import { filterForCommands, setupDatabase } from '../shared';

describe('ReadConcern', function () {
  let client: MongoClient;

  before(function () {
    return setupDatabase(this.configuration);
  });

  afterEach(() => client.close());

  function validateTestResults(started, succeeded, commandName, level) {
    expect(started.length).to.equal(succeeded.length);
    for (let i = 0; i < started.length; i++) {
      expect(started[i]).to.have.property('commandName', commandName);
      expect(succeeded[i]).to.have.property('commandName', commandName);
      if (level != null) {
        expect(started[i].command.readConcern.level).to.equal(level);
      } else {
        expect(started[i].command.readConcern).to.be.undefined;
      }
    }
  }

  const tests = [
    {
      description: 'Should set local readConcern on db level when using collection method',
      commandName: 'find',
      readConcern: { level: ReadConcernLevel.local }
    },
    {
      description: 'Should set majority readConcern on db level',
      commandName: 'find',
      readConcern: { level: ReadConcernLevel.majority }
    },
    {
      description: 'Should set majority readConcern aggregate command',
      commandName: 'aggregate',
      readConcern: { level: ReadConcernLevel.majority }
    },
    {
      description: 'Should set local readConcern at collection level',
      commandName: 'find',
      readConcern: { level: ReadConcernLevel.local }
    },
    {
      description: 'Should set majority readConcern at collection level',
      commandName: 'find',
      readConcern: { level: ReadConcernLevel.majority }
    }
  ];

  tests.forEach(test => {
    it(test.description, {
      metadata: { requires: { topology: 'replicaset', mongodb: '>= 3.2' } },

      test: async function () {
        const started = [];
        const succeeded = [];
        // Get a new instance
        const configuration = this.configuration;
        client = configuration.newClient(
          { w: 1 },
          { maxPoolSize: 1, readConcern: test.readConcern, monitorCommands: true }
        );

        await client.connect();

        const db = client.db(configuration.db);
        expect(db.readConcern).to.deep.equal(test.readConcern);

        // Get a collection
        const collection = db.collection('readConcernCollection');

        // Validate readConcern
        expect(collection.readConcern).to.deep.equal(test.readConcern);

        // commandMonitoring
        client.on('commandStarted', filterForCommands(test.commandName, started));
        client.on('commandSucceeded', filterForCommands(test.commandName, succeeded));

        // Execute find
        if (test.commandName === 'find') {
          await collection.find().toArray();
          validateTestResults(started, succeeded, test.commandName, test.readConcern.level);
        } else if (test.commandName === 'aggregate') {
          await collection.aggregate([{ $match: {} }]).toArray();
          validateTestResults(started, succeeded, test.commandName, test.readConcern.level);
        }
      }
    });
  });

  describe('client-url specific ReadConcern', function () {
    const urlTests = [
      {
        description: 'Should set local readConcern using MongoClient',
        urlReadConcernLevel: 'readConcernLevel=local',
        readConcern: { level: ReadConcernLevel.local }
      },
      {
        description: 'Should set majority readConcern using MongoClient',
        urlReadConcernLevel: 'readConcernLevel=majority',
        readConcern: { level: ReadConcernLevel.majority }
      },
      {
        description: 'Should set majority readConcern using MongoClient with options',
        readConcern: { level: ReadConcernLevel.majority }
      }
    ];

    urlTests.forEach(test => {
      it(test.description, {
        metadata: { requires: { topology: 'replicaset', mongodb: '>= 3.2' } },
        test: async function () {
          const started = [];
          const succeeded = [];
          // Get a new instance
          const configuration = this.configuration;

          let url = configuration.url();
          if (test.urlReadConcernLevel != null) {
            url =
              url.indexOf('?') !== -1
                ? `${url}&${test.urlReadConcernLevel}`
                : `${url}?${test.urlReadConcernLevel}`;
            client = configuration.newClient(url, { monitorCommands: true });
          } else {
            client = configuration.newClient(url, {
              readConcern: test.readConcern,
              monitorCommands: true
            });
          }

          await client.connect();

          const db = client.db(configuration.db);
          expect(db.readConcern).to.deep.equal(test.readConcern);

          // Get a collection
          const collection = db.collection('readConcernCollection');

          // Validate readConcern
          expect(collection.readConcern).to.deep.equal(test.readConcern);

          // commandMonitoring
          client.on('commandStarted', filterForCommands('find', started));
          client.on('commandSucceeded', filterForCommands('find', succeeded));

          // Execute find
          await collection.find().toArray();
          validateTestResults(started, succeeded, 'find', test.readConcern.level);
        }
      });
    });
  });

  const insertTests = [
    {
      description: 'Should set majority readConcern distinct command',
      commandName: 'distinct',
      mongodbVersion: '>= 3.2',
      readConcern: { level: ReadConcernLevel.majority }
    },
    {
      description: 'Should set majority readConcern count command',
      commandName: 'count',
      mongodbVersion: '>= 3.2',
      readConcern: { level: ReadConcernLevel.majority }
    }
  ];

  insertTests.forEach(test => {
    it(test.description, {
      metadata: { requires: { topology: 'replicaset', mongodb: test.mongodbVersion } },

      test: async function () {
        const started = [];
        const succeeded = [];
        // Get a new instance
        const configuration = this.configuration;
        client = configuration.newClient(
          { w: 1 },
          { maxPoolSize: 1, readConcern: test.readConcern, monitorCommands: true }
        );

        await client.connect();

        const db = client.db(configuration.db);
        expect(db.readConcern).to.deep.equal(test.readConcern);

        // Get the collection
        const collection = db.collection('readConcernCollection');

        // Insert documents to perform distinct against
        await collection.insertMany(
          [
            { a: 0, b: { c: 'a' } },
            { a: 1, b: { c: 'b' } },
            { a: 1, b: { c: 'c' } },
            { a: 2, b: { c: 'a' } },
            { a: 3 },
            { a: 3 }
          ],
          configuration.writeConcernMax()
        );

        // Listen to apm events
        client.on('commandStarted', filterForCommands(test.commandName, started));
        client.on('commandSucceeded', filterForCommands(test.commandName, succeeded));

        // Perform a distinct query against the a field
        if (test.commandName === 'distinct') {
          await collection.distinct('a');
          validateTestResults(started, succeeded, test.commandName, test.readConcern.level);
        } else if (test.commandName === 'count') {
          await collection.estimatedDocumentCount();
          validateTestResults(started, succeeded, test.commandName, test.readConcern.level);
        }
      }
    });
  });

  it('Should set majority readConcern aggregate command against server >= 4.1', {
    metadata: { requires: { topology: 'replicaset' } },

    test: async function () {
      const started = [];
      const succeeded = [];
      // Get a new instance
      const configuration = this.configuration;
      client = configuration.newClient(
        { w: 1 },
        { maxPoolSize: 1, readConcern: { level: 'majority' }, monitorCommands: true }
      );

      await client.connect();
      // Get a collection
      const collection = client.db(configuration.db).collection('readConcernCollectionAggregate1');

      // Listen to apm events
      client.on('commandStarted', filterForCommands('aggregate', started));
      client.on('commandSucceeded', filterForCommands('aggregate', succeeded));

      // Execute find
      await collection
        .aggregate([{ $match: {} }, { $out: 'readConcernCollectionAggregate1Output' }])
        .toArray();

      validateTestResults(started, succeeded, 'aggregate', 'majority');

      // Execute find
      await collection
        .aggregate([{ $match: {} }], { out: 'readConcernCollectionAggregate2Output' })
        .toArray();
      validateTestResults(started, succeeded, 'aggregate', 'majority');
    }
  });

  it('Should set local readConcern on db level when using createCollection method', {
    metadata: { requires: { topology: 'replicaset', mongodb: '>= 3.2' } },

    test: async function () {
      // Get a new instance
      const configuration = this.configuration;
      client = configuration.newClient(
        { w: 1 },
        { maxPoolSize: 1, readConcern: { level: 'local' } }
      );
      await client.connect();
      const db = client.db(configuration.db);
      expect(db.readConcern).to.deep.equal({ level: 'local' });

      // Get a collection using createCollection
      const collection = await db.createCollection('readConcernCollection_createCollection');
      // Validate readConcern
      expect(collection.readConcern).to.deep.equal({ level: 'local' });
    }
  });
});
