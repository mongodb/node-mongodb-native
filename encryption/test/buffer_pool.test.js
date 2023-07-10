'use strict';

const { BufferPool } = require('../lib/buffer_pool');
const { expect } = require('chai');

describe('new BufferPool()', function () {
  it('should report the correct length', function () {
    const buffer = new BufferPool();
    buffer.append(Buffer.from([0, 1]));
    buffer.append(Buffer.from([2, 3]));
    buffer.append(Buffer.from([2, 3]));
    expect(buffer).property('length').to.equal(6);
  });

  it('return an empty buffer if too many bytes requested', function () {
    const buffer = new BufferPool();
    buffer.append(Buffer.from([0, 1, 2, 3]));
    const data = buffer.read(6);
    expect(data).to.have.length(0);
    expect(buffer).property('length').to.equal(4);
  });

  context('peek', function () {
    it('exact size', function () {
      const buffer = new BufferPool();
      buffer.append(Buffer.from([0, 1]));
      const data = buffer.peek(2);
      expect(data).to.eql(Buffer.from([0, 1]));
      expect(buffer).property('length').to.equal(2);
    });

    it('within first buffer', function () {
      const buffer = new BufferPool();
      buffer.append(Buffer.from([0, 1, 2, 3]));
      const data = buffer.peek(2);
      expect(data).to.eql(Buffer.from([0, 1]));
      expect(buffer).property('length').to.equal(4);
    });

    it('across multiple buffers', function () {
      const buffer = new BufferPool();
      buffer.append(Buffer.from([0, 1]));
      buffer.append(Buffer.from([2, 3]));
      buffer.append(Buffer.from([4, 5]));
      expect(buffer).property('length').to.equal(6);
      const data = buffer.peek(5);
      expect(data).to.eql(Buffer.from([0, 1, 2, 3, 4]));
      expect(buffer).property('length').to.equal(6);
    });
  });

  context('read', function () {
    it('should throw an error if a negative size is requested', function () {
      const buffer = new BufferPool();
      expect(() => buffer.read(-1)).to.throw(/Argument "size" must be a non-negative number/);
    });

    it('should throw an error if a non-number size is requested', function () {
      const buffer = new BufferPool();
      expect(() => buffer.read('256')).to.throw(/Argument "size" must be a non-negative number/);
    });

    it('exact size', function () {
      const buffer = new BufferPool();
      buffer.append(Buffer.from([0, 1]));
      const data = buffer.read(2);
      expect(data).to.eql(Buffer.from([0, 1]));
      expect(buffer).property('length').to.equal(0);
    });

    it('within first buffer', function () {
      const buffer = new BufferPool();
      buffer.append(Buffer.from([0, 1, 2, 3]));
      const data = buffer.read(2);
      expect(data).to.eql(Buffer.from([0, 1]));
      expect(buffer).property('length').to.equal(2);
    });

    it('across multiple buffers', function () {
      const buffer = new BufferPool();
      buffer.append(Buffer.from([0, 1]));
      buffer.append(Buffer.from([2, 3]));
      buffer.append(Buffer.from([4, 5]));
      expect(buffer).property('length').to.equal(6);
      const data = buffer.read(5);
      expect(data).to.eql(Buffer.from([0, 1, 2, 3, 4]));
      expect(buffer).property('length').to.equal(1);
      expect(buffer.read(1)).to.eql(Buffer.from([5]));
    });
  });
});
