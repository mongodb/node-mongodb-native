import { WriteConcern } from '../write_concern';
import type { ObjectID, Timestamp, Binary, Long } from 'bson';
import type { Callback, Document } from '../types';
import type { CommandResult } from './commands';

/** ismaster command response */
export interface MongoDBInitialResponse {
  ok: 0 | 1;
  ismaster: boolean;
  topologyVersion?: {
    processId: ObjectID;
    counter: number;
  };
  maxBsonObjectSize: number;
  maxMessageSizeBytes: number;
  maxWriteBatchSize: number;
  localTime: Date;
  logicalSessionTimeoutMinutes: number;
  connectionId: number;
  minWireVersion: number;
  maxWireVersion: number;
  readOnly: boolean;
  compression?: string[];
  saslSupportedMechs?: string[];
  msg?: {
    isdbgrid: number;
    hostname: string;
    ok: 0 | 1;
  };
  hosts?: string[];
  setName?: string;
  setVersion?: number;
  secondary?: boolean;
  passives?: string[];
  arbiters?: string[];
  primary?: string;
  arbiterOnly?: boolean;
  passive?: boolean;
  tags?: {
    [tag: string]: string;
  };
  me?: string;
  electionId?: ObjectID;
  lastWrite?: {
    opTime: Document;
    lastWriteDate: Date;
    majorityOpTime: Document;
    majorityWriteDate: Date;
  };
}

export interface ClusterTimeResponse {
  clusterTime: Timestamp;
  signature: {
    hash: Binary;
    keyId: Long;
  };
}

export interface OperationDescription {
  started: number;
  cb: Callback<CommandResult | null>;
  command: boolean;
  documentsReturnedIn?: unknown;
  fullResult: boolean;
  noResponse: boolean;
  promoteBuffers: boolean;
  promoteLongs: boolean;
  promoteValues: boolean;
  raw: boolean;
  requestId: number;
  session?: unknown;
  socketTimeoutOverride: boolean;
  agreedCompressor?: 'zlib' | 'snappy' | string;
  zlibCompressionLevel?: number;
  $clusterTime?: ClusterTimeResponse;
}

export interface CommandOptions {
  [key: string]: unknown;
  writeConcern?: WriteConcern;
  raw?: boolean;
  promoteLongs?: boolean;
  promoteValues?: boolean;
  promoteBuffers?: boolean;
  monitoring?: boolean;
  fullResult?: boolean;
  socketTimeout?: number;
  session?: any;
  documentsReturnedIn?: string;
}
