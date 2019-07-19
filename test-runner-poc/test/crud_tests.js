'use strict';
/* include stuff */
const expect = require('chai').expect;
const MongoClient = require('mongodb').MongoClient;

let client;
let db;

describe('CRUD', function() {
  it('should correctly insert documents', function(done) {
    const collection = db.collection('insertTest');

    collection.insertOne({a: 1}, (err, result) => {
      expect(err).to.not.exist;
      expect(result).to.exist;
      expect(result.insertedCount).to.equal(1);
      expect(result.ops[0].a).to.equal(1);
      done();
    });
  });

  it('should correctly insertMany documents', function(done) {
      const collection = db.collection('insertManyTest');

      collection.insertMany([{b: 2}, {c:3}], (err, result) => {
        expect(err).to.not.exist;
        expect(result).to.exist;
        expect(result.insertedCount).to.equal(2);
        expect(result.ops[0].b).to.equal(2);
        expect(result.ops[1].c).to.equal(3);
        done();
      });
  });

  it('should correctly update documents', function(done) {
    const collection = db.collection('updateTest');

    collection.insertOne({a: 1}, (err, result) => {
      expect(err).to.not.exist;
      expect(result).to.exist;
      expect(result.insertedCount).to.equal(1);

      collection.updateOne({a: 1}, {$set: {a: 2}}, (err, result) => {
        expect(err).to.not.exist;
        expect(result).to.exist;
        expect(result.modifiedCount).to.equal(1);
        expect(result.matchedCount).to.equal(1);
        done();
      });
    });
  });

  it('should correctly updateMany documents', function(done) {
    const collection = db.collection('updateManyTest');

    collection.insertMany([{a: 1}, {a: 1}], (err, result) => {
      expect(err).to.not.exist;
      expect(result).to.exist;
      expect(result.insertedCount).to.equal(2);

      collection.updateMany({a: 1}, {$set: {a: 2}}, (err, result) => {
        expect(err).to.not.exist;
        expect(result).to.exist;
        expect(result.modifiedCount).to.equal(2);
        expect(result.matchedCount).to.equal(2);
        done();
      });
    });
  });

  it('should correctly delete documents', function(done) {
    const collection = db.collection('deleteTest');

    collection.insertOne({a: 1}, (err, result) => {
      expect(err).to.not.exist;
      expect(result).to.exist;
      expect(result.insertedCount).to.equal(1);

      collection.deleteOne({a: 1}, (err, result) => {
        expect(err).to.not.exist;
        expect(result).to.exist;
        expect(result.deletedCount).to.equal(1);
        done();
      });
    });
  });

  it('should correctly deleteMany documents', function(done) {
    const collection = db.collection('deleteManyTest');

    collection.insertMany([{a: 1}, {a: 1}, {a: 1}], (err, result) => {
      expect(err).to.not.exist;
      expect(result).to.exist;
      expect(result.insertedCount).to.equal(3);

      collection.deleteMany({a:1}, (err, result) => {
        expect(err).to.not.exist;
        expect(result).to.exist;
        expect(result.deletedCount).to.equal(3);
        done();
      });
    });
  });

  it('should correctly find documents', function(done) {
    const collection = db.collection('findTest');

    collection.insertOne({a: 1}, (err, result) => {
      expect(err).to.not.exist;
      expect(result).to.exist;
      expect(result.insertedCount).to.equal(1);

      collection.findOne({a: 1}, (err, result) => {
        expect(err).to.not.exist;
        expect(result).to.exist;
        expect(result.a).to.equal(1);
        done();
      });
    });
  });
  before(function(done) {
      //TODO replace with URI later
      client = new MongoClient(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017', {w: 1, poolSize: 1});
      client.connect((err) => {
        expect(err).to.not.exist;
        db = client.db('test');
        done();
      });
  })

  after(function(done) {
    client.close(done);
  })

});
