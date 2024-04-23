import {
  type BSONSerializeOptions,
  BSONType,
  type Document,
  Long,
  type Timestamp
} from '../../bson';
import { MongoUnexpectedServerResponseError } from '../../error';
import { type ClusterTime } from '../../sdam/common';
import { type MongoDBNamespace, ns } from '../../utils';
import { OnDemandDocument } from './on_demand/document';

/** @internal */
export type MongoDBResponseConstructor = {
  new (bson: Uint8Array, offset?: number, isArray?: boolean): MongoDBResponse;
};

/** @internal */
export class MongoDBResponse extends OnDemandDocument {
  static is(value: unknown): value is MongoDBResponse {
    return value instanceof MongoDBResponse;
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
   * This is a BSON document containing the following:
   * ```
   * { ok: 1, cursor: { id: 0n, nextBatch: new Array(0) } }
   * ```
   * This is used when the client side findCursor is closed by tracking the number returned and limit
   * to avoid an extra round trip. It provides a cursor response that the server _would_ return _if_
   * that round trip were to be made.
   */
  static emptyGetMore = new CursorResponse(
    Buffer.from(
      'NgAAABBvawABAAAAA2N1cnNvcgAhAAAAEmlkAAAAAAAAAAAABG5leHRCYXRjaAAFAAAAAAAA',
      'base64'
    )
  );

  static override is(value: unknown): value is CursorResponse {
    return value instanceof CursorResponse;
  }

  public id: Long | null = null;
  public ns: MongoDBNamespace | null = null;
  public batchSize = 0;

  private batch: OnDemandDocument | null = null;
  private values: Generator<OnDemandDocument, void, void> | null = null;
  private iterated = 0;

  constructor(b: Uint8Array, o?: number, a?: boolean) {
    super(b, o, a);

    if (this.isError) return;

    const cursor = this.get('cursor', BSONType.object, true);

    const id = cursor.get('id', BSONType.long, true);
    this.id = new Long(Number(id & 0xffff_ffffn), Number((id >> 32n) & 0xffff_ffffn));

    const namespace = cursor.get('ns', BSONType.string) ?? '';
    if (namespace) this.ns = ns(namespace);

    if (cursor.has('firstBatch')) this.batch = cursor.get('firstBatch', BSONType.array, true);
    else if (cursor.has('nextBatch')) this.batch = cursor.get('nextBatch', BSONType.array, true);
    else throw new MongoUnexpectedServerResponseError('Cursor document did not contain a batch');

    this.batchSize = this.batch.size();
  }

  get length() {
    return Math.max(this.batchSize - this.iterated, 0);
  }

  shift(options?: BSONSerializeOptions): any {
    this.iterated += 1;
    this.values ??= this.batch?.valuesAs(BSONType.object) ?? null;
    const result = this.values?.next();
    if (!result || result.done) return null;
    if (options?.raw) {
      return result.value.toBytes();
    } else {
      return result.value.toObject(options);
    }
  }

  clear() {
    this.iterated = this.batchSize;
    this.values?.return();
  }

  pushMany() {
    throw new Error('pushMany Unsupported method');
  }

  push() {
    throw new Error('push Unsupported method');
  }
}
