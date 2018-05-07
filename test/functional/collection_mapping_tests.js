'use strict';
const ObjectID = require('bson').ObjectID;
const expect = require('chai').expect;
const setupDatabase = require('./shared').setupDatabase;

class User {
  constructor(doc) {
    doc = doc || {};

    this._id = doc._id || new ObjectID();
    this.firstName = doc.firstName;
    this.lastName = doc.lastName;
  }

  getFullName() {
    return `${this.firstName} ${this.lastName}`;
  }

  static map(doc) {
    return new User(doc);
  }

  static unmap(user) {
    return {
      _id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      internalField: true
    };
  }
}

describe('Collection Mapping', function() {
  before(function() {
    return setupDatabase(this.configuration);
  });

  it('should map find', {
    metadata: {
      requires: { topology: ['single'] }
    },

    // The actual test we wish to run
    test: function(done) {
      const configuration = this.configuration;
      const ObjectID = configuration.require.ObjectID;

      const client = configuration.newClient(configuration.writeConcernMax(), {
        poolSize: 1
      });

      client.connect(function(err, client) {
        expect(err).to.be.null;
        const db = client.db(configuration.db);

        const collection = db.collection('collection_mapping_find', {
          map: User.map
        });

        const docs = [
          {
            _id: new ObjectID(),
            firstName: 'John',
            lastName: 'Doe'
          },
          {
            _id: new ObjectID(),
            firstName: 'Mongo',
            lastName: 'DB'
          }
        ];

        collection.insertMany(docs, configuration.writeConcernMax(), function(err) {
          expect(err).to.be.null;

          collection
            .find({})
            .sort({ firstName: 1 })
            .toArray(function(err, users) {
              expect(err).to.be.null;
              expect(users[0]).to.be.an.instanceof(User);
              expect(users[0].firstName).to.equal('John');
              expect(users[0].lastName).to.equal('Doe');
              expect(users[0].getFullName()).to.equal('John Doe');
              client.close();
              done();
            });
        });
      });
    }
  });

  it('should map findOne', {
    metadata: {
      requires: { topology: ['single'] }
    },

    // The actual test we wish to run
    test: function(done) {
      const configuration = this.configuration;
      const ObjectID = configuration.require.ObjectID;

      const client = configuration.newClient(configuration.writeConcernMax(), {
        poolSize: 1
      });

      client.connect(function(err, client) {
        const db = client.db(configuration.db);
        expect(err).to.be.null;

        const collection = db.collection('collection_mapping_findOne', {
          map: User.map
        });

        const doc = {
          _id: new ObjectID(),
          firstName: 'John',
          lastName: 'Doe'
        };

        //insert new user
        collection.insertOne(doc, configuration.writeConcernMax(), function(err) {
          expect(err).to.be.null;

          collection.findOne({}, function(err, user) {
            expect(err).to.be.null;
            expect(user).to.be.an.instanceof(User);
            expect(user.getFullName()).to.equal('John Doe');
            client.close();
            done();
          });
        });
      });
    }
  });

  it('should map findAndModify commands', {
    metadata: {
      requires: { topology: ['single'] }
    },

    // The actual test we wish to run
    test: function(done) {
      const configuration = this.configuration;

      const client = configuration.newClient(configuration.writeConcernMax(), {
        poolSize: 1
      });

      client.connect(function(err, client) {
        const db = client.db(configuration.db);
        expect(err).to.be.null;

        const collection = db.collection('collection_mapping_findAndModify', {
          map: User.map
        });

        const doc = { firstName: 'John', lastName: 'Doe' };

        collection.insertOne(doc, configuration.writeConcernMax(), function(err) {
          expect(err).to.be.null;

          const opts = { upsert: true, returnOriginal: false };

          collection.findOneAndUpdate({}, { $set: { firstName: 'Johnny' } }, opts, function(
            err,
            result
          ) {
            expect(err).to.be.null;
            expect(result.value).to.be.an.instanceof(User);
            expect(result.value.getFullName()).to.equal('Johnny Doe');

            // Execute findOneAndReplace
            collection.findOneAndReplace(
              {},
              { firstName: 'Johnny Boy', lastName: 'Doey' },
              opts,
              function(err, result) {
                expect(err).to.be.null;
                expect(result.value).to.be.an.instanceof(User);
                expect(result.value.getFullName()).to.equal('Johnny Boy Doey');

                // Execute findOneAndReplace
                collection.findOneAndDelete({}, function(err, result) {
                  expect(err).to.be.null;
                  expect(result.value).to.be.an.instanceof(User);
                  expect(result.value.getFullName()).to.equal('Johnny Boy Doey');

                  client.close();
                  done();
                });
              }
            );
          });
        });
      });
    }
  });

  it('should unmap insertOne', {
    metadata: {
      requires: { topology: ['single'] }
    },

    // The actual test we wish to run
    test: function(done) {
      const configuration = this.configuration;

      const client = configuration.newClient(configuration.writeConcernMax(), {
        poolSize: 1
      });

      client.connect(function(err, client) {
        const db = client.db(configuration.db);
        expect(err).to.be.null;

        const collection = db.collection('collection_mapping_insertOne', {
          unmap: User.unmap
        });

        const user = new User();
        user.firstName = 'John';
        user.lastName = 'Doe';

        collection.insertOne(user, function(err) {
          expect(err).to.be.null;

          collection.findOne({}, function(err, doc) {
            expect(err).to.be.null;

            expect(doc).to.deep.equal({
              _id: user._id,
              firstName: 'John',
              lastName: 'Doe',
              internalField: true
            });

            client.close();
            done();
          });
        });
      });
    }
  });

  it('should unmap insertMany', {
    metadata: {
      requires: { topology: ['single'] }
    },

    // The actual test we wish to run
    test: function(done) {
      const configuration = this.configuration;

      const client = configuration.newClient(configuration.writeConcernMax(), {
        poolSize: 1
      });

      client.connect(function(err, client) {
        const db = client.db(configuration.db);
        expect(err).to.be.null;

        const collection = db.collection('collection_mapping_insertMany', {
          unmap: User.unmap
        });

        const daenerys = new User();
        daenerys.firstName = 'Daenerys';
        daenerys.lastName = 'Targaryen';

        const jon = new User();
        jon.firstName = 'Jon';
        jon.lastName = 'Snow';

        collection.insertMany([daenerys, jon], function(err) {
          expect(err).to.be.null;

          collection
            .find({})
            .sort({ firstName: 1 })
            .toArray(function(err, docs) {
              expect(err).to.be.null;

              expect(docs).to.deep.equal([
                {
                  _id: daenerys._id,
                  firstName: 'Daenerys',
                  lastName: 'Targaryen',
                  internalField: true
                },
                {
                  _id: jon._id,
                  firstName: 'Jon',
                  lastName: 'Snow',
                  internalField: true
                }
              ]);

              client.close();

              done();
            });
        });
      });
    }
  });

  it('should unmap replaceOne', {
    metadata: {
      requires: { topology: ['single'] }
    },

    // The actual test we wish to run
    test: function(done) {
      const configuration = this.configuration;

      const client = configuration.newClient(configuration.writeConcernMax(), {
        poolSize: 1
      });

      client.connect(function(err, client) {
        const db = client.db(configuration.db);
        expect(err).to.be.null;

        const collection = db.collection('collection_mapping_replaceOne', {
          unmap: User.unmap
        });

        const unmappedCollection = db.collection('collection_mapping_replaceOne');

        const doc = {
          _id: new ObjectID(),
          firstName: 'John',
          lastName: 'Doe'
        };

        unmappedCollection.insertOne(doc, function(err) {
          expect(err).to.be.null;

          const user = new User(doc);
          user.firstName = 'Johnny';
          user.lastName = 'Doey';

          collection.replaceOne({}, user, function(err) {
            expect(err).to.be.null;

            collection.findOne({}, function(err, doc) {
              expect(err).to.be.null;

              expect(doc).to.deep.equal({
                _id: user._id,
                firstName: 'Johnny',
                lastName: 'Doey',
                internalField: true
              });

              client.close();
              done();
            });
          });
        });
      });
    }
  });
});
