const {
  loadSpecFile,
  makeLoadJSON,
  makeClient,
  connectClient,
  initDb,
  dropDb,
  initCollection,
  makeLoadTweets,
  disconnectClient,
  makeLoadInsertDocs,
  createCollection,
  dropCollection,
  dropBucket,
  initBucket
} = require('../../driverBench/common');

function loadGridFs() {
  this.bin = loadSpecFile(['single_and_multi_document', 'gridfs_large.bin']);
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
function makeMultiBench(suite) {
  return suite
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
        .task(function (done) {
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
        .setup(function () {
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
        .task(function (done) {
          this.bucket.openDownloadStream(this.id).resume().on('end', done);
        })
        .teardown(dropDb)
        .teardown(disconnectClient)
    );
}

module.exports = { makeMultiBench };
