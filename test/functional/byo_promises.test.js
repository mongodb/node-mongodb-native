'use strict';

const maybePromise = require('./../../lib/utils').maybePromise;
var expect = require('chai').expect;

class CustomPromise extends Promise {}
CustomPromise.prototype.isCustomMongo = true;

const parent = { s: { promiseLibrary: CustomPromise } };

describe('Optional PromiseLibrary / maybePromise', function() {
  it('should correctly implement custom dependency-less promise', function(done) {
    const getCustomPromise = v => new CustomPromise(resolve => resolve(v));
    const getNativePromise = v => new Promise(resolve => resolve(v));
    expect(getNativePromise()).to.not.have.property('isCustomMongo');
    expect(getCustomPromise()).to.have.property('isCustomMongo');
    expect(getNativePromise()).to.have.property('then');
    expect(getCustomPromise()).to.have.property('then');
    done();
  });

  it('should return a promise with extra property CustomMongo', function() {
    const prom = maybePromise(parent, undefined, () => 'example');
    expect(prom).to.have.property('isCustomMongo');
    expect(prom).to.have.property('then');
  });

  it('should return a native promise with no parent', function(done) {
    const prom = maybePromise(undefined, undefined, () => 'example');
    expect(prom).to.not.have.property('isCustomMongo');
    expect(prom).to.have.property('then');
    done();
  });

  it('should return a native promise with empty parent', function(done) {
    const prom = maybePromise({}, undefined, () => 'example');
    expect(prom).to.not.have.property('isCustomMongo');
    expect(prom).to.have.property('then');
    done();
  });

  it('should return a native promise with emtpy "s"', function(done) {
    const prom = maybePromise({ s: {} }, undefined, () => 'example');
    expect(prom).to.not.have.property('isCustomMongo');
    expect(prom).to.have.property('then');
    done();
  });

  it('should have cursor return native promise', {
    metadata: { requires: { topology: ['single', 'ssl', 'wiredtiger'] } },
    test: function(done) {
      const configuration = this.configuration;
      const client = this.configuration.newClient({ w: 1 }, { poolSize: 1 });
      client.connect((err, client) => {
        expect(err).to.not.exist;
        const db = client.db(configuration.db);
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
