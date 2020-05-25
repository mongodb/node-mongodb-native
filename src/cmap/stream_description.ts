import { parseServerType } from '../sdam/server_description';

const RESPONSE_FIELDS = [
  'minWireVersion',
  'maxWireVersion',
  'maxBsonObjectSize',
  'maxMessageSizeBytes',
  'maxWriteBatchSize',
  '__nodejs_mock_server__'
];

class StreamDescription {
  address: any;
  type: any;
  minWireVersion: any;
  maxWireVersion: any;
  maxBsonObjectSize: any;
  maxMessageSizeBytes: any;
  maxWriteBatchSize: any;
  compressors: any;
  compressor: any;

  constructor(address: any, options: any) {
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

  receiveResponse(response: any) {
    this.type = parseServerType(response);
    RESPONSE_FIELDS.forEach((field: any) => {
      if (typeof response[field] !== 'undefined') {
        (this as any)[field] = response[field];
      }
    });

    if (response.compression) {
      this.compressor = this.compressors.filter(
        (c: any) => response.compression.indexOf(c) !== -1
      )[0];
    }
  }
}

export { StreamDescription };
