'use strict';
const maybePromise = require('./../../lib/utils').maybePromise;
var expect = require('chai').expect;

describe('BYO Promises', function() {
  it('should Correctly Use Blurbird promises library', {
    metadata: {
      requires: {
        topology: ['single', 'ssl', 'wiredtiger']
      }
    },

    // The actual test we wish to run
    test: function(done) {
      var self = this;
      const configuration = this.configuration;
      var Promise = require('bluebird');

      const client = configuration.newClient(
        {},
        {
          promiseLibrary: Promise,
          sslValidate: false
        }
      );

      client.connect().then(function(client) {
        var db = client.db(self.configuration.db);
        var promise = db.collection('test').insert({ a: 1 });
        expect(promise).to.be.an.instanceOf(Promise);

        promise.then(function() {
          client.close(done);
        });
      });
    }
  });
});

class CustomPromise extends Promise {}
CustomPromise.prototype.isCustomMongo = true;

describe('Pptional PromiseLibrary / maybePromise', function() {
  it('should correctly implement custom dependency-less promise', function(done) {
    const getCustomPromise = v => new CustomPromise(resolve => resolve(v));
    const getNativePromise = v => new Promise(resolve => resolve(v));
    expect(getNativePromise()).to.not.have.property('isCustomMongo');
    expect(getCustomPromise()).to.have.property('isCustomMongo');
    expect(getNativePromise()).to.have.property('then');
    expect(getCustomPromise()).to.have.property('then');
    done();
  });

  it('should return a promise with extra property CustomMongo', function(done) {
    const prom = maybePromise(CustomPromise, undefined, () => 'example');
    expect(prom).to.have.property('isCustomMongo');
    expect(prom).to.have.property('then');
    done();
  });

  it('should return a native promise', function(done) {
    const prom = maybePromise(undefined, undefined, () => 'example');
    expect(prom).to.not.have.property('isCustomMongo');
    expect(prom).to.have.property('then');
    done();
  });

  it('should have cursor return native promise', {
    metadata: { requires: { topology: 'single' } },
    test: function(done) {
      const configuration = this.configuration;
      const client = this.configuration.newClient({ w: 1 }, { poolSize: 1 });
      client.connect((err, client) => {
        const db = client.db(configuration.db);
        expect(err).to.be.null;
        const collection = db.collection('test');
        const cursor = collection.find({});
        const isPromise = cursor.toArray();
        expect(isPromise).to.not.have.property('isCustomMongo');
        expect(isPromise).to.have.property('then');
        isPromise.then(() => client.close(done));
      });
    }
  });

  it('should have cursor return custom promise from new client options', {
    metadata: { requires: { topology: 'single' } },
    test: function(done) {
      const configuration = this.configuration;
      const client = this.configuration.newClient(
        { w: 1 },
        { poolSize: 1, promiseLibrary: CustomPromise }
      );
      client.connect((err, client) => {
        const db = client.db(configuration.db);
        expect(err).to.be.null;
        const collection = db.collection('test');
        const cursor = collection.find({});
        const isPromise = cursor.toArray();
        expect(isPromise).to.have.property('isCustomMongo');
        expect(isPromise).to.have.property('then');
        isPromise.then(() => client.close(done));
      });
    }
  });
});
