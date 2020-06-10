'use strict';
const withMonitoredClient = require('./shared').withMonitoredClient;
const setupDatabase = require('./shared').setupDatabase;
const expect = require('chai').expect;

describe('Find and Modify', function() {
  before(function() {
    return setupDatabase(this.configuration);
  });

  it('should pass through writeConcern to all findAndModify commands at command level', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: withMonitoredClient(['findAndModify'], function(client, events, done) {
      const configuration = this.configuration;
      const db = client.db(configuration.db);
      const writeConcern = { fsync: 1 };
      const collection = db.collection('findAndModifyTEST', writeConcern);
      return collection.findOneAndUpdate({}, { $set: { a: 1 } }, writeConcern, err => {
        expect(err).to.not.exist;
        console.log(events[0].command);
        expect(events[0].command.writeConcern).to.deep.equal(writeConcern);
        return collection.findOneAndReplace({}, { b: 1 }, writeConcern, err => {
          expect(err).to.not.exist;
          expect(events[1].command.writeConcern).to.deep.equal(writeConcern);
          return collection.findOneAndDelete({}, writeConcern, err => {
            expect(err).to.not.exist;
            expect(events[2].command.writeConcern).to.deep.equal(writeConcern);
            return done();
          });
        });
      });
    })
  });

  it('should pass through writeConcern to all findAndModify at collection level', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: withMonitoredClient(['findAndModify'], function(client, events, done) {
      const configuration = this.configuration;
      const db = client.db(configuration.db);
      const writeConcern = { fsync: 1 };
      const collection = db.collection('findAndModifyTEST', writeConcern);
      return collection.findOneAndUpdate({}, { $set: { a: 1 } }, err => {
        expect(err).to.not.exist;
        expect(events[0].command.writeConcern).to.deep.equal(writeConcern);
        return collection.findOneAndReplace({}, { b: 1 }, err => {
          expect(err).to.not.exist;
          expect(events[1].command.writeConcern).to.deep.equal(writeConcern);
          return collection.findOneAndDelete({}, err => {
            expect(err).to.not.exist;
            expect(events[2].command.writeConcern).to.deep.equal(writeConcern);
            return done();
          });
        });
      });
    })
  });

  it('should pass through writeConcern to all findAndModify at db level', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: withMonitoredClient(['findAndModify'], { queryOptions: { fsync: true } }, function(
      client,
      events,
      done
    ) {
      const configuration = this.configuration;
      const db = client.db(configuration.db);
      const writeConcern = { fsync: true };
      const collection = db.collection('findAndModifyTEST');
      return collection.findOneAndUpdate({}, { $set: { a: 1 } }, err => {
        expect(err).to.not.exist;
        expect(events[0].command.writeConcern).to.deep.equal(writeConcern);
        return collection.findOneAndReplace({}, { b: 1 }, err => {
          expect(err).to.not.exist;
          expect(events[1].command.writeConcern).to.deep.equal(writeConcern);
          return collection.findOneAndDelete({}, err => {
            expect(err).to.not.exist;
            expect(events[2].command.writeConcern).to.deep.equal(writeConcern);
            return done();
          });
        });
      });
    })
  });

  it.only('should allow all findAndModify commands with non-primary readPreference', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: 'replicaset' }
    },

    test: function(done) {
      const configuration = this.configuration;
      const client = configuration.newClient({ readPreference: 'secondary' }, { poolSize: 1 });
      client.connect((err, client) => {
        const db = client.db(configuration.db);
        expect(err).to.be.null;

        const collection = db.collection('findAndModifyTEST');
        // Execute findOneAndUpdate
        collection.findOneAndUpdate({}, { $set: { a: 1 } }, err => {
          expect(err).to.be.null;

          client.close(true, done);
        });
      });
    }
  });
});
