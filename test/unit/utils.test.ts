import { expect } from 'chai';

import { LEGACY_HELLO_COMMAND } from '../../src/constants';
import { MongoRuntimeError } from '../../src/error';
import {
  BufferPool,
  eachAsync,
  HostAddress,
  isHello,
  MongoDBNamespace,
  shuffle
} from '../../src/utils';

describe('driver utils', function () {
  context('eachAsync()', function () {
    it('should callback with an error', function (done) {
      eachAsync(
        [{ error: false }, { error: true }],
        (item, cb) => {
          cb(item.error ? new Error('error requested') : undefined);
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
        // @ts-expect-error: Testing invalid input
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

  describe('class MongoDBNamespace', () => {
    describe('constructor()', () => {
      it('should set db property', () => {
        const namespace = new MongoDBNamespace('myDb', 'myCollection');
        expect(namespace).to.have.property('collection', 'myCollection');
      });

      it('should set collection property', () => {
        const namespace = new MongoDBNamespace('myDb', 'myCollection');
        expect(namespace).to.have.property('collection', 'myCollection');
      });

      it('should constrain collection property to undefined if empty string passed in', () => {
        const namespace = new MongoDBNamespace('myDb', '');
        expect(namespace).to.have.property('collection').that.is.undefined;
      });
    });

    describe('fromString()', () => {
      it('should accept dot delimited namespace', () => {
        const namespaceNoDot = MongoDBNamespace.fromString('a.b');
        expect(namespaceNoDot).to.have.property('db', 'a');
        expect(namespaceNoDot).to.have.property('collection', 'b');
      });

      it('should constrain collection to undefined if nothing follows the db name', () => {
        const namespaceNoDot = MongoDBNamespace.fromString('test');
        expect(namespaceNoDot).to.have.property('collection').that.is.undefined;
      });

      it('should not include a dot in the db name if the input ends with one', () => {
        const namespaceDotFollowedByNothing = MongoDBNamespace.fromString('test.');
        expect(namespaceDotFollowedByNothing).to.have.property('db', 'test');
        expect(namespaceDotFollowedByNothing).to.have.property('collection').that.is.undefined;
      });

      it('should throw on non-string inputs', () => {
        // @ts-expect-error: testing incorrect input type
        expect(() => MongoDBNamespace.fromString(2.3)).to.throw(MongoRuntimeError);
      });

      it('should throw on empty string input', () => {
        expect(() => MongoDBNamespace.fromString('')).to.throw(MongoRuntimeError);
      });
    });

    describe('withCollection()', () => {
      const dbNamespace = MongoDBNamespace.fromString('test');

      it('should return new MongoDBNamespace instance', () => {
        const withCollectionNamespace = dbNamespace.withCollection('pets');
        expect(withCollectionNamespace).to.not.equal(dbNamespace);
        expect(withCollectionNamespace).to.have.property('db', 'test');
        expect(withCollectionNamespace).to.have.property('collection', 'pets');
      });
    });
  });

  describe('class HostAddress', () => {
    describe('constructor()', () => {
      it('should freeze itself', () => {
        const ha = new HostAddress('iLoveJavascript:22');
        expect(ha).to.be.frozen;
      });

      const socketPath = '/tmp/mongodb-27017.sock';
      it('should handle decoded unix socket path', () => {
        const ha = new HostAddress(socketPath);
        expect(ha).to.have.property('socketPath', socketPath);
        expect(ha).to.not.have.property('port');
      });

      it('should handle encoded unix socket path', () => {
        const ha = new HostAddress(encodeURIComponent(socketPath));
        expect(ha).to.have.property('socketPath', socketPath);
        expect(ha).to.not.have.property('port');
      });

      it('should handle encoded unix socket path with an unencoded space', () => {
        const socketPathWithSpaces = '/tmp/some directory/mongodb-27017.sock';
        const ha = new HostAddress(socketPathWithSpaces);
        expect(ha).to.have.property('socketPath', socketPathWithSpaces);
        expect(ha).to.not.have.property('port');
      });

      it('should handle unix socket path that does not begin with a slash', () => {
        const socketPathWithoutSlash = 'my_local/directory/mustEndWith.sock';
        const ha = new HostAddress(socketPathWithoutSlash);
        expect(ha).to.have.property('socketPath', socketPathWithoutSlash);
        expect(ha).to.not.have.property('port');
      });

      it('should only set the socketPath property on HostAddress when hostString ends in .sock', () => {
        // We heuristically determine if we are using a domain socket solely based on .sock
        // if someone has .sock in their hostname we will fail to connect to that host
        const hostnameThatEndsWithSock = 'iLoveJavascript.sock';
        const ha = new HostAddress(hostnameThatEndsWithSock);
        expect(ha).to.have.property('socketPath', hostnameThatEndsWithSock);
        expect(ha).to.not.have.property('port');
        expect(ha).to.not.have.property('host');
      });

      it('should set the host and port property on HostAddress even when hostname ends in .sock if there is a port number specified', () => {
        // "should determine unix socket usage based on .sock ending" can be worked around by putting
        // the port number at the end of the hostname (even if it is the default)
        const hostnameThatEndsWithSockHasPort = 'iLoveJavascript.sock:27017';
        const ha = new HostAddress(hostnameThatEndsWithSockHasPort);
        expect(ha).to.not.have.property('socketPath');
        expect(ha).to.have.property('host', 'iLoveJavascript.sock'.toLowerCase());
        expect(ha).to.have.property('port', 27017);
      });
    });
  });
});
