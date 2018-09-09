'use strict';
var expect = require('chai').expect;

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
      const configuration = this.configuration;
      const Logger = configuration.require.Logger;

      // set a custom logger per http://mongodb.github.io/node-mongodb-native/2.0/tutorials/logging/
      Logger.setCurrentLogger(() => {});
      Logger.setLevel('debug');

      const client = configuration.newClient('mongodb://localhost:27017/test');
      client.connect(err => {
        expect(err).to.not.exist;
        const db = client.db(configuration.db);

        // perform any operation that gets logged
        db.collection('foo').findOne({}, err => {
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
      const configuration = this.configuration;
      const Logger = configuration.require.Logger;
      const client = configuration.newClient('mongodb://localhost:27017/test');

      client.connect(err => {
        expect(err).to.not.exist;
        const db = client.db(configuration.db);

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
      const configuration = this.configuration;
      const Logger = configuration.require.Logger;

      Logger.filter('class', ['Cursor']);
      let logged = false;

      const client = configuration.newClient('mongodb://localhost:27017/test', {
        loggerLevel: 'debug',
        logger: function() {
          logged = true;
        }
      });

      client.connect(err => {
        expect(err).to.not.exist;
        const db = client.db(configuration.db);

        // perform any operation that gets logged
        db.collection('foo').findOne({}, err => {
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
});
