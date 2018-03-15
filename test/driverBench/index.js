'use strict';

const MongoBench = require('../mongoBench');

const Runner = MongoBench.Runner;
const commonHelpers = require('./common');

const makeClient = commonHelpers.makeClient;
const connectClient = commonHelpers.connectClient;
const disconnectClient = commonHelpers.disconnectClient;
const initDb = commonHelpers.initDb;
const dropDb = commonHelpers.dropDb;
const createCollection = commonHelpers.createCollection;
const initCollection = commonHelpers.initCollection;
const dropCollection = commonHelpers.dropCollection;
const makeLoadJSON = commonHelpers.makeLoadJSON;
const loadSpecString = commonHelpers.loadSpecString;
const loadSpecFile = commonHelpers.loadSpecFile;
const initBucket = commonHelpers.initBucket;
const dropBucket = commonHelpers.dropBucket;

function average(arr) {
  return arr.reduce((x, y) => x + y, 0) / arr.length;
}

function encodeBSON() {
  for (let i = 0; i < 10000; i += 1) {
    this.bson.serialize(this.dataString);
  }
}

function decodeBSON() {
  for (let i = 0; i < 10000; i += 1) {
    this.bson.deserialize(this.data);
  }
}

function makeBSONLoader(fileName) {
  return function() {
    const BSON = require('bson');
    const EJSON = require('mongodb-extjson');
    EJSON.setBSONModule(BSON);

    this.bson = new BSON();
    this.dataString = EJSON.parse(loadSpecString(['extended_bson', `${fileName}.json`]));
    this.data = this.bson.serialize(this.dataString);
  };
}

function loadGridFs() {
  this.bin = loadSpecFile(['single_and_multi_document', 'gridfs_large.bin']);
}

function makeTestInsertOne(numberOfOps) {
  return function(done) {
    const loop = _id => {
      if (_id > numberOfOps) {
        return done();
      }

      const doc = Object.assign({}, this.doc);

      this.collection.insertOne(doc, err => (err ? done(err) : loop(_id + 1)));
    };

    loop(1);
  };
}

function makeLoadTweets(makeId) {
  return function() {
    const doc = this.doc;
    const tweets = [];
    for (let _id = 1; _id <= 10000; _id += 1) {
      tweets.push(Object.assign({}, doc, makeId ? { _id } : {}));
    }

    return this.collection.insertMany(tweets);
  };
}

function makeLoadInsertDocs(numberOfOperations) {
  return function() {
    this.docs = [];
    for (let i = 0; i < numberOfOperations; i += 1) {
      this.docs.push(Object.assign({}, this.doc));
    }
  };
}

function findOneById(done) {
  const loop = _id => {
    if (_id > 10000) {
      return done();
    }

    return this.collection.findOne({ _id }, err => (err ? done(err) : loop(_id + 1)));
  };

  return loop(1);
}

function runCommand(done) {
  const loop = _id => {
    if (_id > 10000) {
      return done();
    }
    return this.db.command({ ismaster: true }, err => (err ? done(err) : loop(_id + 1)));
  };

  return loop(1);
}

function findManyAndEmptyCursor(done) {
  return this.collection.find({}).forEach(() => {}, done);
}

function docBulkInsert(done) {
  return this.collection.insertMany(this.docs, { ordered: true }, done);
}

function gridFsInitUploadStream() {
  this.stream = this.bucket.openUploadStream('gridfstest');
}

function writeSingleByteToUploadStream() {
  return new Promise((resolve, reject) => {
    this.stream.write('\0', null, err => (err ? reject(err) : resolve()));
  });
}

