import type { Document } from '../bson';
import type { Collection } from '../collection';
import type { Db } from '../db';
import type { Server } from '../sdam/server';
import type { ClientSession } from '../sessions';
import type { Callback } from '../utils';
import { CommandOperation, CommandOperationOptions } from './command';
import { Aspect, defineAspects } from './operation';

/** @public */
export interface CollStatsOptions extends CommandOperationOptions {
  /** Divide the returned sizes by scale value. */
  scale?: number;
}

/**
 * Get all the collection statistics.
 * @internal
 */
export class CollStatsOperation extends CommandOperation<Document> {
  options: CollStatsOptions;
  collectionName: string;

  /**
   * Construct a Stats operation.
   *
   * @param collection - Collection instance
   * @param options - Optional settings. See Collection.prototype.stats for a list of options.
   */
  constructor(collection: Collection, options?: CollStatsOptions) {
    super(collection, options);
    this.options = options ?? {};
    this.collectionName = collection.collectionName;
  }

  execute(server: Server, session: ClientSession, callback: Callback<CollStats>): void {
    const command: Document = { collStats: this.collectionName };
    if (this.options.scale != null) {
      command.scale = this.options.scale;
    }

    super.executeCommand(server, session, command, callback);
  }
}

/** @public */
export interface DbStatsOptions extends CommandOperationOptions {
  /** Divide the returned sizes by scale value. */
  scale?: number;
}

/** @internal */
export class DbStatsOperation extends CommandOperation<Document> {
  options: DbStatsOptions;

  constructor(db: Db, options: DbStatsOptions) {
    super(db, options);
    this.options = options;
  }

  execute(server: Server, session: ClientSession, callback: Callback<Document>): void {
    const command: Document = { dbStats: true };
    if (this.options.scale != null) {
      command.scale = this.options.scale;
    }

    super.executeCommand(server, session, command, callback);
  }
}

/**
 * @public
 * @see https://docs.mongodb.org/manual/reference/command/collStats/
 */
export interface CollStats extends Document {
  /** Namespace */
  ns: string;
  /** Number of documents */
  count: number;
  /** Collection size in bytes */
  size: number;
  /** Average object size in bytes */
  avgObjSize: number;
  /** (Pre)allocated space for the collection in bytes */
  storageSize: number;
  /** Number of extents (contiguously allocated chunks of datafile space) */
  numExtents: number;
  /** Number of indexes */
  nindexes: number;
  /** Size of the most recently created extent in bytes */
  lastExtentSize: number;
  /** Padding can speed up updates if documents grow */
  paddingFactor: number;
  /** A number that indicates the user-set flags on the collection. userFlags only appears when using the mmapv1 storage engine */
  userFlags?: number;
  /** Total index size in bytes */
  totalIndexSize: number;
  /** Size of specific indexes in bytes */
  indexSizes: {
    _id_: number;
    [index: string]: number;
  };
  /** `true` if the collection is capped */
  capped: boolean;
  /** The maximum number of documents that may be present in a capped collection */
  max: number;
  /** The maximum size of a capped collection */
  maxSize: number;
  /** This document contains data reported directly by the WiredTiger engine and other data for internal diagnostic use */
  wiredTiger?: WiredTigerData;
  /** The fields in this document are the names of the indexes, while the values themselves are documents that contain statistics for the index provided by the storage engine */
  indexDetails?: any;
  ok: number;

  /** The amount of storage available for reuse. The scale argument affects this value. */
  freeStorageSize?: number;
  /** An array that contains the names of the indexes that are currently being built on the collection */
  indexBuilds?: number;
  /** The sum of the storageSize and totalIndexSize. The scale argument affects this value */
  totalSize: number;
  /** The scale value used by the command. */
  scaleFactor: number;
}

