import { Callback, maybePromise, MongoDBNamespace } from '../utils';
import { Long, Document, BSONSerializeOptions } from '../bson';
import { ClientSession } from '../sessions';
import { MongoError } from '../error';
import { ReadPreference, ReadPreferenceLike } from '../read_preference';
import type { Server } from '../sdam/server';
import type { CursorCloseOptions } from './cursor';
import type { Topology } from '../sdam/topology';
import type { EachCallback } from '../operations/cursor_ops';

const kId = Symbol('id');
const kDocuments = Symbol('documents');
const kServer = Symbol('server');
const kSession = Symbol('session');
const kNamespace = Symbol('namespace');
const kTopology = Symbol('topology');
const kReadPreference = Symbol('readPreference');
const kBatchSize = Symbol('batchSize');
const kMaxTimeMs = Symbol('maxTimeMs');

export interface AbstractCursorOptions extends BSONSerializeOptions {
  readPreference?: ReadPreferenceLike;
  session?: ClientSession;

  batchSize?: number;
  maxTimeMS?: number;
  comment?: Document | string;
}

export abstract class AbstractCursor {
  [kServer]?: Server;
  [kId]?: Long;
  [kNamespace]: MongoDBNamespace;
  [kDocuments]: Document[];
  [kSession]?: ClientSession;
  [kTopology]: Topology;
  [kReadPreference]: ReadPreference;

  [kBatchSize]?: number;
  [kMaxTimeMs]?: number;
  comment?: Document | string;

  constructor(topology: Topology, ns: MongoDBNamespace, options: AbstractCursorOptions = {}) {
    this[kTopology] = topology;
    this[kNamespace] = ns;
    this[kDocuments] = []; // TODO: https://github.com/microsoft/TypeScript/issues/36230
    this[kReadPreference] =
      options.readPreference && options.readPreference instanceof ReadPreference
        ? options.readPreference
        : ReadPreference.primary;

    if (options.session instanceof ClientSession) {
      this[kSession] = options.session;
    }

    if (typeof options.batchSize === 'number') {
      this[kBatchSize] = options.batchSize;
    }

    if (typeof options.maxTimeMS === 'number') {
      this[kMaxTimeMs] = options.maxTimeMS;
    }

    if (typeof options.comment !== 'undefined') {
      this.comment = options.comment;
    }
  }

  get id(): Long | undefined {
    return this[kId];
  }

  get topology(): Topology {
    return this[kTopology];
  }

  get namespace(): MongoDBNamespace {
    return this[kNamespace];
  }

  get session(): ClientSession | undefined {
    return this[kSession];
  }

  batchSize(value: number): this {
    if (typeof value !== 'number') {
      throw new MongoError('batchSize requires an integer');
    }

    this[kBatchSize] = value;
    return this;
  }

  maxTimeMs(value: number): this {
    if (typeof value !== 'number') {
      throw new MongoError('maxTimeMs requires an integer');
    }

    this[kMaxTimeMs] = value;
    return this;
  }

  hasNext(): Promise<boolean>;
  hasNext(callback: Callback<boolean>): void;
  hasNext(callback?: Callback<boolean>): Promise<boolean> | void {
    return maybePromise(callback, done => {
      if (this[kId] === Long.ZERO) {
        return done(undefined, false);
      }

      if (this[kDocuments].length) {
        return done(undefined, true);
      }

      next(this, (err, doc) => {
        if (err) return done(err);

        if (doc) {
          this[kDocuments].unshift(doc);
          done(undefined, true);
          return;
        }

        done(undefined, false);
      });
    });
  }

  /** Get the next available document from the cursor, returns null if no more documents are available. */
  next(): Promise<Document | null>;
  next(callback: Callback<Document | null>): void;
  next(callback?: Callback<Document | null>): Promise<Document | null> | void {
    return maybePromise(callback, done => {
      if (this[kId] === Long.ZERO) {
        return done(new MongoError('Cursor is exhausted'));
      }

      next(this, done);
    });
  }

  close(): void;
  close(callback: Callback): void;
  close(options: CursorCloseOptions): Promise<void>;
  close(options: CursorCloseOptions, callback: Callback): void;
  close(options?: CursorCloseOptions | Callback, callback?: Callback): Promise<void> | void {
    if (typeof options === 'function') (callback = options), (options = {});
    options = options || {};

    return maybePromise(callback, done => {
      const cursorId = this[kId];
      const cursorNs = this[kNamespace];
      const server = this[kServer];
      const session = this[kSession];

      if (cursorId == null || server == null || cursorId.isZero()) {
        return done();
      }

      // TODO: bson options
      server.killCursors(cursorNs.toString(), [cursorId], { session }, done);
    });
  }

