'use strict';
var test = require('./shared').assert;
var setupDatabase = require('./shared').setupDatabase;

describe('ReadPreference', function() {
  before(function() {
    return setupDatabase(this.configuration);
  });

  /**
   * @ignore
   */
  it('Should correctly apply collection level read Preference to count', {
    metadata: { requires: { mongodb: '>=2.6.0', topology: ['single', 'ssl'] } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var mongo = configuration.require,
        ReadPreference = mongo.ReadPreference;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        test.equal(null, err);
        // Set read preference
        var collection = db.collection('read_pref_1', {
          readPreference: ReadPreference.SECONDARY_PREFERRED
        });
        // Save checkout function
        var command = client.topology.command;
        // Set up our checker method
        client.topology.command = function() {
          var args = Array.prototype.slice.call(arguments, 0);
          if (args[0] === 'integration_tests.$cmd') {
            test.equal(ReadPreference.SECONDARY_PREFERRED, args[2].readPreference.mode);
          }

          return command.apply(db.serverConfig, args);
        };

        // Execute count
        collection.count(function(err) {
          test.equal(null, err);
          client.topology.command = command;

          client.close();
          done();
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('Should correctly apply collection level read Preference to group', {
    metadata: { requires: { mongodb: '>=2.6.0,<=4.0.x', topology: ['single', 'ssl'] } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var mongo = configuration.require,
        ReadPreference = mongo.ReadPreference;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        test.equal(null, err);
        // Set read preference
        var collection = db.collection('read_pref_1', {
          readPreference: ReadPreference.SECONDARY_PREFERRED
        });

        // Save checkout function
        var command = client.topology.command;
        // Set up our checker method
        client.topology.command = function() {
          var args = Array.prototype.slice.call(arguments, 0);
          if (args[0] === 'integration_tests.$cmd') {
            test.equal(ReadPreference.SECONDARY_PREFERRED, args[2].readPreference.mode);
          }

          return command.apply(db.serverConfig, args);
        };

        // Execute count
        collection.group([], {}, { count: 0 }, 'function (obj, prev) { prev.count++; }', function(
          err
        ) {
          test.equal(null, err);
          client.topology.command = command;

          client.close();
          done();
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('Should correctly apply collection level read Preference to geoHaystackSearch', {
    metadata: { requires: { mongodb: '>=2.6.0', topology: ['single', 'ssl'] } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var mongo = configuration.require,
        ReadPreference = mongo.ReadPreference;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        test.equal(null, err);
        // Set read preference
        var collection = db.collection('read_pref_1', {
          readPreference: ReadPreference.SECONDARY_PREFERRED
        });
        // Save checkout function
        var command = client.topology.command;
        // Set up our checker method
        client.topology.command = function() {
          var args = Array.prototype.slice.call(arguments, 0);
          if (args[0] === 'integration_tests.$cmd') {
            test.equal(ReadPreference.SECONDARY_PREFERRED, args[2].readPreference.mode);
          }

          return command.apply(db.serverConfig, args);
        };

        // Execute count
        collection.geoHaystackSearch(
          50,
          50,
          { search: { a: 1 }, limit: 1, maxDistance: 100 },
          function(/* err */) {
            // test.equal(null, err);
            client.topology.command = command;
            client.close();
            done();
          }
        );
      });
    }
  });

  /**
   * @ignore
   */
  it('Should correctly apply collection level read Preference to mapReduce', {
    metadata: { requires: { mongodb: '>=2.6.0', topology: ['single', 'ssl'] } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var mongo = configuration.require,
        ReadPreference = mongo.ReadPreference;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        test.equal(null, err);
        // Set read preference
        var collection = db.collection('read_pref_1', {
          readPreference: ReadPreference.SECONDARY_PREFERRED
        });
        // Save checkout function
        var command = client.topology.command;
        // Set up our checker method
        client.topology.command = function() {
          var args = Array.prototype.slice.call(arguments, 0);
          if (args[0] === 'integration_tests.$cmd') {
            test.equal(ReadPreference.SECONDARY_PREFERRED, args[2].readPreference.mode);
          }

          return command.apply(db.serverConfig, args);
        };

        // Map function
        var map = function() {
          emit(this.user_id, 1); // eslint-disable-line
        };
        // Reduce function
        var reduce = function(/* k, vals */) {
          return 1;
        };

        // Perform the map reduce
        collection.mapReduce(map, reduce, { out: { inline: 1 } }, function(/* err */) {
          // test.equal(null, err);

          // eslint-disable-line
          client.topology.command = command;

          client.close();
          done();
        });
      });
    }
  });

  /**
   * @ignore
   */
  it(
    'Should correctly apply collection level read Preference to mapReduce backward compatibility',
    {
      metadata: { requires: { mongodb: '>=2.6.0', topology: ['single', 'ssl'] } },

      // The actual test we wish to run
      test: function(done) {
        var configuration = this.configuration;
        var mongo = configuration.require,
          ReadPreference = mongo.ReadPreference;

        var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
        client.connect(function(err, client) {
          var db = client.db(configuration.db);
          test.equal(null, err);
          // Set read preference
          var collection = db.collection('read_pref_1', {
            readPreference: ReadPreference.SECONDARY_PREFERRED
          });
          // Save checkout function
          var command = client.topology.command;
          // Set up our checker method
          client.topology.command = function() {
            var args = Array.prototype.slice.call(arguments, 0);
            if (args[0] === 'integration_tests.$cmd') {
              test.equal(ReadPreference.SECONDARY_PREFERRED, args[2].readPreference.mode);
            }

            return command.apply(db.serverConfig, args);
          };

          // Map function
          var map = function() {
            emit(this.user_id, 1); // eslint-disable-line
          };

          // Reduce function
          var reduce = function(/* k, vals */) {
            return 1;
          };

          // Perform the map reduce
          collection.mapReduce(map, reduce, { out: 'inline' }, function(/* err */) {
            // test.equal(null, err);
            client.topology.command = command;
            client.close();
            done();
          });
        });
      }
    }
  );

  /**
   * @ignore
   */
  it('Should fail due to not using mapreduce inline with read preference', {
    metadata: { requires: { mongodb: '>=2.6.0', topology: ['single', 'ssl'] } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var mongo = configuration.require,
        ReadPreference = mongo.ReadPreference;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        test.equal(null, err);
        // Set read preference
        var collection = db.collection('read_pref_1', {
          readPreference: ReadPreference.SECONDARY_PREFERRED
        });
        // Map function
        var map = function() {
          emit(this.user_id, 1); // eslint-disable-line
        };

        // Reduce function
        var reduce = function(/* k, vals */) {
          return 1;
        };

        // Perform the map reduce
        collection.mapReduce(map, reduce, { out: { append: 'test' } }, function(err) {
          test.notEqual(err, null);
          client.close();
          done();
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('Should correctly apply collection level read Preference to aggregate', {
    metadata: { requires: { mongodb: '>=2.6.0', topology: ['single', 'ssl'] } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var mongo = configuration.require,
        ReadPreference = mongo.ReadPreference;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        test.equal(null, err);
        // Set read preference
        var collection = db.collection('read_pref_1', {
          readPreference: ReadPreference.SECONDARY_PREFERRED
        });
        // Save checkout function
        var command = client.topology.command;
        // Set up our checker method
        client.topology.command = function() {
          var args = Array.prototype.slice.call(arguments, 0);
          if (args[0] === 'integration_tests.$cmd') {
            test.equal(ReadPreference.SECONDARY_PREFERRED, args[2].readPreference.mode);
          }

          return command.apply(db.serverConfig, args);
        };

        collection.aggregate(
          [
            {
              $project: {
                author: 1,
                tags: 1
              }
            },
            { $unwind: '$tags' },
            {
              $group: {
                _id: { tags: '$tags' },
                authors: { $addToSet: '$author' }
              }
            }
          ],
          function(err, cursor) {
            test.equal(null, err);

            cursor.toArray(function(err) {
              test.equal(null, err);
              client.topology.command = command;

              client.close();
              done();
            });
          }
        );
      });
    }
  });

  /**
   * @ignore
   */
  it('Should correctly apply collection level read Preference to stats', {
    metadata: { requires: { mongodb: '>=2.6.0', topology: ['single', 'ssl'] } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var mongo = configuration.require,
        ReadPreference = mongo.ReadPreference;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        test.equal(null, err);
        // Set read preference
        var collection = db.collection('read_pref_1', {
          readPreference: ReadPreference.SECONDARY_PREFERRED
        });
        // Save checkout function
        var command = client.topology.command;
        // Set up our checker method
        client.topology.command = function() {
          var args = Array.prototype.slice.call(arguments, 0);
          if (args[0] === 'integration_tests.$cmd') {
            test.equal(ReadPreference.SECONDARY_PREFERRED, args[2].readPreference.mode);
          }

          return command.apply(db.serverConfig, args);
        };

        // Perform the map reduce
        collection.stats(function(/* err */) {
          // test.equal(null, err);
          client.topology.command = command;
          client.close();
          done();
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('Should correctly honor the readPreferences at DB and individual command level', {
    metadata: { requires: { mongodb: '>=2.6.0', topology: ['single', 'ssl'] } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var mongo = configuration.require,
        ReadPreference = mongo.ReadPreference;

      var client = configuration.newClient({ w: 1, readPreference: 'secondary' }, { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        // Save checkout function
        var command = client.topology.command;
        // Set up our checker method
        client.topology.command = function() {
          var args = Array.prototype.slice.call(arguments, 0);
          if (args[0] === 'integration_tests.$cmd') {
            test.equal(ReadPreference.SECONDARY, args[2].readPreference.mode);
          }

          return command.apply(db.serverConfig, args);
        };

        db.command({ dbStats: true }, function(err) {
          test.equal(null, err);

          client.topology.command = function() {
            var args = Array.prototype.slice.call(arguments, 0);
            if (args[0] === 'integration_tests.$cmd') {
              test.equal(ReadPreference.SECONDARY_PREFERRED, args[2].readPreference.mode);
            }

            return command.apply(db.serverConfig, args);
          };

          db.command({ dbStats: true }, { readPreference: 'secondaryPreferred' }, function(err) {
            test.equal(null, err);
            client.topology.command = command;
            client.close();
            done();
          });
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('Should correctly apply readPreferences specified as objects', {
    metadata: { requires: { mongodb: '>=2.6.0', topology: ['single', 'ssl'] } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        test.equal(null, err);
        // Create read preference object.
        var mySecondaryPreferred = { mode: 'secondaryPreferred', tags: [] };
        db.command({ dbStats: true }, { readPreference: mySecondaryPreferred }, function(err) {
          test.equal(null, err);
          client.close();
          done();
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('Should correctly pass readPreferences specified as objects to cursors', {
    metadata: { requires: { mongodb: '>=2.6.0', topology: ['single', 'ssl'] } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        test.equal(null, err);
        // Create read preference object.
        var mySecondaryPreferred = { mode: 'secondaryPreferred', tags: [] };
        db.listCollections({}, { readPreference: mySecondaryPreferred }).toArray(function(err) {
          test.equal(null, err);
          client.close();
          done();
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('Should correctly pass readPreferences specified as objects to collection methods', {
    metadata: { requires: { mongodb: '>=2.6.0', topology: ['single', 'ssl'] } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        test.equal(null, err);
        // Create read preference object.
        var mySecondaryPreferred = { mode: 'secondaryPreferred', tags: [] };
        var cursor = db.collection('test').find({}, { readPreference: mySecondaryPreferred });
        cursor.toArray(function(err) {
          test.equal(null, err);
          client.close();
          done();
        });
      });
    }
  });

  it('Should correctly pass readPreferences on the Collection to listIndexes', {
    metadata: { requires: { mongodb: '>=2.6.0', topology: ['single', 'ssl'] } },

    test: function(done) {
      var configuration = this.configuration;
      var mongo = configuration.require,
        SecondaryPreferred = mongo.ReadPreference.SECONDARY_PREFERRED;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        test.equal(null, err);
        var cursor = db.collection('test', { readPreference: SecondaryPreferred }).listIndexes();
        test.equal(cursor.s.options.readPreference.mode, 'secondaryPreferred');
        client.close();
        done();
      });
    }
  });
});
