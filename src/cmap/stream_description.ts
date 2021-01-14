import { parseServerType } from '../sdam/server_description';
import type { Document } from '../bson';
import type { CompressorName } from './wire_protocol/compression';
import { ServerType } from '../sdam/common';

const RESPONSE_FIELDS = [
  'minWireVersion',
  'maxWireVersion',
  'maxBsonObjectSize',
  'maxMessageSizeBytes',
  'maxWriteBatchSize',
  'logicalSessionTimeoutMinutes'
] as const;

/** @public */
export interface StreamDescriptionOptions {
  compressors?: CompressorName[];
}

/** @public */
export class StreamDescription {
  address: string;
  type: string;
  minWireVersion?: number;
  maxWireVersion?: number;
  maxBsonObjectSize: number;
  maxMessageSizeBytes: number;
  maxWriteBatchSize: number;
  compressors: CompressorName[];
  compressor?: CompressorName;
  logicalSessionTimeoutMinutes?: number;

  __nodejs_mock_server__?: boolean;

  zlibCompressionLevel?: number;

  constructor(address: string, options?: StreamDescriptionOptions) {
    this.address = address;
    this.type = ServerType.Unknown;
    this.minWireVersion = undefined;
    this.maxWireVersion = undefined;
    this.maxBsonObjectSize = 16777216;
    this.maxMessageSizeBytes = 48000000;
    this.maxWriteBatchSize = 100000;
    this.compressors =
      options && options.compressors && Array.isArray(options.compressors)
        ? options.compressors
        : [];
  }

  receiveResponse(response: Document): void {
    this.type = parseServerType(response);
    RESPONSE_FIELDS.forEach(field => {
      if (typeof response[field] !== 'undefined') {
        this[field] = response[field];
      }

      // testing case
      if ('__nodejs_mock_server__' in response) {
        this.__nodejs_mock_server__ = response['__nodejs_mock_server__'];
      }
    });

    if (response.compression) {
      this.compressor = this.compressors.filter(c => response.compression?.includes(c))[0];
    }
  }
}
