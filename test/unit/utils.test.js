'use strict';
const { eachAsync, BufferPool, shuffle, isHello } = require('../../src/utils');
const { expect } = require('chai');
const { MongoRuntimeError } = require('../../src/error');
const { LEGACY_HELLO_COMMAND } = require('../../src/constants');

describe('driver utils', function () {
  context('eachAsync()', function () {
    it('should callback with an error', function (done) {
      eachAsync(
        [{ error: false }, { error: true }],
        (item, cb) => {
          cb(item.error ? new Error('error requested') : null);
        },
        err => {
          expect(err).to.exist;
          done();
        }
      );
    });

    it('should propagate a synchronously thrown error', function (done) {
      expect(() =>
        eachAsync(
          [{}],
          () => {
            throw new Error('something wicked');
          },
          err => {
            expect(err).to.not.exist;
            done(err);
          }
        )
      ).to.throw(/something wicked/);
      done();
    });
  });

  context('new BufferPool()', function () {
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

  describe('shuffle()', () => {
    it('should support iterables', function () {
      // Kind of an implicit test, we should not throw/crash here.
      const input = new Set(['a', 'b', 'c']);
      const output = shuffle(input);
      expect(Array.isArray(output)).to.be.true;
    });

    it('should not mutate the original input', function () {
      const input = Object.freeze(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']);
      const output = shuffle(input); // This will throw if shuffle tries to edit the input
      expect(output === input).to.be.false;
      expect(output).to.not.deep.equal(input);
      expect(output).to.have.lengthOf(input.length);
    });

    it(`should give a random subset of length equal to limit when limit is less than the input length`, function () {
      const input = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
      const output = shuffle(input, input.length - 1);
      expect(output).to.not.deep.equal(input);
      expect(output).to.have.lengthOf(input.length - 1);
    });

    it(`should give a random shuffling of the entire input when limit is equal to input length`, function () {
      const input = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
      const output = shuffle(input, input.length);
      expect(output).to.not.deep.equal(input);
      expect(output).to.have.lengthOf(input.length);
    });

    it(`should always return the same element when input is one item`, function () {
      const input = ['a'];
      for (let i = 0; i < 10; i++) {
        const output = shuffle(input);
        expect(output).to.deep.equal(input);
      }
      for (let i = 0; i < 10; i++) {
        const output = shuffle(input, 1); // and with limit
        expect(output).to.deep.equal(input);
      }
    });

    it(`should return a random item on every call of limit 1`, function () {
      const input = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
      const outputs = new Set();
      for (let i = 0; i < 5; i++) {
        const output = shuffle(input, 1);
        expect(output).to.have.lengthOf(1);
        outputs.add(output[0]);
      }
      // Of the 5 shuffles we got at least 2 unique random items, this is to avoid flakiness
      expect(outputs.size).is.greaterThanOrEqual(2);
    });

    it('should give a random shuffling of the entire input when no limit provided', () => {
      const input = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
      const output = shuffle(input);
      // Of course it is possible a shuffle returns exactly the same as the input
      // but it is so improbable it is worth the flakiness in my opinion
      expect(output).to.not.deep.equal(input);
      expect(output).to.have.lengthOf(input.length);
    });
    it('should give a random shuffling of the entire input when limit is explicitly set to 0', () => {
      const input = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
      const output = shuffle(input, 0);
      expect(output).to.not.deep.equal(input);
      expect(output).to.have.lengthOf(input.length);
    });

    it('should handle empty array if limit is unspecified or 0', function () {
      expect(shuffle([])).to.deep.equal([]);
      expect(shuffle([], 0)).to.deep.equal([]);
    });

    it('should throw if limit is greater than zero and empty array', function () {
      expect(() => shuffle([], 2)).to.throw(MongoRuntimeError);
      expect(() => shuffle([], 1)).to.throw(MongoRuntimeError);
    });

    it('should throw if limit is larger than input size', () => {
      expect(() => shuffle(['a', 'b'], 3)).to.throw(MongoRuntimeError);
    });
  });

  context('isHello()', function () {
    it('should return true if document has legacy hello property set to true', function () {
      const doc = { [LEGACY_HELLO_COMMAND]: true };
      expect(isHello(doc)).to.be.true;
    });

    it('should return true if document has hello property set to true', function () {
      const doc = { hello: true };
      expect(isHello(doc)).to.be.true;
    });

    it('should return false if document does not have legacy hello property or hello property', function () {
      const doc = { a: 'b' };
      expect(isHello(doc)).to.be.false;
    });

    it('should return false if the legacy hello property and hello property are set to false', function () {
      const doc = { [LEGACY_HELLO_COMMAND]: false, hello: false };
      expect(isHello(doc)).to.be.false;
    });
  });
});
