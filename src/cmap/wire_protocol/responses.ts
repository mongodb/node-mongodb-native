import { type DeserializeOptions } from 'bson';

import { BSONType, type Document, type Timestamp } from '../../bson';
import { type ErrorDescription } from '../../error';
import { type ClusterTime } from '../../sdam/common';
import { OnDemandDocument } from './on_demand/document';

export class MongoDBResponse extends OnDemandDocument {
  // {ok:1}
  static empty = new MongoDBResponse(new Uint8Array([13, 0, 0, 0, 16, 111, 107, 0, 1, 0, 0, 0, 0]));

  /**
   * Drivers can safely assume that the `recoveryToken` field is always a BSON document but drivers MUST NOT modify the
   * contents of the document.
   */
  get recoveryToken(): Document | null {
    return (
      this.getValue('recoveryToken', BSONType.object)?.toObject({
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
      this.getValue('cursor', BSONType.object)?.getValue('atClusterTime', BSONType.timestamp) ??
      this.getValue('atClusterTime', BSONType.timestamp) ??
      null
    );
  }

  public get operationTime(): Timestamp | null {
    return this.getValue('operationTime', BSONType.timestamp);
  }

  public get ok(): 0 | 1 {
    return this.getNumber('ok') ? 1 : 0;
  }

  public get $err(): string | null {
    return this.getValue('$err', BSONType.string);
  }

  public get errmsg(): string | null {
    return this.getValue('errmsg', BSONType.string);
  }

  public get code(): number | null {
    return this.getNumber('code');
  }

  private clusterTime?: ClusterTime | null;
  public get $clusterTime(): ClusterTime | null {
    if (!('clusterTime' in this)) {
      const clusterTimeDoc = this.getValue('$clusterTime', BSONType.object);
      if (clusterTimeDoc == null) {
        this.clusterTime = null;
        return null;
      }
      const clusterTime = clusterTimeDoc.getValue('clusterTime', BSONType.timestamp, true);
      const signature = clusterTimeDoc.getValue('signature', BSONType.object)?.toObject();
      // @ts-expect-error: `signature` is incorrectly typed. It is public API.
      this.clusterTime = { clusterTime, signature };
    }
    return this.clusterTime ?? null;
  }

  public getWriteConcernError(bsonOptions?: DeserializeOptions): ErrorDescription | null {
    return this.getValue('writeConcernError', BSONType.object)?.toObject(bsonOptions) ?? null;
  }
}
