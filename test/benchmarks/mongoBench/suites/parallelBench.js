const { createReadStream, createWriteStream } = require('fs');
const { rm, mkdir, readdir } = require('fs/promises');
const { resolve } = require('path');
const { Readable, once } = require('stream');
const readline = require('readline');
const {
  makeClient,
  disconnectClient,
  dropDb,
  initBucket,
  dropBucket,
  initCollection,
  initDb,
  connectClient,
  createCollection
} = require('../../driverBench/common');
const { pipeline } = require('stream/promises');
const { EJSON } = require('bson');

const benchmarkFileDirectory = resolve(__dirname, '..', '..', 'driverBench', 'spec', 'parallel');

async function initTemporaryDirectory() {
  const temporaryDirectory = resolve(benchmarkFileDirectory, 'downloads');
  await rm(temporaryDirectory, { recursive: true, force: true }).catch(() => {
    // ignore errors, specifically directory not found
  });
  await mkdir(temporaryDirectory);
  this.temporaryDirectory = temporaryDirectory;
}

async function clearTemporaryDirectory() {
  const fileNames = await readdir(this.temporaryDirectory);
  const files = fileNames.map(filename => resolve(this.temporaryDirectory, filename));

  await Promise.all(files.map(file => rm(file)));
}

async function removeTemporaryDirectory() {
  await rm(this.temporaryDirectory, { recursive: true, force: true }).catch(() => {
    // ignore errors, specifically directory not found
  });
}

async function ldjsonMultiUpload() {
  const directory = resolve(benchmarkFileDirectory, 'ldjson_multi');
  const files = await readdir(directory);
  const uploads = files.map(async file => {
    const stream = createReadStream(resolve(directory, file));
    const lineReader = readline.createInterface({
      input: stream
    });

    const bulkWrite = this.collection.initializeUnorderedBulkOp();

    for await (const line of lineReader) {
      bulkWrite.insert(JSON.parse(line));
    }

    stream.close();
    lineReader.close();

    return bulkWrite.execute();
  });

  await Promise.all(uploads);
}

async function ldjsonMultiExport() {
  const skips = Array.from({ length: 100 }, (_, index) => index * 5000);
  const collection = this.collection;
  const temporaryDirectory = this.temporaryDirectory;

  const promises = skips.map(async function (skip) {
    const documentCursor = collection.find({}, { skip, limit: 5000 });
    documentCursor.map(doc => EJSON.stringify(doc));
    const outputStream = createWriteStream(resolve(temporaryDirectory, `tmp-${skip}.txt`));
    return pipeline(documentCursor.stream(), outputStream);
  });

  await Promise.all(promises);
}

async function gridfsMultiFileUpload() {
  const directory = resolve(benchmarkFileDirectory, 'gridfs_multi');
  const files = await readdir(directory);
  const bucket = this.bucket;
  const uploadPromises = files.map(async filename => {
    const file = resolve(directory, filename);
    const fileStream = createReadStream(file);
    const uploadStream = bucket.openUploadStream(file);
    return pipeline(fileStream, uploadStream);
  });
  await Promise.all(uploadPromises);
}

async function gridfsMultiFileDownload() {
  const temporaryDirectory = this.temporaryDirectory;
  const files2 = await this.bucket
    .find()
    .map(({ _id }) => ({
      path: resolve(temporaryDirectory, `${_id}.txt`),
      _id
    }))
    .toArray();

  const downloads = files2.map(async ({ _id, path }) => {
    const fileStream = createWriteStream(path);
    const downloadStream = this.bucket.openDownloadStream(_id);
    return pipeline(downloadStream, fileStream);
  });

  await Promise.all(downloads);
}

/**
 *
 * @param {Suite} suite
 * @returns Benchmark
 */
function makeParallelBenchmarks(suite) {
  return suite
    .benchmark('ldjsonMultiFileUpload', benchmark =>
      // https://github.com/mongodb/specifications/blob/master/source/benchmarking/benchmarking.rst#ldjson-multi-file-import
      benchmark
        .taskSize(565)
        .setup(makeClient)
        .setup(connectClient)
        .setup(initDb)
        .setup(dropDb)
        .beforeTask(initCollection)
        .beforeTask(function () {
          return this.collection.drop().catch(e => e);
        })
        .beforeTask(createCollection)
        .task(ldjsonMultiUpload)
        .teardown(dropDb)
        .teardown(disconnectClient)
    )
    .benchmark('ldjsonMultiFileExport', benchmark =>
      // https://github.com/mongodb/specifications/blob/master/source/benchmarking/benchmarking.rst#ldjson-multi-file-export
      benchmark
        .taskSize(565)
        .setup(makeClient)
        .setup(connectClient)
        .setup(initDb)
        .setup(dropDb)
        .beforeTask(initCollection)
        .beforeTask(function () {
          return this.collection.drop().catch(e => e);
        })
        .beforeTask(createCollection)
        .beforeTask(ldjsonMultiUpload)
        .beforeTask(initTemporaryDirectory)
        .task(ldjsonMultiExport)
        .afterTask(clearTemporaryDirectory)
        .teardown(dropDb)
        .teardown(removeTemporaryDirectory)
        .teardown(disconnectClient)
    )
    .benchmark('gridfsMultiFileUpload', benchmark =>
      // https://github.com/mongodb/specifications/blob/master/source/benchmarking/benchmarking.rst#gridfs-multi-file-upload
      benchmark
        .taskSize(262.144)
        .setup(makeClient)
        .setup(connectClient)
        .setup(initDb)
        .setup(dropDb)
        .setup(initDb)
        .setup(initCollection)
        .beforeTask(dropBucket)
        .beforeTask(initBucket)
        .beforeTask(async function () {
          const stream = this.bucket.openUploadStream('setup-file.txt');
          const oneByteFile = Readable.from('a');
          const done = once(stream, 'close');
          oneByteFile.pipe(stream);
          return done;
        })
        .task(gridfsMultiFileUpload)
        .teardown(dropDb)
        .teardown(disconnectClient)
    )
    .benchmark('gridfsMultiFileDownload', benchmark =>
      // https://github.com/mongodb/specifications/blob/master/source/benchmarking/benchmarking.rst#gridfs-multi-file-download
      benchmark
        .taskSize(262.144)
        .setup(makeClient)
        .setup(connectClient)
        .setup(initDb)
        .setup(dropDb)
        .setup(initDb)
        .setup(initCollection)
        .setup(initTemporaryDirectory)
        .setup(dropBucket)
        .setup(initBucket)
        .setup(gridfsMultiFileUpload)
        .beforeTask(clearTemporaryDirectory)
        .setup(initBucket)
        .task(gridfsMultiFileDownload)
        .teardown(dropDb)
        .teardown(removeTemporaryDirectory)
        .teardown(disconnectClient)
    );
}

module.exports = { makeParallelBenchmarks };
