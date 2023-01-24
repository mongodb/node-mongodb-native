import type { ObjectId } from '../bson';
import type { Collection } from '../collection';
import type { FindCursor } from '../cursor/find_cursor';
import type { Db } from '../db';
import { MongoRuntimeError } from '../error';
import type { Logger } from '../logger';
import { Filter, TypedEventEmitter } from '../mongo_types';
import type { ReadPreference } from '../read_preference';
import type { Sort } from '../sort';
import { Callback, maybeCallback } from '../utils';
import { WriteConcern, WriteConcernOptions } from '../write_concern';
import type { FindOptions } from './../operations/find';
import {
  GridFSBucketReadStream,
  GridFSBucketReadStreamOptions,
  GridFSBucketReadStreamOptionsWithRevision,
  GridFSFile
} from './download';
import { GridFSBucketWriteStream, GridFSBucketWriteStreamOptions, GridFSChunk } from './upload';

const DEFAULT_GRIDFS_BUCKET_OPTIONS: {
  bucketName: string;
  chunkSizeBytes: number;
} = {
  bucketName: 'fs',
  chunkSizeBytes: 255 * 1024
};

/** @public */
export interface GridFSBucketOptions extends WriteConcernOptions {
  /** The 'files' and 'chunks' collections will be prefixed with the bucket name followed by a dot. */
  bucketName?: string;
  /** Number of bytes stored in each chunk. Defaults to 255KB */
  chunkSizeBytes?: number;
  /** Read preference to be passed to read operations */
  readPreference?: ReadPreference;
}

/** @internal */
export interface GridFSBucketPrivate {
  db: Db;
  options: {
    bucketName: string;
    chunkSizeBytes: number;
    readPreference?: ReadPreference;
    writeConcern: WriteConcern | undefined;
  };
  _chunksCollection: Collection<GridFSChunk>;
  _filesCollection: Collection<GridFSFile>;
  checkedIndexes: boolean;
  calledOpenUploadStream: boolean;
}

/** @public */
export type GridFSBucketEvents = {
  index(): void;
};

/**
 * Constructor for a streaming GridFS interface
 * @public
 */
export class GridFSBucket extends TypedEventEmitter<GridFSBucketEvents> {
  /** @internal */
  s: GridFSBucketPrivate;

  /**
   * When the first call to openUploadStream is made, the upload stream will
   * check to see if it needs to create the proper indexes on the chunks and
   * files collections. This event is fired either when 1) it determines that
   * no index creation is necessary, 2) when it successfully creates the
   * necessary indexes.
   * @event
   */
  static readonly INDEX = 'index' as const;

  constructor(db: Db, options?: GridFSBucketOptions) {
    super();
    this.setMaxListeners(0);
    const privateOptions = {
      ...DEFAULT_GRIDFS_BUCKET_OPTIONS,
      ...options,
      writeConcern: WriteConcern.fromOptions(options)
    };
    this.s = {
      db,
      options: privateOptions,
      _chunksCollection: db.collection<GridFSChunk>(privateOptions.bucketName + '.chunks'),
      _filesCollection: db.collection<GridFSFile>(privateOptions.bucketName + '.files'),
      checkedIndexes: false,
      calledOpenUploadStream: false
    };
  }

  /**
   * Returns a writable stream (GridFSBucketWriteStream) for writing
   * buffers to GridFS. The stream's 'id' property contains the resulting
   * file's id.
   *
   * @param filename - The value of the 'filename' key in the files doc
   * @param options - Optional settings.
   */

  openUploadStream(
    filename: string,
    options?: GridFSBucketWriteStreamOptions
  ): GridFSBucketWriteStream {
    return new GridFSBucketWriteStream(this, filename, options);
  }

