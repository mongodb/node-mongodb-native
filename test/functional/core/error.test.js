'use strict';

const { expect } = require('chai');
const { format: f } = require('util');
const { MongoError, MongoNetworkError } = require('../../../lib/error');

describe('Error tests', function() {
  it.skip('should return helpful error when geoHaystack fails', {
    metadata: {
      requires: {
        mongodb: '< 4.1.x',
        topology: ['single', 'replicaset']
      }
    },

    test: function(done) {
      var self = this;
      const config = this.configuration;
      const server = config.newTopology();

      var ns = f('%s.geohaystack1', self.configuration.db);
      server.on('connect', function(_server) {
        _server.command('system.$cmd', { geoNear: ns }, {}, function(_err, result) {
          expect(result).to.not.exist;
          expect(/can't find ns/.test(_err)).to.be.ok;
          _server.destroy();
          done();
        });
      });

      // Start connection
      server.connect();
    }
  });

  it('should create a MongoError from string', {
    metadata: {
      requires: { topology: ['single'] }
    },

    test: function(done) {
      var errorMessage = 'A test error';
      var err = new MongoError(errorMessage);
      expect(err).to.be.an.instanceof(Error);
      expect(err.name).to.equal('MongoError');
      expect(err.message).to.equal(errorMessage);

      done();
    }
  });

  it('should create a MongoError from Error', {
    metadata: {
      requires: { topology: ['single'] }
    },

    test: function(done) {
      var errorMessage = 'A test error';
      var err = new MongoError(new Error(errorMessage));
      expect(err).to.be.an.instanceof(Error);
      expect(err.name).to.equal('MongoError');
      expect(err.message).to.equal(errorMessage);

      done();
    }
  });

  it('should create a MongoError from object', {
    metadata: {
      requires: { topology: ['single'] }
    },

    test: function(done) {
      var errorMessage = 'A test error';
      var err = new MongoError({ message: errorMessage, someData: 12345 });
      expect(err).to.be.an.instanceof(Error);
      expect(err.name).to.equal('MongoError');
      expect(err.message).to.equal(errorMessage);
      expect(err.someData).to.equal(12345);

      done();
    }
  });

  it('should create a MongoNetworkError', {
    metadata: {
      requires: { topology: ['single'] }
    },

    test: function(done) {
      var errorMessage = 'A test error';
      var err = new MongoNetworkError(errorMessage);
      expect(err).to.be.an.instanceof(Error);
      expect(err).to.be.an.instanceof(MongoError);
      expect(err.name).to.equal('MongoNetworkError');
      expect(err.message).to.equal(errorMessage);

      done();
    }
  });
});
