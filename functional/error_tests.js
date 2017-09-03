'use strict';

var expect = require('chai').expect,
  f = require('util').format;

describe('Error tests', function() {
  it('should return helpful error when geoHaystack fails', {
    metadata: {
      requires: { topology: ['single', 'replicaset'] }
    },

    test: function(done) {
      var self = this;

      self.configuration.newTopology(function(err, server) {
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
      });
    }
  });

  it('should create a MongoError from string', {
    metadata: {
      requires: { topology: ['single'] }
    },

    test: function(done) {
      var MongoError = require('../../../lib/error.js').MongoError;

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
      var MongoError = require('../../../lib/error.js').MongoError;

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
      var MongoError = require('../../../lib/error.js').MongoError;

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
      var errors = require('../../../lib/error');

      var errorMessage = 'A test error';
      var err = new errors.MongoNetworkError(errorMessage);
      expect(err).to.be.an.instanceof(Error);
      expect(err).to.be.an.instanceof(errors.MongoError);
      expect(err.name).to.equal('MongoNetworkError');
      expect(err.message).to.equal(errorMessage);

      done();
    }
  });
});