  /**
   * Returns a writable stream (GridFSBucketWriteStream) for writing
   * buffers to GridFS for a custom file id. The stream's 'id' property contains the resulting
   * file's id.
   */
  openUploadStreamWithId(
    id: ObjectId,
    filename: string,
    options?: GridFSBucketWriteStreamOptions
  ): GridFSBucketWriteStream {
    return new GridFSBucketWriteStream(this, filename, { ...options, id });
  }

  /** Returns a readable stream (GridFSBucketReadStream) for streaming file data from GridFS. */
  openDownloadStream(
    id: ObjectId,
    options?: GridFSBucketReadStreamOptions
  ): GridFSBucketReadStream {
    return new GridFSBucketReadStream(
      this.s._chunksCollection,
      this.s._filesCollection,
      this.s.options.readPreference,
      { _id: id },
      options
    );
  }

  /**
   * Deletes a file with the given id
   *
   * @param id - The id of the file doc
   */
  delete(id: ObjectId): Promise<void>;
  /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
  delete(id: ObjectId, callback: Callback<void>): void;
  delete(id: ObjectId, callback?: Callback<void>): Promise<void> | void {
    return maybeCallback(async () => {
      const { deletedCount } = await this.s._filesCollection.deleteOne({ _id: id });

      // Delete orphaned chunks before returning FileNotFound
      await this.s._chunksCollection.deleteMany({ files_id: id });

      if (deletedCount === 0) {
        // TODO(NODE-3483): Replace with more appropriate error
        // Consider creating new error MongoGridFSFileNotFoundError
        throw new MongoRuntimeError(`File not found for id ${id}`);
      }
    }, callback);
  }

  /** Convenience wrapper around find on the files collection */
  find(filter?: Filter<GridFSFile>, options?: FindOptions): FindCursor<GridFSFile> {
    filter ??= {};
    options = options ?? {};
    return this.s._filesCollection.find(filter, options);
  }

  /**
   * Returns a readable stream (GridFSBucketReadStream) for streaming the
   * file with the given name from GridFS. If there are multiple files with
   * the same name, this will stream the most recent file with the given name
   * (as determined by the `uploadDate` field). You can set the `revision`
   * option to change this behavior.
   */
  openDownloadStreamByName(
    filename: string,
    options?: GridFSBucketReadStreamOptionsWithRevision
  ): GridFSBucketReadStream {
    let sort: Sort = { uploadDate: -1 };
    let skip = undefined;
    if (options && options.revision != null) {
      if (options.revision >= 0) {
        sort = { uploadDate: 1 };
        skip = options.revision;
      } else {
        skip = -options.revision - 1;
      }
    }
    return new GridFSBucketReadStream(
      this.s._chunksCollection,
      this.s._filesCollection,
      this.s.options.readPreference,
      { filename },
      { ...options, sort, skip }
    );
  }

  /**
   * Renames the file with the given _id to the given string
   *
   * @param id - the id of the file to rename
   * @param filename - new name for the file
   */
  rename(id: ObjectId, filename: string): Promise<void>;
  /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
  rename(id: ObjectId, filename: string, callback: Callback<void>): void;
  rename(id: ObjectId, filename: string, callback?: Callback<void>): Promise<void> | void {
    return maybeCallback(async () => {
      const filter = { _id: id };
      const update = { $set: { filename } };
      const { matchedCount } = await this.s._filesCollection.updateOne(filter, update);
      if (matchedCount === 0) {
        throw new MongoRuntimeError(`File with id ${id} not found`);
      }
    }, callback);
  }

  /** Removes this bucket's files collection, followed by its chunks collection. */
  drop(): Promise<void>;
  /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
  drop(callback: Callback<void>): void;
  drop(callback?: Callback<void>): Promise<void> | void {
    return maybeCallback(async () => {
      await this.s._filesCollection.drop();
      await this.s._chunksCollection.drop();
    }, callback);
  }

  /**
   * Get the Db scoped logger.
   *
   * @deprecated Legacy Logger is deprecated and will be removed in the next major version.
   */
  getLogger(): Logger {
    return this.s.db.s.logger;
  }
}
