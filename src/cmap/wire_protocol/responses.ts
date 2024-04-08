import { type BSONSerializeOptions, BSONType, type Document, type Timestamp } from '../../bson';
import { type ClusterTime } from '../../sdam/common';
import { OnDemandDocument } from './on_demand/document';

/** @internal */
export type MongoDBResponseConstructor = {
  new (bson: Uint8Array, offset?: number, isArray?: boolean): MongoDBResponse;
};

/** @internal */
export class MongoDBResponse extends OnDemandDocument {
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

  public override toObject(options: BSONSerializeOptions = {}): Record<string, any> {
    const exactBSONOptions = {
      useBigInt64: options.useBigInt64,
      promoteLongs: options.promoteLongs,
      promoteValues: options.promoteValues,
      promoteBuffers: options.promoteBuffers,
      bsonRegExp: options.bsonRegExp,
      raw: options.raw ?? false,
      fieldsAsRaw: options.fieldsAsRaw ?? {},
      validation: this.parseBsonSerializationOptions(options)
    };
    return super.toObject(exactBSONOptions);
  }

  private parseBsonSerializationOptions({ enableUtf8Validation }: BSONSerializeOptions): {
    utf8: { writeErrors: false } | false;
  } {
    if (enableUtf8Validation === false) {
      return { utf8: false };
    }

    return { utf8: { writeErrors: false } };
  }
}
