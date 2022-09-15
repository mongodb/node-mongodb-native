const { Readable } = require('stream');
const { pipeline } = require('stream/promises');
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
  initBucket,
  writeSingleByteFileToBucket
} = require('../../driverBench/common');

function loadGridFs() {
  this.bin = loadSpecFile(['single_and_multi_document', 'gridfs_large.bin']);
}

function gridFsInitUploadStream() {
  this.uploadStream = this.bucket.openUploadStream('gridfstest');
}

async function gridFsUpload() {
  const uploadData = Readable.from(this.bin);
  const uploadStream = this.uploadStream;
  await pipeline(uploadData, uploadStream);
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
        .task(async function () {
          // eslint-disable-next-line no-unused-vars
          for await (const _ of this.collection.find({})) {
            // do nothing
          }
        })
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
        .task(async function () {
          await this.collection.insertMany(this.docs, { ordered: true });
        })
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
        .task(async function () {
          await this.collection.insertMany(this.docs, { ordered: true });
        })
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
        .beforeTask(writeSingleByteFileToBucket)
        .task(gridFsUpload)
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
        .setup(async function () {
          await gridFsUpload.call(this);
          this.id = this.uploadStream.id;
          this.uploadData = undefined;
        })
        .task(async function () {
          // eslint-disable-next-line no-unused-vars
          for await (const _ of this.bucket.openDownloadStream(this.id)) {
            // do nothing
          }
        })
        .teardown(dropDb)
        .teardown(disconnectClient)
    );
}

module.exports = { makeMultiBench };
