'use strict';
var test = require('./shared').assert;
var setupDatabase = require('./shared').setupDatabase;
const expect = require('chai').expect;
const { ReadPreference } = require('../..');

describe('ReadPreference', function() {
  before(function() {
    return setupDatabase(this.configuration);
  });

  describe('::constructor', function() {
    const maxStalenessSeconds = 1234;
    const { PRIMARY, SECONDARY, NEAREST } = ReadPreference;
    const TAGS = [{ loc: 'dc' }];

    it('should accept (mode)', function() {
      expect(new ReadPreference(PRIMARY)).to.be.an.instanceOf(ReadPreference);
    });

    it('should accept valid (mode, tags)', function() {
      expect(new ReadPreference(PRIMARY, [])).to.be.an.instanceOf(ReadPreference);
      const p0 = new ReadPreference(NEAREST, TAGS);
      expect(p0.mode).to.equal(NEAREST);
    });

    it('should not accept invalid tags', function() {
      expect(() => new ReadPreference(PRIMARY, 'invalid')).to.throw(
        'ReadPreference tags must be an array'
      );
      expect(() => new ReadPreference(PRIMARY, { loc: 'dc' }, { maxStalenessSeconds })).to.throw(
        'ReadPreference tags must be an array'
      );
    });

    it('should accept (mode, options)', function() {
      const p1 = new ReadPreference(SECONDARY, { maxStalenessSeconds });
      expect(p1.mode).to.equal(SECONDARY);
      expect(p1.maxStalenessSeconds).to.equal(maxStalenessSeconds);
    });

    it('should not accept mode=primary + tags', function() {
      expect(() => new ReadPreference(PRIMARY, TAGS)).to.throw(
        'Primary read preference cannot be combined with tags'
      );
    });

    it('should not accept mode=primary + options.maxStalenessSeconds', function() {
      expect(() => new ReadPreference(PRIMARY, null, { maxStalenessSeconds })).to.throw(
        'Primary read preference cannot be combined with maxStalenessSeconds'
      );
    });

    it('should accept (mode=secondary, tags=null, options)', function() {
      const p2 = new ReadPreference(SECONDARY, null, { maxStalenessSeconds });
      expect(p2).to.be.an.instanceOf(ReadPreference);
      expect(p2.mode).to.equal(SECONDARY);
      expect(p2.maxStalenessSeconds).to.equal(maxStalenessSeconds);
    });

    it('should accept (mode=secondary, tags, options)', function() {
      const p3 = new ReadPreference(SECONDARY, TAGS, { maxStalenessSeconds });
      expect(p3).to.be.an.instanceOf(ReadPreference);
      expect(p3.mode).to.equal(SECONDARY);
      expect(p3.tags).to.eql(TAGS);
      expect(p3.maxStalenessSeconds).to.equal(maxStalenessSeconds);
    });

    it('should not accept (mode, options, tags)', function() {
      expect(() => new ReadPreference(PRIMARY, { maxStalenessSeconds }, TAGS)).to.throw(
        'ReadPreference tags must be an array'
      );
    });
  });

  it('Should correctly apply collection level read Preference to count', {
    metadata: { requires: { mongodb: '>=2.6.0', topology: ['single', 'ssl'] } },

    test: function(done) {
      var configuration = this.configuration;
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

          client.close(done);
        });
      });
    }
  });

  it('Should correctly apply collection level read Preference to group', {
    metadata: { requires: { mongodb: '>=2.6.0,<=4.0.x', topology: ['single', 'ssl'] } },

    test: function(done) {
      var configuration = this.configuration;
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

          client.close(done);
        });
      });
    }
  });

  it('Should correctly apply collection level read Preference to mapReduce', {
    metadata: { requires: { mongodb: '>=2.6.0', topology: ['single', 'ssl'] } },

    test: function(done) {
      var configuration = this.configuration;
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

          client.close(done);
        });
      });
    }
  });

  it(
    'Should correctly apply collection level read Preference to mapReduce backward compatibility',
    {
      metadata: { requires: { mongodb: '>=2.6.0', topology: ['single', 'ssl'] } },

      test: function(done) {
        var configuration = this.configuration;
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
            client.close(done);
          });
        });
      }
    }
  );

  it('Should fail due to not using mapReduce inline with read preference', {
    metadata: { requires: { mongodb: '>=2.6.0', topology: ['single', 'ssl'] } },

    test: function(done) {
      var configuration = this.configuration;
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
          client.close(done);
        });
      });
    }
  });

  it('Should correctly apply collection level read Preference to aggregate', {
    metadata: { requires: { mongodb: '>=2.6.0', topology: ['single', 'ssl'] } },

    test: function(done) {
      var configuration = this.configuration;
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

        const cursor = collection.aggregate([
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
        ]);

        cursor.toArray(function(err) {
          test.equal(null, err);
          client.topology.command = command;

          client.close(done);
        });
      });
    }
  });

  it('Should correctly apply collection level read Preference to stats', {
    metadata: { requires: { mongodb: '>=2.6.0', topology: ['single', 'ssl'] } },

    test: function(done) {
      var configuration = this.configuration;
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
          client.close(done);
        });
      });
    }
  });

  it('Should correctly honor the readPreferences at DB and individual command level', {
    metadata: { requires: { mongodb: '>=2.6.0', topology: ['single', 'ssl'] } },

    test: function(done) {
      var configuration = this.configuration;
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
            client.close(done);
          });
        });
      });
    }
  });

  it('Should correctly apply readPreferences specified as objects', {
    metadata: { requires: { mongodb: '>=2.6.0', topology: ['single', 'ssl'] } },

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
          client.close(done);
        });
      });
    }
  });

  it('Should correctly pass readPreferences specified as objects to cursors', {
    metadata: { requires: { mongodb: '>=2.6.0', topology: ['single', 'ssl'] } },

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
          client.close(done);
        });
      });
    }
  });

  it('Should correctly pass readPreferences specified as objects to collection methods', {
    metadata: { requires: { mongodb: '>=2.6.0', topology: ['single', 'ssl'] } },

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
          client.close(done);
        });
      });
    }
  });

  it('Should correctly pass readPreferences on the Collection to listIndexes', {
    metadata: { requires: { mongodb: '>=2.6.0', topology: ['single', 'ssl'] } },

    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        test.equal(null, err);
        var cursor = db
          .collection('test', { readPreference: ReadPreference.SECONDARY_PREFERRED })
          .listIndexes();
        test.equal(cursor.options.readPreference.mode, 'secondaryPreferred');
        client.close(done);
      });
    }
  });

  it('Should throw an error on an invalid readPreference', function(done) {
    const configuration = this.configuration;

    const client = configuration.newClient();
    client.connect((err, client) => {
      const db = client.db(configuration.db);
      expect(db.collection.bind(db, 'test', { readPreference: 'invalid' })).to.throw(
        'Invalid read preference mode invalid'
      );

      client.close(done);
    });
  });
});