/** @public */
export interface WiredTigerData extends Document {
  LSM: {
    'bloom filter false positives': number;
    'bloom filter hits': number;
    'bloom filter misses': number;
    'bloom filter pages evicted from cache': number;
    'bloom filter pages read into cache': number;
    'bloom filters in the LSM tree': number;
    'chunks in the LSM tree': number;
    'highest merge generation in the LSM tree': number;
    'queries that could have benefited from a Bloom filter that did not exist': number;
    'sleep for LSM checkpoint throttle': number;
    'sleep for LSM merge throttle': number;
    'total size of bloom filters': number;
  } & Document;
  'block-manager': {
    'allocations requiring file extension': number;
    'blocks allocated': number;
    'blocks freed': number;
    'checkpoint size': number;
    'file allocation unit size': number;
    'file bytes available for reuse': number;
    'file magic number': number;
    'file major version number': number;
    'file size in bytes': number;
    'minor version number': number;
  };
  btree: {
    'btree checkpoint generation': number;
    'column-store fixed-size leaf pages': number;
    'column-store internal pages': number;
    'column-store variable-size RLE encoded values': number;
    'column-store variable-size deleted values': number;
    'column-store variable-size leaf pages': number;
    'fixed-record size': number;
    'maximum internal page key size': number;
    'maximum internal page size': number;
    'maximum leaf page key size': number;
    'maximum leaf page size': number;
    'maximum leaf page value size': number;
    'maximum tree depth': number;
    'number of key/value pairs': number;
    'overflow pages': number;
    'pages rewritten by compaction': number;
    'row-store internal pages': number;
    'row-store leaf pages': number;
  } & Document;
  cache: {
    'bytes currently in the cache': number;
    'bytes read into cache': number;
    'bytes written from cache': number;
    'checkpoint blocked page eviction': number;
    'data source pages selected for eviction unable to be evicted': number;
    'hazard pointer blocked page eviction': number;
    'in-memory page passed criteria to be split': number;
    'in-memory page splits': number;
    'internal pages evicted': number;
    'internal pages split during eviction': number;
    'leaf pages split during eviction': number;
    'modified pages evicted': number;
    'overflow pages read into cache': number;
    'overflow values cached in memory': number;
    'page split during eviction deepened the tree': number;
    'page written requiring lookaside records': number;
    'pages read into cache': number;
    'pages read into cache requiring lookaside entries': number;
    'pages requested from the cache': number;
    'pages written from cache': number;
    'pages written requiring in-memory restoration': number;
    'tracked dirty bytes in the cache': number;
    'unmodified pages evicted': number;
  } & Document;
  cache_walk: {
    'Average difference between current eviction generation when the page was last considered': number;
    'Average on-disk page image size seen': number;
    'Clean pages currently in cache': number;
    'Current eviction generation': number;
    'Dirty pages currently in cache': number;
    'Entries in the root page': number;
    'Internal pages currently in cache': number;
    'Leaf pages currently in cache': number;
    'Maximum difference between current eviction generation when the page was last considered': number;
    'Maximum page size seen': number;
    'Minimum on-disk page image size seen': number;
    'On-disk page image sizes smaller than a single allocation unit': number;
    'Pages created in memory and never written': number;
    'Pages currently queued for eviction': number;
    'Pages that could not be queued for eviction': number;
    'Refs skipped during cache traversal': number;
    'Size of the root page': number;
    'Total number of pages currently in cache': number;
  } & Document;
  compression: {
    'compressed pages read': number;
    'compressed pages written': number;
    'page written failed to compress': number;
    'page written was too small to compress': number;
    'raw compression call failed, additional data available': number;
    'raw compression call failed, no additional data available': number;
    'raw compression call succeeded': number;
  } & Document;
  cursor: {
    'bulk-loaded cursor-insert calls': number;
    'create calls': number;
    'cursor-insert key and value bytes inserted': number;
    'cursor-remove key bytes removed': number;
    'cursor-update value bytes updated': number;
    'insert calls': number;
    'next calls': number;
    'prev calls': number;
    'remove calls': number;
    'reset calls': number;
    'restarted searches': number;
    'search calls': number;
    'search near calls': number;
    'truncate calls': number;
    'update calls': number;
  };
  reconciliation: {
    'dictionary matches': number;
    'fast-path pages deleted': number;
    'internal page key bytes discarded using suffix compression': number;
    'internal page multi-block writes': number;
    'internal-page overflow keys': number;
    'leaf page key bytes discarded using prefix compression': number;
    'leaf page multi-block writes': number;
    'leaf-page overflow keys': number;
    'maximum blocks required for a page': number;
    'overflow values written': number;
    'page checksum matches': number;
    'page reconciliation calls': number;
    'page reconciliation calls for eviction': number;
    'pages deleted': number;
  } & Document;
}

defineAspects(CollStatsOperation, [Aspect.READ_OPERATION]);
defineAspects(DbStatsOperation, [Aspect.READ_OPERATION]);
