import { once } from 'node:events';
import * as fs from 'node:fs';
import { text } from 'node:stream/consumers';
import { finished, pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';

import { expect } from 'chai';
import * as sinon from 'sinon';

import { type Db, GridFSBucket, MongoAPIError, type MongoClient, ObjectId } from '../../../src';

describe.only('GridFS Stream', function () {
  let client: MongoClient;
  let db: Db;

  beforeEach(async function () {
    client = this.configuration.newClient();
    db = client.db('gridfs_stream_tests');
  });

  afterEach(async function () {
    await db.dropDatabase().catch(() => null);
    await client.close();
  });

  /**
   * Correctly stream a file from disk into GridFS using openUploadStream
   *
   * @example-class GridFSBucket
   * @example-method openUploadStream
   */
  it('should upload from file stream', {
    metadata: { requires: { topology: ['single'] } },

    async test() {
      const bucket = new GridFSBucket(db);
      const readStream = fs.createReadStream('./LICENSE.md');
      const uploadStream = bucket.openUploadStream('test.dat');

      const license = fs.readFileSync('./LICENSE.md');
      const id = uploadStream.id;

      await pipeline(readStream, uploadStream);

      const chunksCollection = db.collection('fs.chunks');
      const filesCollection = db.collection('fs.files');

      // Get all the chunks
      const chunks = await chunksCollection.find({ files_id: id }).toArray();
      expect(chunks.length).to.equal(1);
      expect(chunks[0].data.toString('hex')).to.equal(license.toString('hex'));

      // Get all the files
      const files = await filesCollection.find({ _id: id }).toArray();
      expect(files.length).to.equal(1);
      expect(files[0]).to.not.have.property('md5');

      // Make sure we created indexes
      const chunkIndexes = await chunksCollection.listIndexes().toArray();
      expect(chunkIndexes.length).to.equal(2);
      expect(chunkIndexes[1].name).to.equal('files_id_1_n_1');

      const fileIndexes = await filesCollection.listIndexes().toArray();
      expect(fileIndexes.length).to.equal(2);
      expect(fileIndexes[1].name).to.equal('filename_1_uploadDate_1');
    }
  });

  it('.destroy() publishes provided error', {
    metadata: { requires: { topology: ['single'] } },
    async test() {
      const bucket = new GridFSBucket(db);
      const readStream = fs.createReadStream('./LICENSE.md');
      const uploadStream = bucket.openUploadStream('test.dat');
      const errorMessage = 'error';

      readStream.pipe(uploadStream);

      const onError = once(uploadStream, 'error');
      uploadStream.destroy(new Error(errorMessage));

      const [error] = await onError;
      expect(error.message).to.equal(errorMessage);
    }
  });

  /**
   * Correctly stream a file from disk into GridFS using openUploadStreamWithId
   *
   * @example-class GridFSBucket
   * @example-method openUploadStreamWithId
   */
  it('should upload from file stream with custom id', {
    metadata: { requires: { topology: ['single'] } },

    async test() {
      const bucket = new GridFSBucket(db);
      const readStream = fs.createReadStream('./LICENSE.md');

      const id = new ObjectId();
      const uploadStream = bucket.openUploadStreamWithId(id, 'test.dat');

      const license = fs.readFileSync('./LICENSE.md');
      expect(uploadStream.id).to.equal(id);

      await pipeline(readStream, uploadStream);

      const chunksCollection = db.collection('fs.chunks');
      const filesCollection = db.collection('fs.files');

      // Get all the chunks
      const chunks = await chunksCollection.find({ files_id: id }).toArray();
      expect(chunks.length).to.equal(1);
      expect(chunks[0].data.toString('hex')).to.equal(license.toString('hex'));

      // Get all the files
      const files = await filesCollection.find({ _id: id }).toArray();
      expect(files.length).to.equal(1);
      expect(files[0]).to.not.have.property('md5');

      // Make sure we created indexes
      const chunkIndexes = await chunksCollection.listIndexes().toArray();
      expect(chunkIndexes.length).to.equal(2);
      expect(chunkIndexes[1].name).to.equal('files_id_1_n_1');

      const fileIndexes = await filesCollection.listIndexes().toArray();
      expect(fileIndexes.length).to.equal(2);
      expect(fileIndexes[1].name).to.equal('filename_1_uploadDate_1');
    }
  });

  /**
   * Correctly upload a file to GridFS and then retrieve it as a stream
   *
   * @example-class GridFSBucket
   * @example-method openDownloadStream
   */
  it('should download to upload stream', {
    metadata: { requires: { topology: ['single'] } },

    async test() {
      const bucket = new GridFSBucket(db, { bucketName: 'gridfsdownload' });
      const CHUNKS_COLL = 'gridfsdownload.chunks';
      const FILES_COLL = 'gridfsdownload.files';
      const readStream = fs.createReadStream('./LICENSE.md');

      let uploadStream = bucket.openUploadStream('test.dat');

      const license = fs.readFileSync('./LICENSE.md');
      let id = uploadStream.id;

      await pipeline(readStream, uploadStream);

      const downloadStream = bucket.openDownloadStream(id);
      uploadStream = bucket.openUploadStream('test2.dat');
      id = uploadStream.id;

      await pipeline(downloadStream, uploadStream);

      const chunks = await db.collection(CHUNKS_COLL).find({ files_id: id }).toArray();

      expect(chunks.length).to.equal(1);
      expect(chunks[0].data.toString('hex')).to.equal(license.toString('hex'));

      const files = await db.collection(FILES_COLL).find({ _id: id }).toArray();
      expect(files.length).to.equal(1);
      expect(files[0]).to.not.have.property('md5');
    }
  });

  /**
   * Correctly return file not found error
   */
  it('should fail to locate gridfs stream', {
    metadata: { requires: { topology: ['single'] } },

    async test() {
      const bucket = new GridFSBucket(db, { bucketName: 'gridfsdownload' });

      // Get an unknown file
      const downloadStream = bucket.openDownloadStream(new ObjectId());
      downloadStream.resume();

      const [error] = await once(downloadStream, 'error');
      expect(error.code).to.equal('ENOENT');
    }
  });

  /**
   * Correctly download a GridFS file by name
   *
   * @example-class GridFSBucket
   * @example-method openDownloadStreamByName
   */
  it('openDownloadStreamByName', {
    metadata: { requires: { topology: ['single'] } },

    async test() {
      const bucket = new GridFSBucket(db, { bucketName: 'gridfsdownload' });
      const readStream = fs.createReadStream('./LICENSE.md');
      const uploadStream = bucket.openUploadStream('test.dat');

      await pipeline(readStream, uploadStream);

      const downloadStream = bucket.openDownloadStreamByName('test.dat');
      const str = await text(downloadStream);
      expect(str).includes('TERMS AND CONDITIONS');
    }
  });

  /**
   * Provide start and end parameters for file download to skip ahead x bytes and limit the total amount of bytes read to n
   *
   * @example-class GridFSBucket
   * @example-method openDownloadStream
   */
  it('start/end options for openDownloadStream', {
    metadata: { requires: { topology: ['single'] } },

    async test() {
      const bucket = new GridFSBucket(db, {
        bucketName: 'gridfsdownload',
        chunkSizeBytes: 2
      });

      const readStream = fs.createReadStream('./LICENSE.md');
      const uploadStream = bucket.openUploadStream('teststart.dat');

      await pipeline(readStream, uploadStream);

      const downloadStream = bucket.openDownloadStreamByName('teststart.dat', { start: 1 }).end(6);

      const chunks = await downloadStream.toArray();

      // Depending on different versions of node, we may get
      // different amounts of chunks. node 0.10 gives 2,
      // node >= 0.12 gives 3. Either is correct, but we just
      // care that we got between 1 and 3, and got the right result
      expect(chunks.length).to.be.within(1, 3);
      expect(Buffer.concat(chunks).toString('utf8')).to.equal('pache');
    }
  });

  it('emits "end" and "close" after all chunks are received', async function () {
    const bucket = new GridFSBucket(db, { bucketName: 'gridfsdownload', chunkSizeBytes: 6000 });

    const readStream = fs.createReadStream('./LICENSE.md');
    const uploadStream = bucket.openUploadStream('LICENSE.md');

    await pipeline(readStream, uploadStream);

    const downloadStream = bucket.openDownloadStreamByName('LICENSE.md');

    const endEvent = once(downloadStream, 'end');
    const closeEvent = once(downloadStream, 'close');

    // This always comes in two chunks because
    // our LICENSE is 11323 characters and we set chunkSize to 6000
    const chunks = [];
    for await (const data of downloadStream) {
      chunks.push(data);
    }

    await endEvent;
    await closeEvent;

    expect(chunks).to.have.lengthOf(2);
  });

  /**
   * Deleting a file from GridFS
   *
   * @example-class GridFSBucket
   * @example-method delete
   */
  it('Deleting a file', {
    metadata: { requires: { topology: ['single'] } },

    async test() {
      const bucket = new GridFSBucket(db, { bucketName: 'gridfsdownload' });
      const CHUNKS_COLL = 'gridfsdownload.chunks';
      const FILES_COLL = 'gridfsdownload.files';
      const readStream = fs.createReadStream('./LICENSE.md');

      const uploadStream = bucket.openUploadStream('test.dat');
      const id = uploadStream.id;

      await pipeline(readStream, uploadStream);

      await bucket.delete(id);

      const chunks = await db.collection(CHUNKS_COLL).find({ files_id: id }).toArray();
      expect(chunks.length).to.equal(0);

      const files = await db.collection(FILES_COLL).find({ _id: id }).toArray();
      expect(files.length).to.equal(0);
    }
  });

  it('writing to an aborted stream throws API error', {
    metadata: { requires: { topology: ['single'] } },

    async test() {
      const bucket = new GridFSBucket(db, { bucketName: 'gridfsabort', chunkSizeBytes: 1 });
      const chunks = db.collection('gridfsabort.chunks');
      const uploadStream = bucket.openUploadStream('test.dat');

      const willError = once(uploadStream, 'error');

      const id = uploadStream.id;
      const query = { files_id: id };

      const writeAsync = promisify(uploadStream.write.bind(uploadStream));

      await writeAsync('a', 'utf8');

      expect(await chunks.countDocuments(query)).to.equal(1);

      await uploadStream.abort();

      expect(await chunks.countDocuments(query)).to.equal(0);

      expect(await writeAsync('b', 'utf8').catch(e => e)).to.be.instanceOf(MongoAPIError);
      expect(await uploadStream.abort().catch(e => e)).to.be.instanceOf(MongoAPIError);
      expect((await willError)[0]).to.be.instanceOf(MongoAPIError);
    }
  });

  it('aborting a download stream emits "close" and cleans up cursor', async () => {
    const bucket = new GridFSBucket(db, { bucketName: 'gridfsdestroy', chunkSizeBytes: 10 });
    const readStream = fs.createReadStream('./LICENSE.md');
    const uploadStream = bucket.openUploadStream('LICENSE.md');
    await pipeline(readStream, uploadStream);

    const downloadStream = bucket.openDownloadStream(uploadStream.gridFSFile._id);
    const downloadClose = once(downloadStream, 'close');
    await downloadStream.abort();

    await downloadClose;
    expect(downloadStream.s.cursor).to.not.exist;
  });

  it('find()', async function () {
    const bucket = new GridFSBucket(db, { bucketName: 'fs' });

    // We're only making sure this doesn't throw
    bucket.find({
      batchSize: 1,
      limit: 2,
      maxTimeMS: 3,
      noCursorTimeout: true,
      skip: 4,
      sort: { _id: 1 }
    });
  });

  it('drop example', async function () {
    const bucket = new GridFSBucket(db, { bucketName: 'gridfsdownload' });
    const CHUNKS_COLL = 'gridfsdownload.chunks';
    const FILES_COLL = 'gridfsdownload.files';
    const readStream = fs.createReadStream('./LICENSE.md');

    const uploadStream = bucket.openUploadStream('test.dat');
    const id = uploadStream.id;

    await pipeline(readStream, uploadStream);

    await bucket.drop();

    const chunks = await db.collection(CHUNKS_COLL).find({ files_id: id }).toArray();
    expect(chunks.length).to.equal(0);

    const files = await db.collection(FILES_COLL).find({ _id: id }).toArray();
    expect(files.length).to.equal(0);
  });

  /*
   * Find all associates files with a bucket
   *
   * @example-class GridFSBucket
   * @example-method find
   */
  it('find example', {
    metadata: { requires: { topology: ['single'] } },

    async test() {
      const bucket = new GridFSBucket(db, { bucketName: 'gridfsdownload_2' });
      const readStream = fs.createReadStream('./LICENSE.md');

      const uploadStream = bucket.openUploadStream('test.dat');

      await pipeline(readStream, uploadStream);

      const files = await bucket.find({}, { batchSize: 1 }).toArray();
      expect(files.length).to.equal(1);
    }
  });

  /**
   * Rename a file
   *
   * @example-class GridFSBucket
   * @example-method rename
   */
  it('rename example', {
    metadata: { requires: { topology: ['single'] } },

    async test() {
      const bucket = new GridFSBucket(db, { bucketName: 'gridfsdownload_3' });
      const readStream = fs.createReadStream('./LICENSE.md');

      const uploadStream = bucket.openUploadStream('test.dat');
      const id = uploadStream.id;

      await pipeline(readStream, uploadStream);

      // Rename the file
      await bucket.rename(id, 'renamed_it.dat');
    }
  });

  it('download empty doc', {
    metadata: { requires: { topology: ['single'] } },

    async test() {
      const bucket = new GridFSBucket(db, { bucketName: 'fs' });

      const result = await db.collection('fs.files').insertMany([{ length: 0 }]);
      expect(Object.keys(result.insertedIds).length).to.equal(1);
      const id = result.insertedIds[0];

      const stream = bucket.openDownloadStream(id);

      const onError = sinon.spy();
      const onData = sinon.spy();

      stream.on('error', onError);
      stream.on('data', onData);

      await finished(stream);

      expect(onError.notCalled).to.equal(true);
      expect(onData.notCalled).to.equal(true);

      // As per spec, make sure we didn't actually fire a query
      // because the document length is 0
      expect(stream.s.cursor).to.not.exist;
    }
  });

  it('should use chunkSize for download', {
    metadata: { requires: { topology: ['single'] } },

    async test() {
      const bucket = new GridFSBucket(db, { bucketName: 'gridfs' });

      const uploadStream = bucket.openUploadStream('test');
      uploadStream.end(Buffer.alloc(40 * 1024 * 1024));
      await finished(uploadStream);

      const range = {
        start: 35_191_617,
        end: 35_192_831
      };
      const downloadStream = bucket.openDownloadStreamByName('test', range);
      const outputStream = fs.createWriteStream('output');

      await pipeline(downloadStream, outputStream);
      const stats = fs.statSync('output');

      expect(range.end - range.start).to.equal(stats.size);
    }
  });

  it('should return only end - start bytes when the end is within a chunk', {
    metadata: { requires: { topology: ['single'] } },
    async test() {
      // Provide start and end parameters for file download to skip
      // ahead x bytes and limit the total amount of bytes read to n
      const start = 1;
      const end = 6;

      const bucket = new GridFSBucket(db, {
        bucketName: 'gridfsdownload',
        chunkSizeBytes: 20
      });

      const readStream = fs.createReadStream('./LICENSE.md');
      const uploadStream = bucket.openUploadStream('teststart.dat');

      await pipeline(readStream, uploadStream);

      const downloadStream = bucket.openDownloadStreamByName('teststart.dat', { start }).end(end);

      const str = await text(downloadStream);

      expect(str).to.equal('pache');
      expect(str).to.have.lengthOf(end - start);
    }
  });

  it('NODE-2623 downloadStream should emit error on end > size', async function () {
    const bucket = new GridFSBucket(db, { bucketName: 'gridfsdownload' });
    const readStream = fs.createReadStream('./LICENSE.md');

    const uploadStream = bucket.openUploadStream('test.dat');

    const actualSize = fs.fstatSync(fs.openSync('./LICENSE.md', 'r')).size;
    const wrongExpectedSize = Math.floor(actualSize * 1.1);

    const id = uploadStream.id;

    await pipeline(readStream, uploadStream);
    const downloadStream = bucket.openDownloadStream(id, { end: wrongExpectedSize });
    downloadStream.resume();

    const [error] = await once(downloadStream, 'error');
    expect(error.message).to.equal(
      `Stream end (${wrongExpectedSize}) must not be more than the length of the file (${actualSize})`
    );
  });
});
