'use strict';

const mongodb = require('../../index');
const maybePromise = require('../../lib/utils').maybePromise;
var expect = require('chai').expect;

class CustomPromise extends Promise {}
CustomPromise.prototype.isCustomMongo = true;

describe('Optional PromiseLibrary / maybePromise', function() {
  afterEach(() => {
    mongodb.Promise = global.Promise;
  });
  it('should correctly implement custom dependency-less promise', function(done) {
    const getCustomPromise = v => new CustomPromise(resolve => resolve(v));
    const getNativePromise = v => new Promise(resolve => resolve(v));
    expect(getNativePromise()).to.not.have.property('isCustomMongo');
    expect(getCustomPromise()).to.have.property('isCustomMongo');
    expect(getNativePromise()).to.have.property('then');
    expect(getCustomPromise()).to.have.property('then');
    done();
  });

  it('should return a native promise', function(done) {
    const prom = maybePromise(undefined, () => 'example');
    expect(prom).to.not.have.property('isCustomMongo');
    expect(prom).to.have.property('then');
    done();
  });

  it('should have cursor return native promise', function(done) {
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
  });

  it('should have cursor return custom promise from global promise store', function(done) {
    mongodb.Promise = CustomPromise;
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
  });

  it('should be able to change promise library', function(done) {
    mongodb.Promise = CustomPromise;
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

      mongodb.Promise = global.Promise;
      const cursor2 = collection.find({});
      const isPromise2 = cursor2.toArray();
      expect(isPromise2).to.not.have.property('isCustomMongo');
      expect(isPromise2).to.have.property('then');

      isPromise.then(() => {
        isPromise2.then(() => {
          client.close(done);
        });
      });
    });
  });
});
