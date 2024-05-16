'use strict';
const { setupDatabase, filterForCommands } = require('../shared');
const expect = require('chai').expect;

describe('ReadConcern', function () {
  let client;

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
      readConcern: { level: 'local' }
    },
    {
      description: 'Should set majority readConcern on db level',
      commandName: 'find',
      readConcern: { level: 'majority' }
    },
    {
      description: 'Should set majority readConcern aggregate command',
      commandName: 'aggregate',
      readConcern: { level: 'majority' }
    },
    {
      description: 'Should set local readConcern at collection level',
      commandName: 'find',
      readConcern: { level: 'local' }
    },
    {
      description: 'Should set majority readConcern at collection level',
      commandName: 'find',
      readConcern: { level: 'majority' }
    }
  ];
  tests.forEach(test => {
    it(
      test.description,
      { requires: { topology: 'replicaset', mongodb: '>= 3.2' } },
      function (done) {
        const started = [];
        const succeeded = [];
        // Get a new instance
        const configuration = this.configuration;
        client = configuration.newClient(
          { w: 1 },
          { maxPoolSize: 1, readConcern: test.readConcern, monitorCommands: true }
        );
        client.connect((err, client) => {
          expect(err).to.not.exist;
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
            collection.find().toArray(err => {
              expect(err).to.not.exist;
              validateTestResults(started, succeeded, test.commandName, test.readConcern.level);
              done();
            });
          } else if (test.commandName === 'aggregate') {
            collection.aggregate([{ $match: {} }]).toArray(err => {
              expect(err).to.not.exist;
              validateTestResults(started, succeeded, test.commandName, test.readConcern.level);
              done();
            });
          }
        });
      }
    );
  });

  describe('client-url specific ReadConcern', function () {
    const urlTests = [
      {
        description: 'Should set local readConcern using MongoClient',
        urlReadConcernLevel: 'readConcernLevel=local',
        readConcern: { level: 'local' }
      },
      {
        description: 'Should set majority readConcern using MongoClient',
        urlReadConcernLevel: 'readConcernLevel=majority',
        readConcern: { level: 'majority' }
      },
      {
        description: 'Should set majority readConcern using MongoClient with options',
        readConcern: { level: 'majority' }
      }
    ];
    urlTests.forEach(test => {
      it(
        test.description,
        { requires: { topology: 'replicaset', mongodb: '>= 3.2' } },
        function (done) {
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
          client.connect((err, client) => {
            expect(err).to.not.exist;
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
            collection.find().toArray(err => {
              expect(err).to.not.exist;
              validateTestResults(started, succeeded, 'find', test.readConcern.level);
              done();
            });
          });
        }
      );
    });
  });
  const insertTests = [
    {
      description: 'Should set majority readConcern distinct command',
      commandName: 'distinct',
      mongodbVersion: '>= 3.2',
      readConcern: { level: 'majority' }
    },
    {
      description: 'Should set majority readConcern count command',
      commandName: 'count',
      mongodbVersion: '>= 3.2',
      readConcern: { level: 'majority' }
    }
  ];
  insertTests.forEach(test => {
    it(
      test.description,
      { requires: { topology: 'replicaset', mongodb: test.mongodbVersion } },
      function (done) {
        const started = [];
        const succeeded = [];
        // Get a new instance
        const configuration = this.configuration;
        client = configuration.newClient(
          { w: 1 },
          { maxPoolSize: 1, readConcern: test.readConcern, monitorCommands: true }
        );
        client.connect((err, client) => {
          expect(err).to.not.exist;
          const db = client.db(configuration.db);
          expect(db.readConcern).to.deep.equal(test.readConcern);
          // Get the collection
          const collection = db.collection('readConcernCollection');
          // Insert documents to perform distinct against
          collection.insertMany(
            [
              { a: 0, b: { c: 'a' } },
              { a: 1, b: { c: 'b' } },
              { a: 1, b: { c: 'c' } },
              { a: 2, b: { c: 'a' } },
              { a: 3 },
              { a: 3 }
            ],
            configuration.writeConcernMax(),
            err => {
              expect(err).to.not.exist;
              // Listen to apm events
              client.on('commandStarted', filterForCommands(test.commandName, started));
              client.on('commandSucceeded', filterForCommands(test.commandName, succeeded));
              // Perform a distinct query against the a field
              if (test.commandName === 'distinct') {
                collection.distinct('a', err => {
                  expect(err).to.not.exist;
                  validateTestResults(started, succeeded, test.commandName, test.readConcern.level);
                  done();
                });
              } else if (test.commandName === 'count') {
                collection.estimatedDocumentCount(err => {
                  expect(err).to.not.exist;
                  validateTestResults(started, succeeded, test.commandName, test.readConcern.level);
                  done();
                });
              }
            }
          );
        });
      }
    );
  });

  it(
    'Should set majority readConcern aggregate command but ignore due to out',
    { requires: { topology: 'replicaset', mongodb: '>= 3.2 < 4.1' } },
    function (done) {
      const started = [];
      const succeeded = [];
      // Get a new instance
      const configuration = this.configuration;
      client = configuration.newClient(
        { w: 1 },
        { maxPoolSize: 1, readConcern: { level: 'majority' }, monitorCommands: true }
      );
      client.connect((err, client) => {
        expect(err).to.not.exist;
        const db = client.db(configuration.db);
        expect(db.readConcern).to.deep.equal({ level: 'majority' });
        // Get a collection
        const collection = db.collection('readConcernCollectionAggregate1');
        // Validate readConcern
        expect(collection.readConcern).to.deep.equal({ level: 'majority' });
        // Listen to apm events
        client.on('commandStarted', filterForCommands('aggregate', started));
        client.on('commandSucceeded', filterForCommands('aggregate', succeeded));
        // Execute find
        collection
          .aggregate([{ $match: {} }, { $out: 'readConcernCollectionAggregate1Output' }])
          .toArray(err => {
            expect(err).to.not.exist;
            validateTestResults(started, succeeded, 'aggregate');
            // Execute find
            collection
              .aggregate([{ $match: {} }], { out: 'readConcernCollectionAggregate2Output' })
              .toArray(err => {
                expect(err).to.not.exist;
                validateTestResults(started, succeeded, 'aggregate');
                done();
              });
          });
      });
    }
  );

  it(
    'Should set majority readConcern aggregate command against server >= 4.1',
    { requires: { topology: 'replicaset', mongodb: '>= 4.1' } },
    function (done) {
      const started = [];
      const succeeded = [];
      // Get a new instance
      const configuration = this.configuration;
      client = configuration.newClient(
        { w: 1 },
        { maxPoolSize: 1, readConcern: { level: 'majority' }, monitorCommands: true }
      );
      client
        .connect()
        .then(() => {
          // Get a collection
          const collection = client
            .db(configuration.db)
            .collection('readConcernCollectionAggregate1');
          // Listen to apm events
          client.on('commandStarted', filterForCommands('aggregate', started));
          client.on('commandSucceeded', filterForCommands('aggregate', succeeded));
          // Execute find
          return collection
            .aggregate([{ $match: {} }, { $out: 'readConcernCollectionAggregate1Output' }])
            .toArray()
            .then(() => {
              validateTestResults(started, succeeded, 'aggregate', 'majority');
              // Execute find
              return collection
                .aggregate([{ $match: {} }], { out: 'readConcernCollectionAggregate2Output' })
                .toArray()
                .then(() => {
                  validateTestResults(started, succeeded, 'aggregate', 'majority');
                });
            });
        })
        .then(
          () => client.close(done),
          e => client.close(() => done(e))
        );
    }
  );

  it(
    'Should set local readConcern on db level when using createCollection method',
    { requires: { topology: 'replicaset', mongodb: '>= 3.2' } },
    function (done) {
      // Get a new instance
      const configuration = this.configuration;
      client = configuration.newClient(
        { w: 1 },
        { maxPoolSize: 1, readConcern: { level: 'local' } }
      );
      client.connect((err, client) => {
        expect(err).to.not.exist;
        const db = client.db(configuration.db);
        expect(db.readConcern).to.deep.equal({ level: 'local' });
        // Get a collection using createCollection
        db.createCollection('readConcernCollection_createCollection', (err, collection) => {
          expect(err).to.not.exist;
          // Validate readConcern
          expect(collection.readConcern).to.deep.equal({ level: 'local' });
          done();
        });
      });
    }
  );
});