  /**
   * Returns an array of documents. The caller is responsible for making sure that there
   * is enough memory to store the results. Note that the array only contains partial
   * results when this cursor had been previously accessed. In that case,
   * cursor.rewind() can be used to reset the cursor.
   *
   * @param callback - The result callback.
   */
  toArray(): Promise<Document[]>;
  toArray(callback: Callback<Document[]>): void;
  toArray(callback?: Callback<Document[]>): Promise<Document[]> | void {
    return maybePromise(callback, done => {
      const docs: Document[] = [];
      const fetchDocs = () => {
        next(this, (err, doc) => {
          if (err) return done(err);
          if (doc == null) return done(undefined, docs);

          docs.push(doc);
          const internalDocs = this[kDocuments].splice(0, this[kDocuments].length);
          if (internalDocs) {
            docs.push(...internalDocs);
          }

          fetchDocs();
        });
      };

      fetchDocs();
    });
  }

  /**
   * Iterates over all the documents for this cursor. As with `cursor.toArray`,
   * not all of the elements will be iterated if this cursor had been previously accessed.
   * In that case, `cursor.rewind` can be used to reset the cursor. However, unlike
   * `cursor.toArray`, the cursor will only hold a maximum of batch size elements
   * at any given time if batch size is specified. Otherwise, the caller is responsible
   * for making sure that the entire result can fit the memory.
   *
   * @deprecated Please use {@link Cursor.forEach} instead
   */
  each(callback: EachCallback): void {
    each(this, callback);
  }

  /**
   * Iterates over all the documents for this cursor using the iterator, callback pattern.
   *
   * @param iterator - The iteration callback.
   * @param callback - The end callback.
   */
  forEach(iterator: (doc: Document) => void): Promise<Document>;
  forEach(iterator: (doc: Document) => void, callback: Callback): void;
  forEach(iterator: (doc: Document) => void, callback?: Callback): Promise<Document> | void {
    if (typeof iterator !== 'function') {
      throw new TypeError('Missing required parameter `iterator`');
    }

    return maybePromise(callback, done => {
      each(this, (err, doc) => {
        if (err) return done(err);
        if (doc != null) return iterator(doc);
        done();
      });
    });
  }

  /* @internal */
  abstract _initialize(server: Server, callback: Callback<Document>): void;
}

function next(cursor: AbstractCursor, callback: Callback<Document | null>): void {
  const cursorId = cursor[kId];
  const cursorNs = cursor[kNamespace];
  const topology = cursor[kTopology];
  const server = cursor[kServer];
  const readPreference = cursor[kReadPreference];

  if (cursorId == null) {
    topology.selectServer(readPreference, (err, server) => {
      if (err || !server) return callback(err);
      cursor[kServer] = server;
      // TODO: session

      cursor._initialize(server, (err, response) => {
        if (response && response.cursor) {
          const cursorId =
            typeof response.cursor.id === 'number'
              ? Long.fromNumber(response.cursor.id)
              : response.cursor.id;

          cursor[kDocuments] = response.cursor.firstBatch;
          cursor[kId] = cursorId;
        }

        // FIXME: temporary hack for explain
        if (response && response.stages) {
          callback(err, response);
          return;
        }

        if (err || (cursor.id && cursor.id.isZero())) {
          callback(err, cursor[kDocuments].length ? cursor[kDocuments].shift() : null);
          // this._endSession(() => callback(err, null));
          return;
        }

        callback(err, cursor[kDocuments].length ? cursor[kDocuments].shift() : null);
      });
    });

    return;
  }

  if (cursor[kDocuments].length) {
    callback(undefined, cursor[kDocuments].shift());
    return;
  }

  if (cursorId.isZero()) {
    callback(undefined, null);
    return;
  }

  // otherwise need to call getMore
  if (server == null) {
    callback(new MongoError('unable to iterate cursor without pinned server'));
    return;
  }

  server.getMore(
    cursorNs.toString(),
    cursorId,
    {
      session: cursor[kSession],
      batchSize: cursor[kBatchSize],
      maxTimeMS: cursor[kMaxTimeMs],
      comment: cursor.comment
    },
    (err, response) => {
      if (response) {
        const cursorId =
          typeof response.cursor.id === 'number'
            ? Long.fromNumber(response.cursor.id)
            : response.cursor.id;

        cursor[kDocuments] = response.cursor.nextBatch;
        cursor[kId] = cursorId;
      }

      if (err || (cursor.id && cursor.id.isZero())) {
        callback(err, cursor[kDocuments].length ? cursor[kDocuments].shift() : null);
        // this._endSession(() => callback(err, null));
        return;
      }

      callback(err, cursor[kDocuments].length ? cursor[kDocuments].shift() : null);
    }
  );
}

function each(cursor: AbstractCursor, callback: EachCallback): void {
  if (!callback) throw new MongoError('callback is mandatory');

  cursor.next((err, item) => {
    if (err) return callback(err);
    if (item == null) {
      return cursor.close({ skipKillCursors: true }, () => callback(undefined, null));
    }

    if (callback(undefined, item) === false) return;
    each(cursor, callback);
  });
}
