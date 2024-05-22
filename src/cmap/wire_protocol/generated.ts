import { BSONType, type Document, type Timestamp } from 'bson';
import { type OnDemandArray, type OnDemandDocument } from './on_demand/document';
import { type MongoDBResponse } from './responses';
export class Cursor {
  readonly id: bigint;
  readonly ns: string | null = null;
  readonly firstBatch: OnDemandArray | null = null;
  readonly nextBatch: OnDemandArray | null = null;
  readonly atClusterTime: Timestamp | null = null;
  constructor(private readonly response: MongoDBResponse) {
    this.id = this.response.get('id', BSONType.long, true);
    this.ns = this.response.get('ns', BSONType.string, false);
    this.firstBatch = this.response.get('firstBatch', BSONType.array, false);
    this.nextBatch = this.response.get('nextBatch', BSONType.array, false);
    this.atClusterTime = this.response.get('atClusterTime', BSONType.timestamp, false);
  }
}
export class ClusterTime {
  readonly clusterTime: Timestamp;
  readonly signature: Document | null = null;
  constructor(private readonly response: MongoDBResponse) {
    this.clusterTime = this.response.get('clusterTime', BSONType.timestamp, true);
    this.signature = this.response.get('signature', BSONType.object, false)?.toObject() ?? null;
  }
}
export class ServerResponse {
  private ___operationTime?: Timestamp | null;
  get operationTime(): Timestamp | null {
    if (!('___operationTime' in this))
      this.___operationTime = this.response.get('operationTime', BSONType.timestamp, false);
    return this.___operationTime ?? null;
  }
  private ___cursor?: Cursor | null;
  get cursor(): Cursor | null {
    if (!('___cursor' in this)) this.___cursor = new Cursor(this.response);
    return this.___cursor ?? null;
  }
  private ___atClusterTime?: Timestamp | null;
  get atClusterTime(): Timestamp | null {
    if (!('___atClusterTime' in this))
      this.___atClusterTime = this.response.get('atClusterTime', BSONType.timestamp, false);
    return this.___atClusterTime ?? null;
  }
  private ___$err?: string | null;
  get $err(): string | null {
    if (!('___$err' in this)) this.___$err = this.response.get('$err', BSONType.string, false);
    return this.___$err ?? null;
  }
  private ___errmsg?: string | null;
  get errmsg(): string | null {
    if (!('___errmsg' in this))
      this.___errmsg = this.response.get('errmsg', BSONType.string, false);
    return this.___errmsg ?? null;
  }
  private ___code?: number | null;
  get code(): number | null {
    if (!('___code' in this)) this.___code = this.response.getNumber('code', false);
    return this.___code ?? null;
  }
  private ___clusterTime?: ClusterTime | null;
  get clusterTime(): ClusterTime | null {
    if (!('___clusterTime' in this)) this.___clusterTime = new ClusterTime(this.response);
    return this.___clusterTime ?? null;
  }
  private ___recoveryToken?: Document | null;
  get recoveryToken(): Document | null {
    if (!('___recoveryToken' in this))
      this.___recoveryToken =
        this.response
          .get('recoveryToken', BSONType.object, false)
          ?.toObject({ promoteLongs: false, promoteValues: false, promoteBuffers: false }) ?? null;
    return this.___recoveryToken ?? null;
  }
  readonly ok: bigint;
  constructor(private readonly response: MongoDBResponse) {
    this.ok = this.response.get('ok', BSONType.long, true);
  }
}
export class Hello {
  readonly tags: OnDemandDocument | null = null;
  readonly minWireVersion: number | null = null;
  readonly maxWireVersion: number | null = null;
  readonly lastWriteDate: LastWrite | null = null;
  readonly hosts: OnDemandArray | null = null;
  readonly passives: OnDemandArray | null = null;
  readonly arbiters: OnDemandArray | null = null;
  readonly me: string | null = null;
  readonly setName: string | null = null;
  readonly setVersion: number | null = null;
  readonly electionId: number | null = null;
  constructor(private readonly response: MongoDBResponse) {
    this.tags = this.response.get('tags', BSONType.object, false);
    this.minWireVersion = this.response.getNumber('minWireVersion', false);
    this.maxWireVersion = this.response.getNumber('maxWireVersion', false);
    this.lastWriteDate = new LastWrite(this.response);
    this.hosts = this.response.get('hosts', BSONType.array, false);
    this.passives = this.response.get('passives', BSONType.array, false);
    this.arbiters = this.response.get('arbiters', BSONType.array, false);
    this.me = this.response.get('me', BSONType.string, false);
    this.setName = this.response.get('setName', BSONType.string, false);
    this.setVersion = this.response.getNumber('setVersion', false);
    this.electionId = this.response.getNumber('electionId', false);
  }
}
export class LastWrite {
  readonly lastWriteDate: number | null = null;
  constructor(private readonly response: MongoDBResponse) {
    this.lastWriteDate = this.response.getNumber('lastWriteDate', false);
  }
}
