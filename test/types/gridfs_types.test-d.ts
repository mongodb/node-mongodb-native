import { Readable } from 'stream';
import { expectType } from 'tsd';

import type { GridFSBucket, GridFSBucketWriteStream } from '../mongodb';

(function test(bucket: GridFSBucket) {
  const readable = new Readable();

  const uploadStream = bucket.openUploadStream('test');
  expectType<GridFSBucketWriteStream>(uploadStream);

  // should be pipeable as a WriteStream
  readable.pipe(uploadStream);
})({} as GridFSBucket);
