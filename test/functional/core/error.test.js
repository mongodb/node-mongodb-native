'use strict';

const { expect } = require('chai');
const { MongoError, MongoNetworkError } = require('../../../lib/error');

describe('Error tests', function() {
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
