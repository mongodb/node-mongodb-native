
/**
 * Module dependencies.
 */

var Buffer = require('buffer').Buffer; // TODO just use global Buffer
var bson = require('./bson'),
  debug = require('util').debug,
  inspect = require('util').inspect;

/**
 * Binary constructor.
 *
 * @param {Buffer} buffer (optional)
 */

function Binary(buffer, subType) {  
  this._bsontype = 'Binary';

  if(buffer instanceof Number) {
    this.sub_type = buffer;
    this.position = 0;
  } else {    
    this.sub_type = subType == null ? bson.BSON.BSON_BINARY_SUBTYPE_DEFAULT : subType;
    this.position = 0;
  }

  if(buffer != null && !(buffer instanceof Number)) {
    this.buffer = typeof buffer == 'string' ? new Buffer(buffer) : buffer;
    this.position = buffer.length;
  } else {
    this.buffer = new Buffer(Binary.BUFFER_SIZE);
    this.position = 0;
  }
};

/**
 * Updates this binary with `byte_value`.
 *
 * @param {TODO} byte_value
 */

Binary.prototype.put = function put (byte_value) {
  if (this.buffer.length > this.position) {
    this.buffer[this.position++] = byte_value.charCodeAt(0);
  } else {
    // Create additional overflow buffer
    var buffer = new Buffer(Binary.BUFFER_SIZE + this.buffer.length);
    // Combine the two buffers together
    this.buffer.copy(buffer, 0, 0, this.buffer.length);
    this.buffer = buffer;
    this.buffer[this.position++] = byte_value.charCodeAt(0);
  }
};

/**
 * Writes.
 *
 * @param {String} string
 * @param {Number} offset
 */

Binary.prototype.write = function write (string, offset) {
  offset = offset ? offset : this.position;

  // If the buffer is to small let's extend the buffer
  if (this.buffer.length < offset + string.length) {
    var buffer = new Buffer(this.buffer.length + string.length);
    this.buffer.copy(buffer, 0, 0, this.buffer.length);
    // Assign the new buffer
    this.buffer = buffer;
  }

  if (string instanceof Buffer) {
    string.copy(this.buffer, offset, 0, string.length);
  } else {
	  this.buffer.write(string, 'binary', offset);
  }

  this.position = offset + string.length;
};

/**
 * Reads `length` bytes starting at `position`.
 *
 * @param {Number} position
 * @param {Number} length
 * @return {String}
 */

Binary.prototype.read = function read (position, length) {
  length = length && length > 0
    ? length
    : this.position;

  return this.buffer.toString('binary', position, position + length);
};

/**
 * Returns the value of this binary as a string.
 *
 * @return {String}
 */

Binary.prototype.value = function value(asRaw) {
  asRaw = asRaw == null ? false : asRaw;  
  return asRaw ? this.buffer.slice(0, this.position) : this.buffer.toString('binary', 0, this.position);
};

/**
 * Length.
 *
 * @return {Number}
 */

Binary.prototype.length = function length () {
  return this.position;
};

Binary.prototype.toJSON = function() {
  return this.buffer != null ? this.buffer.toString('base64') : '';
}

Binary.BUFFER_SIZE = 256;

// BSON BINARY DATA SUBTYPES
Binary.SUBTYPE_DEFAULT = 0;
Binary.SUBTYPE_FUNCTION = 1;
Binary.SUBTYPE_BYTE_ARRAY = 2;
Binary.SUBTYPE_UUID = 3;
Binary.SUBTYPE_MD5 = 4;
Binary.SUBTYPE_USER_DEFINED = 128;

/**
 * Expose.
 */
exports.Binary = Binary;

