import {
  type BSONElement,
  type BSONSerializeOptions,
  BSONType,
  type Document,
  Long,
  parseToElementsToArray,
  type Timestamp
} from '../../bson';
import { MongoUnexpectedServerResponseError } from '../../error';
import { type ClusterTime } from '../../sdam/common';
import { type MongoDBNamespace, ns } from '../../utils';
import { OnDemandDocument } from './on_demand/document';

// eslint-disable-next-line no-restricted-syntax
const enum BSONElementOffset {
  type = 0,
  nameOffset = 1,
  nameLength = 2,
  offset = 3,
  length = 4
}
/**
 * Accepts a BSON payload and checks for na "ok: 0" element.
 * This utility is intended to prevent calling response class constructors
 * that expect the result to be a success and demand certain properties to exist.
 *
 * For example, a cursor response always expects a cursor embedded document.
 * In order to write the class such that the properties reflect that assertion (non-null)
 * we cannot invoke the subclass constructor if the BSON represents an error.
 *
 * @param bytes - BSON document returned from the server
 */
export function isErrorResponse(bson: Uint8Array, elements: BSONElement[]): boolean {
  for (let eIdx = 0; eIdx < elements.length; eIdx++) {
    const element = elements[eIdx];

    if (element[BSONElementOffset.nameLength] === 2) {
      const nameOffset = element[BSONElementOffset.nameOffset];

      // 111 == "o", 107 == "k"
      if (bson[nameOffset] === 111 && bson[nameOffset + 1] === 107) {
        const valueOffset = element[BSONElementOffset.offset];
        const valueLength = element[BSONElementOffset.length];

        // If any byte in the length of the ok number (works for any type) is non zero,
        // then it is considered "ok: 1"
        for (let i = valueOffset; i < valueOffset + valueLength; i++) {
          if (bson[i] !== 0x00) return false;
        }

        return true;
      }
    }
  }

  return true;
}

/** @internal */
export type MongoDBResponseConstructor = {
  new (bson: Uint8Array, offset?: number, isArray?: boolean): MongoDBResponse;
  make(bson: Uint8Array): MongoDBResponse;
};

/** @internal */
export class MongoDBResponse extends OnDemandDocument {
  static is(value: unknown): value is MongoDBResponse {
    return value instanceof MongoDBResponse;
  }

  static make(bson: Uint8Array) {
    const elements = parseToElementsToArray(bson, 0);
    const isError = isErrorResponse(bson, elements);
    return isError
      ? new MongoDBResponse(bson, 0, false, elements)
      : new this(bson, 0, false, elements);
  }

  // {ok:1}
  static empty = new MongoDBResponse(new Uint8Array([13, 0, 0, 0, 16, 111, 107, 0, 1, 0, 0, 0, 0]));

  /** Indicates this document is a server error */
  public get isError() {
    let isError = this.ok === 0;
    isError ||= this.has('errmsg');
    isError ||= this.has('code');
    isError ||= this.has('$err'); // The '$err' field is used in OP_REPLY responses
    return isError;
  }

  /**
   * Drivers can safely assume that the `recoveryToken` field is always a BSON document but drivers MUST NOT modify the
   * contents of the document.
   */
  get recoveryToken(): Document | null {
    return (
      this.get('recoveryToken', BSONType.object)?.toObject({
        promoteValues: false,
        promoteLongs: false,
        promoteBuffers: false
      }) ?? null
    );
  }

  /**
   * The server creates a cursor in response to a snapshot find/aggregate command and reports atClusterTime within the cursor field in the response.
   * For the distinct command the server adds a top-level atClusterTime field to the response.
   * The atClusterTime field represents the timestamp of the read and is guaranteed to be majority committed.
   */
  public get atClusterTime(): Timestamp | null {
    return (
      this.get('cursor', BSONType.object)?.get('atClusterTime', BSONType.timestamp) ??
      this.get('atClusterTime', BSONType.timestamp)
    );
  }

  public get operationTime(): Timestamp | null {
    return this.get('operationTime', BSONType.timestamp);
  }

