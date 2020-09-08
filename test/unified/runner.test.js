'use strict';

const fs = require('fs');
const { Runner } = require('./runner');
const { MongoClient } = require('../../src/mongo_client');
const { Db } = require('../../src/db');
const { Collection } = require('../../src/collection');
const path = require('path');
const example = JSON.parse(
  fs.readFileSync(path.join(__dirname, './example-insertOne.json'), 'utf8')
);

const expect = require('chai').expect;
const Version = require('./runner').Version;

describe('Version', () => {
  context('check', () => {
    it('should check versions', () => {
      expect(Version.check(['1.5.1'], '1')).to.equal(true);
      expect(Version.check(['1.5.1'], '1.0')).to.equal(true);
      expect(Version.check(['1.5.1'], '1.5')).to.equal(true);
      expect(Version.check(['1.5.1'], '1.6')).to.equal(false);
      expect(Version.check(['1.5.1'], '2.0')).to.equal(false);
      expect(Version.check(['2.1'], '2.0')).to.equal(true);
      expect(Version.check(['2.1'], '2.1')).to.equal(true);
      expect(Version.check(['2.1'], '1.0')).to.equal(false);
      expect(Version.check(['2.1'], '1.5')).to.equal(false);
      expect(Version.check(['1.5.1', '2.0'], '1.4')).to.equal(true);
      expect(Version.check(['1.5.1', '2.0'], '1.5')).to.equal(true);
      expect(Version.check(['1.5.1', '2.0'], '2.0')).to.equal(true);
      expect(Version.check(['1.5.1', '2.0'], '1.6')).to.equal(false);
      expect(Version.check(['1.5.1', '2.0'], '2.1')).to.equal(false);
      expect(Version.check(['1.5.1', '2.0'], '3.0')).to.equal(false);
      expect(Version.check(['2.0.1'], '2.0')).to.equal(true);
      expect(Version.check(['2.0.1'], '2.0.1')).to.equal(true);
      expect(Version.check(['2.0.1'], '2.0.2')).to.equal(false);
      expect(Version.check(['2.0.1'], '2.1')).to.equal(false);
    });
  });
});

describe('Runner', () => {
  context('createClient', () => {
    it('should create a client and store it', done => {
      const r = new Runner(example);
      const clientId = 'example';
      expect(() => r.getEntity(clientId)).to.throw();
      r.createClient({ id: clientId }, () => {
        expect(r.getEntity(clientId)).to.exist;
        r.closeClients(done);
      });
    });
  });
  context('callbacksAll', () => {
    it('should run all callbacks as expected', done => {
      const store = [];
      Runner.callbacksAll(
        [
          cb => {
            store.push('a');
            cb();
          },
          cb => {
            store.push('b');
            cb();
          },
          cb => {
            store.push('c');
            cb();
          }
        ],
        () => {
          expect(store).to.deep.equal(['a', 'b', 'c']);
          done();
        }
      );
    });
    it('should return value from callbacks', done => {
      Runner.callbacksAll(
        [cb => cb(undefined, 1), cb => cb(undefined, 2), cb => cb(undefined, 3)],
        (err, results) => {
          expect(err).to.be.undefined;
          expect(results).to.deep.equal([1, 2, 3]);
          done();
        }
      );
    });
    it('should return from within setTimeout', done => {
      Runner.callbacksAll(
        [
          cb => setTimeout(() => cb(undefined, 1), 10),
          cb => setTimeout(() => cb(undefined, 2), 20),
          cb => setTimeout(() => cb(undefined, 3), 10)
        ],
        (err, results) => {
          expect(err).to.be.undefined;
          expect(results).to.deep.equal([1, 2, 3]);
          done();
        }
      );
    });
    it('should propagate error and exit', done => {
      let a = false;
      let b = false;
      let c = false;
      Runner.callbacksAll(
        [
          cb =>
            setTimeout(() => {
              a = true;
              cb();
            }, 10),
          cb =>
            setTimeout(() => {
              b = true;
              cb(new Error('some error'));
            }, 20),
          cb =>
            setTimeout(() => {
              c = true;
              cb();
            }, 10)
        ],
        err => {
          expect(err).to.be.instanceOf(Error);
          expect(a).to.equal(true);
          expect(b).to.equal(true);
          expect(c).to.equal(false);
          done();
        }
      );
    });
  });
  context('createEntities', () => {
    it('should create all entities', done => {
      const r = new Runner(example);
      const clientId = example.createEntities[0].client.id;
      const dbId = example.createEntities[1].database.id;
      const collectionId = example.createEntities[2].collection.id;
      r.createEntities(() => {
        expect(r.getEntity(clientId)).to.be.instanceOf(MongoClient);
        expect(r.getEntity(dbId)).to.be.instanceOf(Db);
        expect(r.getEntity(collectionId)).to.be.instanceOf(Collection);
        r.closeClients(done);
      });
    });
  });
  context('pick', () => {
    it('should pick', () => {
      expect(Runner.pick({ a: true, b: true }, ['a'])).to.deep.equal({ a: true });
    });
  });
});

Runner.handleSpec(example);