const benchmarkRunner = new Runner()
  .suite('bsonBench', suite =>
    suite
      .benchmark('flatBsonEncoding', benchmark =>
        benchmark
          .taskSize(75.31)
          .setup(makeBSONLoader('flat_bson'))
          .task(encodeBSON)
      )
      .benchmark('flatBsonDecoding', benchmark =>
        benchmark
          .taskSize(75.31)
          .setup(makeBSONLoader('flat_bson'))
          .task(decodeBSON)
      )
      .benchmark('deepBsonEncoding', benchmark =>
        benchmark
          .taskSize(19.64)
          .setup(makeBSONLoader('deep_bson'))
          .task(encodeBSON)
      )
      .benchmark('deepBsonDecoding', benchmark =>
        benchmark
          .taskSize(19.64)
          .setup(makeBSONLoader('deep_bson'))
          .task(decodeBSON)
      )
      .benchmark('fullBsonEncoding', benchmark =>
        benchmark
          .taskSize(57.34)
          .setup(makeBSONLoader('full_bson'))
          .task(encodeBSON)
      )
      .benchmark('fullBsonDecoding', benchmark =>
        benchmark
          .taskSize(57.34)
          .setup(makeBSONLoader('full_bson'))
          .task(decodeBSON)
      )
  )
  .suite('singleBench', suite =>
    suite
      .benchmark('runCommand', benchmark =>
        benchmark
          .taskSize(0.16)
          .setup(makeClient)
          .setup(connectClient)
          .setup(initDb)
          .task(runCommand)
          .teardown(disconnectClient)
      )
      .benchmark('findOne', benchmark =>
        benchmark
          .taskSize(16.22)
          .setup(makeLoadJSON('tweet.json'))
          .setup(makeClient)
          .setup(connectClient)
          .setup(initDb)
          .setup(dropDb)
          .setup(initCollection)
          .setup(makeLoadTweets(true))
          .task(findOneById)
          .teardown(dropDb)
          .teardown(disconnectClient)
      )
      .benchmark('smallDocInsertOne', benchmark =>
        benchmark
          .taskSize(2.75)
          .setup(makeLoadJSON('small_doc.json'))
          .setup(makeClient)
          .setup(connectClient)
          .setup(initDb)
          .setup(dropDb)
          .setup(initDb)
          .setup(initCollection)
          .setup(createCollection)
          .beforeTask(dropCollection)
          .beforeTask(createCollection)
          .beforeTask(initCollection)
          .task(makeTestInsertOne(10000))
          .teardown(dropDb)
          .teardown(disconnectClient)
      )
      .benchmark('largeDocInsertOne', benchmark =>
        benchmark
          .taskSize(27.31)
          .setup(makeLoadJSON('large_doc.json'))
          .setup(makeClient)
          .setup(connectClient)
          .setup(initDb)
          .setup(dropDb)
          .setup(initDb)
          .setup(initCollection)
          .setup(createCollection)
          .beforeTask(dropCollection)
          .beforeTask(createCollection)
          .beforeTask(initCollection)
          .task(makeTestInsertOne(10))
          .teardown(dropDb)
          .teardown(disconnectClient)
      )
  )
  .suite('multiBench', suite =>
    suite
      .benchmark('findManyAndEmptyCursor', benchmark =>
        benchmark
          .taskSize(16.22)
          .setup(makeLoadJSON('tweet.json'))
          .setup(makeClient)
          .setup(connectClient)
          .setup(initDb)
          .setup(dropDb)
          .setup(initCollection)
          .setup(makeLoadTweets(false))
          .task(findManyAndEmptyCursor)
          .teardown(dropDb)
          .teardown(disconnectClient)
      )
      .benchmark('smallDocBulkInsert', benchmark =>
        benchmark
          .taskSize(2.75)
          .setup(makeLoadJSON('small_doc.json'))
          .setup(makeLoadInsertDocs(10000))
          .setup(makeClient)
          .setup(connectClient)
          .setup(initDb)
          .setup(dropDb)
          .setup(initDb)
          .setup(initCollection)
          .setup(createCollection)
          .beforeTask(dropCollection)
          .beforeTask(createCollection)
          .beforeTask(initCollection)
          .task(docBulkInsert)
          .teardown(dropDb)
          .teardown(disconnectClient)
      )
      .benchmark('largeDocBulkInsert', benchmark =>
        benchmark
          .taskSize(27.31)
          .setup(makeLoadJSON('large_doc.json'))
          .setup(makeLoadInsertDocs(10))
          .setup(makeClient)
          .setup(connectClient)
          .setup(initDb)
          .setup(dropDb)
          .setup(initDb)
          .setup(initCollection)
          .setup(createCollection)
          .beforeTask(dropCollection)
          .beforeTask(createCollection)
          .beforeTask(initCollection)
          .task(docBulkInsert)
          .teardown(dropDb)
          .teardown(disconnectClient)
      )
      .benchmark('gridFsUpload', benchmark =>
        benchmark
          .taskSize(52.43)
          .setup(loadGridFs)
          .setup(makeClient)
          .setup(connectClient)
          .setup(initDb)
          .setup(dropDb)
          .setup(initDb)
          .setup(initCollection)
          .beforeTask(dropBucket)
          .beforeTask(initBucket)
          .beforeTask(gridFsInitUploadStream)
          .beforeTask(writeSingleByteToUploadStream)
          .task(function(done) {
            this.stream.on('error', done).end(this.bin, null, () => done());
          })
          .teardown(dropDb)
          .teardown(disconnectClient)
      )
      .benchmark('gridFsDownload', benchmark =>
        benchmark
          .taskSize(52.43)
          .setup(loadGridFs)
          .setup(makeClient)
          .setup(connectClient)
          .setup(initDb)
          .setup(dropDb)
          .setup(initDb)
          .setup(initCollection)
          .setup(dropBucket)
          .setup(initBucket)
          .setup(gridFsInitUploadStream)
          .setup(function() {
            return new Promise((resolve, reject) => {
              this.stream.end(this.bin, null, err => {
                if (err) {
                  return reject(err);
                }

                this.id = this.stream.id;
                this.stream = undefined;
                resolve();
              });
            });
          })
          .task(function(done) {
            this.bucket
              .openDownloadStream(this.id)
              .resume()
              .on('end', done);
          })
          .teardown(dropDb)
          .teardown(disconnectClient)
      )
  );

benchmarkRunner
  .run()
  .then(microBench => {
    const bsonBench = average(Object.values(microBench.bsonBench));
    const singleBench = average([
      microBench.singleBench.findOne,
      microBench.singleBench.smallDocInsertOne,
      microBench.singleBench.largeDocInsertOne
    ]);
    const multiBench = average(Object.values(microBench.multiBench));

    // TODO: add parallelBench
    const parallelBench = NaN;
    const readBench = average([
      microBench.singleBench.findOne,
      microBench.multiBench.findManyAndEmptyCursor,
      microBench.multiBench.gridFsDownload
      // TODO: Add parallelBench read benchmarks
    ]);
    const writeBench = average([
      microBench.singleBench.smallDocInsertOne,
      microBench.singleBench.largeDocInsertOne,
      microBench.multiBench.smallDocBulkInsert,
      microBench.multiBench.largeDocBulkInsert,
      microBench.multiBench.gridFsUpload
      // TODO: Add parallelBench write benchmarks
    ]);
    const driverBench = average([readBench, writeBench]);

    return {
      microBench,
      bsonBench,
      singleBench,
      multiBench,
      parallelBench,
      readBench,
      writeBench,
      driverBench
    };
  })
  .then(data => console.log(data))
  .catch(err => console.error(err));
