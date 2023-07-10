'use strict';

/**
 * @internal
 * @ignore
 * */
const kBuffers = Symbol('buffers');
/**
 * @internal
 * @ignore
 *
 * */
const kLength = Symbol('length');

/**
 * A pool of Buffers which allow you to read them as if they were one
 * @internal
 * @ignore
 */
class BufferPool {
  // [kBuffers]: Buffer[];
  // [kLength]: number;

  constructor() {
    this[kBuffers] = [];
    this[kLength] = 0;
  }

  get length() {
    return this[kLength];
  }

  /**
   * Adds a buffer to the internal buffer pool list
   * @param {Buffer} buffer - buffer to append to the pool
   * @returns {void}
   */
  append(buffer) {
    this[kBuffers].push(buffer);
    this[kLength] += buffer.length;
  }

  /**
   * Returns the requested number of bytes without consuming them
   * @param {number} size - the number of bytes to return from the head of the pool
   * @returns {Buffer}
   */
  peek(size) {
    return this.read(size, false);
  }

  /**
   * Reads the requested number of bytes, optionally consuming them
   * @param {number} size - the number of bytes to return from the head of the pool
   * @param {boolean} [consume] - whether the bytes returned should be removed, defaults to true
   * @returns {Buffer}
   */
  read(size, consume = true) {
    if (typeof size !== 'number' || size < 0) {
      throw new Error('Argument "size" must be a non-negative number');
    }

    if (size > this[kLength]) {
      return Buffer.alloc(0);
    }

    let result;

    // read the whole buffer
    if (size === this.length) {
      result = Buffer.concat(this[kBuffers]);

      if (consume) {
        this[kBuffers] = [];
        this[kLength] = 0;
      }
    }

    // size is within first buffer, no need to concat
    else if (size <= this[kBuffers][0].length) {
      result = this[kBuffers][0].slice(0, size);
      if (consume) {
        this[kBuffers][0] = this[kBuffers][0].slice(size);
        this[kLength] -= size;
      }
    }

    // size is beyond first buffer, need to track and copy
    else {
      result = Buffer.allocUnsafe(size);

      let idx;
      let offset = 0;
      let bytesToCopy = size;
      for (idx = 0; idx < this[kBuffers].length; ++idx) {
        let bytesCopied;
        if (bytesToCopy > this[kBuffers][idx].length) {
          bytesCopied = this[kBuffers][idx].copy(result, offset, 0);
          offset += bytesCopied;
        } else {
          bytesCopied = this[kBuffers][idx].copy(result, offset, 0, bytesToCopy);
          if (consume) {
            this[kBuffers][idx] = this[kBuffers][idx].slice(bytesCopied);
          }
          offset += bytesCopied;
          break;
        }

        bytesToCopy -= bytesCopied;
      }

      // compact the internal buffer array
      if (consume) {
        this[kBuffers] = this[kBuffers].slice(idx);
        this[kLength] -= size;
      }
    }

    return result;
  }
}

module.exports = { BufferPool };