  public get ok(): 0 | 1 {
    return this.getNumber('ok') ? 1 : 0;
  }

  public get $err(): string | null {
    return this.get('$err', BSONType.string);
  }

  public get errmsg(): string | null {
    return this.get('errmsg', BSONType.string);
  }

  public get code(): number | null {
    return this.getNumber('code');
  }

  private clusterTime?: ClusterTime | null;
  public get $clusterTime(): ClusterTime | null {
    if (!('clusterTime' in this)) {
      const clusterTimeDoc = this.get('$clusterTime', BSONType.object);
      if (clusterTimeDoc == null) {
        this.clusterTime = null;
        return null;
      }
      const clusterTime = clusterTimeDoc.get('clusterTime', BSONType.timestamp, true);
      const signature = clusterTimeDoc.get('signature', BSONType.object)?.toObject();
      // @ts-expect-error: `signature` is incorrectly typed. It is public API.
      this.clusterTime = { clusterTime, signature };
    }
    return this.clusterTime ?? null;
  }

  public override toObject(options?: BSONSerializeOptions): Record<string, any> {
    const exactBSONOptions = {
      useBigInt64: options?.useBigInt64,
      promoteLongs: options?.promoteLongs,
      promoteValues: options?.promoteValues,
      promoteBuffers: options?.promoteBuffers,
      bsonRegExp: options?.bsonRegExp,
      raw: options?.raw ?? false,
      fieldsAsRaw: options?.fieldsAsRaw ?? {},
      validation: this.parseBsonSerializationOptions(options)
    };
    return super.toObject(exactBSONOptions);
  }

  private parseBsonSerializationOptions(options?: { enableUtf8Validation?: boolean }): {
    utf8: { writeErrors: false } | false;
  } {
    const enableUtf8Validation = options?.enableUtf8Validation;
    if (enableUtf8Validation === false) {
      return { utf8: false };
    }
    return { utf8: { writeErrors: false } };
  }
}

/** @internal */
export class CursorResponse extends MongoDBResponse {
  /**
   * This supports a feature of the FindCursor.
   * It is an optimization to avoid an extra getMore when the limit has been reached
   */
  static emptyGetMore = { id: new Long(0), length: 0, shift: () => null };

  static override is(value: unknown): value is CursorResponse {
    return value instanceof CursorResponse || value === CursorResponse.emptyGetMore;
  }

  public id: Long;
  public ns: MongoDBNamespace | null = null;
  public batchSize = 0;

  private batch: OnDemandDocument;
  private iterated = 0;

  constructor(bytes: Uint8Array, offset?: number, isArray?: boolean) {
    super(bytes, offset, isArray);

    const cursor = this.get('cursor', BSONType.object, true);

    const id = cursor.get('id', BSONType.long, true);
    this.id = new Long(Number(id & 0xffff_ffffn), Number((id >> 32n) & 0xffff_ffffn));

    const namespace = cursor.get('ns', BSONType.string);
    if (namespace != null) this.ns = ns(namespace);

    if (cursor.has('firstBatch')) this.batch = cursor.get('firstBatch', BSONType.array, true);
    else if (cursor.has('nextBatch')) this.batch = cursor.get('nextBatch', BSONType.array, true);
    else throw new MongoUnexpectedServerResponseError('Cursor document did not contain a batch');

    this.batchSize = this.batch.size();
  }

  get length() {
    return Math.max(this.batchSize - this.iterated, 0);
  }

  shift(options?: BSONSerializeOptions): any {
    if (this.iterated >= this.batchSize) {
      return null;
    }

    const result = this.batch.get(this.iterated, BSONType.object, true) ?? null;
    this.iterated += 1;

    if (options?.raw) {
      return result.toBytes();
    } else {
      return result.toObject(options);
    }
  }

  clear() {
    this.iterated = this.batchSize;
  }

  pushMany() {
    throw new Error('pushMany Unsupported method');
  }

  push() {
    throw new Error('push Unsupported method');
  }
}
