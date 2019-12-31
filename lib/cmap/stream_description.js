'use strict';
const parseServerType = require('../core/sdam/server_description').parseServerType;

const RESPONSE_FIELDS = [
  'minWireVersion',
  'maxWireVersion',
  'maxBsonObjectSize',
  'maxMessageSizeBytes',
  'maxWriteBatchSize',
  '__nodejs_mock_server__'
];

class StreamDescription {
  constructor(address, options) {
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

  receiveResponse(response) {
    this.type = parseServerType(response);

    RESPONSE_FIELDS.forEach(field => {
      if (typeof response[field] !== 'undefined') {
        this[field] = response[field];
      }
    });

    if (response.compression) {
      this.compressor = this.compressors.filter(c => response.compression.indexOf(c) !== -1)[0];
    }
  }
}

module.exports = {
  StreamDescription
};
