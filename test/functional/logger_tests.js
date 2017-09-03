'use strict';
var expect = require('chai').expect;
var connectToDb = require('./shared').connectToDb;

describe('Logger', function() {
  /**
   * Test a simple find
   * @ignore
   */
  it('should correctly Enable logging', {
    metadata: { requires: { topology: ['single'] } },

    // The actual test we wish to run
    test: function(done) {
      var self = this;
      var Logger = self.configuration.require.Logger;
      var client = self.configuration.newClient(self.configuration.writeConcernMax(), {
        poolSize: 1
      });

      client.connect(function(err, client) {
        var db = client.db(self.configuration.db);
        expect(err).to.not.exist;

        // Logging setup
        Logger.setLevel('debug');
        Logger.filter('class', ['Db']);

        // Status
        var logged = false;

        // Logger.
        Logger.setCurrentLogger(function(msg, context) {
          expect(msg).to.exist;
          expect(context.type).to.equal('debug');
          expect(context.className).to.equal('Db');
          logged = true;
        });

        // Execute the command
        db.command({ ismaster: true }, function(err) {
          expect(err).to.not.exist;
          expect(logged).to.be.true;

          // Clean up
          Logger.reset();
          client.close();
          done();
        });
      });
    }
  });

  /**
   * Should No fail with undefined id
   * @ignore
   */
  it('should not fail with undefined id', {
    metadata: { requires: { topology: ['single'] } },

    // The actual test we wish to run
    test: function(done) {
      var self = this,
        Logger = self.configuration.require.Logger;

      // set a custom logger per http://mongodb.github.io/node-mongodb-native/2.0/tutorials/logging/
      Logger.setCurrentLogger(function() {});
      Logger.setLevel('debug');

      connectToDb('mongodb://localhost:27017/test', self.configuration.db, function(
        err,
        db,
        client
      ) {
        expect(err).to.not.exist;

        // perform any operation that gets logged
        db.collection('foo').findOne({}, function(err) {
          expect(err).to.not.exist;

          // Clean up
          Logger.reset();
          client.close();
          done();
        });
      });
    }
  });

  /**
   * Should No fail with undefined id
   * @ignore
   */
  it('should correctly log cursor', {
    metadata: { requires: { topology: ['single'] } },

    // The actual test we wish to run
    test: function(done) {
      var self = this,
        Logger = self.configuration.require.Logger;

      connectToDb('mongodb://localhost:27017/test', self.configuration.db, function(
        err,
        db,
        client
      ) {
        expect(err).to.not.exist;

        // Status
        var logged = false;

        // Set the current logger
        Logger.setCurrentLogger(function(msg, context) {
          expect(msg).to.exist;
          expect(context.type).to.equal('debug');
          expect(context.className).to.equal('Cursor');
          logged = true;
        });

        // Set the filter
        Logger.setLevel('debug');
        Logger.filter('class', ['Cursor']);

        // perform any operation that gets logged
        db
          .collection('logging')
          .find()
          .toArray(function(err) {
            expect(err).to.not.exist;
            expect(logged).to.be.true;

            // Clean up
            Logger.reset();
            client.close();
            done();
          });
      });
    }
  });

  /**
   * Should No fail with undefined id
   * @ignore
   */
  it('should pass the logLevel down through the options', {
    metadata: { requires: { topology: ['single'] } },

    // The actual test we wish to run
    test: function(done) {
      var self = this,
        Logger = self.configuration.require.Logger;

      Logger.filter('class', ['Cursor']);
      var logged = false;

      connectToDb(
        'mongodb://localhost:27017/test',
        self.configuration.db,
        {
          loggerLevel: 'debug',
          logger: function() {
            logged = true;
          }
        },
        function(err, db, client) {
          expect(err).to.not.exist;

          // perform any operation that gets logged
          db.collection('foo').findOne({}, function(err) {
            expect(err).to.not.exist;
            expect(logged).to.be.true;

            // Clean up
            Logger.reset();
            client.close();
            done();
          });
        }
      );
    }
  });
});
