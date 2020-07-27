import { parseServerType } from '../sdam/server_description';
import type { Document } from '../types';

const RESPONSE_FIELDS = [
  'minWireVersion',
  'maxWireVersion',
  'maxBsonObjectSize',
  'maxMessageSizeBytes',
  'maxWriteBatchSize'
] as const;

export interface StreamDescriptionOptions {
  compression: {
    compressors: string[];
  };
}

export class StreamDescription {
  address: string;
  type: string;
  minWireVersion?: number;
  maxWireVersion?: number;
  maxBsonObjectSize: number;
  maxMessageSizeBytes: number;
  maxWriteBatchSize: number;
  compressors: string[];
  compressor?: string;

  zlibCompressionLevel?: number;

  constructor(address: string, options?: StreamDescriptionOptions) {
    this.address = address;
    this.type = parseServerType(null);
    this.minWireVersion = undefined;
    this.maxWireVersion = undefined;
    this.maxBsonObjectSize = 16777216;
    this.maxMessageSizeBytes = 48000000;
    this.maxWriteBatchSize = 100000;
    this.compressors =
      options && options.compression && Array.isArray(options.compression.compressors)
        ? options.compression.compressors
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
        const that = (this as unknown) as { __nodejs_mock_server__: unknown };
        that.__nodejs_mock_server__ = response['__nodejs_mock_server__'];
      }
    });

    if (response.compression) {
      this.compressor = this.compressors.filter(c => response.compression?.includes(c))[0];
    }
  }
}
