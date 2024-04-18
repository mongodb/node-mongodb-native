import { expect } from 'chai';

import {
  BufferPool,
  ByteUtils,
  compareObjectId,
  HostAddress,
  hostMatchesWildcards,
  isHello,
  LEGACY_HELLO_COMMAND,
  List,
  matchesParentDomain,
  MongoDBCollectionNamespace,
  MongoDBNamespace,
  MongoRuntimeError,
  ObjectId,
  shuffle
} from '../mongodb';

describe('driver utils', function () {
  describe('.hostMatchesWildcards', function () {
    context('when using domains', function () {
      context('when using exact match', function () {
        context('when the host matches at least one', function () {
          it('returns true', function () {
            expect(hostMatchesWildcards('localhost', ['localhost', 'other'])).to.be.true;
          });
        });

        context('when the host does not match any', function () {
          it('returns false', function () {
            expect(hostMatchesWildcards('localhost', ['test1', 'test2'])).to.be.false;
          });
        });

        context('when the host matches a FQDN', function () {
          it('returns true', function () {
            expect(hostMatchesWildcards('mongodb.net', ['mongodb.net', 'other'])).to.be.true;
          });
        });

        context('when the host does not match a FQDN', function () {
          it('returns false', function () {
            expect(hostMatchesWildcards('mongodb.net', ['mongodb.com', 'other'])).to.be.false;
          });
        });

        context('when the host matches a FQDN with subdomain', function () {
          it('returns true', function () {
            expect(
              hostMatchesWildcards('prod.mongodb.net', ['prod.mongodb.net', 'other'])
            ).to.be.true;
          });
        });

        context('when the host does not match a FQDN with subdomain', function () {
          it('returns false', function () {
            expect(
              hostMatchesWildcards('prod.mongodb.net', ['dev.mongodb.net', 'prod.mongodb.com'])
            ).to.be.false;
          });
        });
      });

      context('when using a leading * with domains', function () {
        context('when the host matches at least one', function () {
          it('returns true', function () {
            expect(hostMatchesWildcards('localhost', ['*.localhost', 'other'])).to.be.true;
          });
        });

        context('when the host does not match any', function () {
          it('returns false', function () {
            expect(hostMatchesWildcards('localhost', ['*.test1', 'test2'])).to.be.false;
          });
        });

        context('when the wildcard does not start with *.', function () {
          it('returns false', function () {
            expect(hostMatchesWildcards('evilmongodb.com', ['*mongodb.com', 'test2'])).to.be.false;
          });
        });

        context('when the host matches a FQDN', function () {
          it('returns true', function () {
            expect(hostMatchesWildcards('mongodb.net', ['*.mongodb.net', 'other'])).to.be.true;
          });
        });

        context('when the host does not match a FQDN', function () {
          it('returns false', function () {
            expect(hostMatchesWildcards('mongodb.net', ['*.mongodb.com', 'other'])).to.be.false;
          });
        });

        context('when the host matches a FQDN with subdomain', function () {
          it('returns true', function () {
            expect(
              hostMatchesWildcards('prod.mongodb.net', ['*.prod.mongodb.net', 'other'])
            ).to.be.true;
          });
        });

        context('when the host does not match a FQDN with subdomain', function () {
          it('returns false', function () {
            expect(
              hostMatchesWildcards('prod.mongodb.net', ['*.dev.mongodb.net', '*.prod.mongodb.com'])
            ).to.be.false;
          });
        });
      });
    });

    context('when using IP addresses', function () {
      context('when using IPv4', function () {
        context('when the host matches at least one', function () {
          it('returns true', function () {
            expect(hostMatchesWildcards('127.0.0.1', ['127.0.0.1', 'other'])).to.be.true;
          });
        });

        context('when the host does not match any', function () {
          it('returns false', function () {
            expect(hostMatchesWildcards('127.0.0.1', ['127.0.0.2', 'test2'])).to.be.false;
          });
        });
      });

      context('when using IPv6', function () {
        context('when the host matches at least one', function () {
          it('returns true', function () {
            expect(hostMatchesWildcards('::1', ['::1', 'other'])).to.be.true;
          });
        });

        context('when the host does not match any', function () {
          it('returns false', function () {
            expect(hostMatchesWildcards('::1', ['::2', 'test2'])).to.be.false;
          });
        });
      });
    });

    context('when using unix domain sockets', function () {
      context('when the host matches at least one', function () {
        it('returns true', function () {
          expect(
            hostMatchesWildcards('/tmp/mongodb-27017.sock', ['*/mongodb-27017.sock', 'other'])
          ).to.be.true;
        });
      });

      context('when the host does not match any', function () {
        it('returns false', function () {
          expect(
            hostMatchesWildcards('/tmp/mongodb-27017.sock', ['*/mongod-27017.sock', 'test2'])
          ).to.be.false;
        });
      });
    });
  });

  describe('class BufferPool', function () {
    it('should report the correct length', function () {
      const buffer = new BufferPool();
      buffer.append(Buffer.from([0, 1]));
      buffer.append(Buffer.from([2, 3]));
      buffer.append(Buffer.from([2, 3]));
      expect(buffer).property('length').to.equal(6);
    });

    it('should have a readonly length', () => {
      // @ts-expect-error: checking for readonly runtime behavior
      expect(() => (new BufferPool().length = 3)).to.throw(TypeError);
    });

    describe('getInt32()', function () {
      it('should return null when pool has less than an int32 sized totalByteLength', () => {
        const buffer = new BufferPool();
        buffer.append(Buffer.from([1, 0, 0]));
        const int32 = buffer.getInt32();
        expect(int32).to.be.null;
        expect(buffer).property('length').to.equal(3);
      });

      it('should return number when pool has exactly an int32 sized totalByteLength', () => {
        const buffer = new BufferPool();
        buffer.append(Buffer.from([1, 0, 0, 0]));
        const int32 = buffer.getInt32();
        expect(int32).to.equal(1);
        expect(buffer).property('length', 4);
      });

      it('should return number when pool has more than an int32 sized buffer first in the list', () => {
        const buffer = new BufferPool();
        buffer.append(Buffer.from([1, 0, 0, 0]));
        buffer.append(Buffer.from([2, 0, 0, 0]));
        const int32 = buffer.getInt32();
        expect(int32).to.equal(1);
        expect(buffer).property('length', 8);
      });

      it('should return number when int32 is split across multiple buffers 1, 3', () => {
        const buffer = new BufferPool();
        buffer.append(Buffer.from([1]));
        buffer.append(Buffer.from([0, 0, 0]));
        const int32 = buffer.getInt32();
        expect(int32).to.equal(1);
        expect(buffer).property('length', 4);
      });

      it('should return number when int32 is split across multiple buffers 2, 2', () => {
        const buffer = new BufferPool();
        buffer.append(Buffer.from([1, 0]));
        buffer.append(Buffer.from([0, 0]));
        const int32 = buffer.getInt32();
        expect(int32).to.equal(1);
        expect(buffer).property('length', 4);
      });

      it('should return number when int32 is split across multiple buffers 3, 1', () => {
        const buffer = new BufferPool();
        buffer.append(Buffer.from([1, 0, 0]));
        buffer.append(Buffer.from([0]));
        const int32 = buffer.getInt32();
        expect(int32).to.equal(1);
        expect(buffer).property('length', 4);
      });

      it('should return number when int32 is split across multiple buffers 1, 2, 1', () => {
        const buffer = new BufferPool();
        buffer.append(Buffer.from([1]));
        buffer.append(Buffer.from([0, 0]));
        buffer.append(Buffer.from([0]));
        const int32 = buffer.getInt32();
        expect(int32).to.equal(1);
        expect(buffer).property('length', 4);
      });

      it('should return number when int32 is split across multiple buffers 2, 1, 1', () => {
        const buffer = new BufferPool();
        buffer.append(Buffer.from([1, 0]));
        buffer.append(Buffer.from([0]));
        buffer.append(Buffer.from([0]));
        const int32 = buffer.getInt32();
        expect(int32).to.equal(1);
        expect(buffer).property('length', 4);
      });

      it('should return number when int32 is split across multiple buffers 1, 1, 1, 1', () => {
        const buffer = new BufferPool();
        buffer.append(Buffer.from([1]));
        buffer.append(Buffer.from([0]));
        buffer.append(Buffer.from([0]));
        buffer.append(Buffer.from([0]));
        const int32 = buffer.getInt32();
        expect(int32).to.equal(1);
        expect(buffer).property('length', 4);
      });
    });

    describe('read()', function () {
      it('return an empty buffer if too many bytes requested', function () {
        const buffer = new BufferPool();
        buffer.append(Buffer.from([0, 1, 2, 3]));
        const data = buffer.read(6);
        expect(data).to.have.length(0);
        expect(buffer).property('length', 4);
      });

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
        expect(data).to.deep.equal(Buffer.from([0, 1]));
        expect(buffer).property('length').to.equal(0);
      });

      it('within first buffer', function () {
        const buffer = new BufferPool();
        buffer.append(Buffer.from([0, 1, 2, 3]));
        const data = buffer.read(2);
        expect(data).to.deep.equal(Buffer.from([0, 1]));
        expect(buffer).property('length').to.equal(2);
      });

      it('across multiple buffers', function () {
        const buffer = new BufferPool();
        buffer.append(Buffer.from([0, 1]));
        buffer.append(Buffer.from([2, 3]));
        buffer.append(Buffer.from([4, 5]));
        expect(buffer).property('length').to.equal(6);
        const data = buffer.read(5);
        expect(data).to.deep.equal(Buffer.from([0, 1, 2, 3, 4]));
        expect(buffer).property('length').to.equal(1);
        expect(buffer.read(1)).to.deep.equal(Buffer.from([5]));
      });
    });
  });

  describe('class List', () => {
    describe('constructor()', () => {
      it('should make an empty list', () => {
        const list = new List();
        expect(list).to.have.property('length', 0);
        // Double checking some internals, if future code changes modify these expectations
        // They are not intended to be set in stone or expected by users of the List class
        expect(list).to.have.property('head').that.is.not.null;
        expect(list).to.have.nested.property('head.value', null);
        // @ts-expect-error: checking circularity is maintained
        expect(list).to.have.nested.property('head.next').that.equals(list.head);
        // @ts-expect-error: checking circularity is maintained
        expect(list).to.have.nested.property('head.prev').that.equals(list.head);
      });

      it('should construct nodes with keys always in the same order', () => {
        // declaring object literals with the exact same key ordering improves perf
        const list = new List<number>();
        list.push(2);
        list.unshift(1);

        // head node from constructor
        expect(Object.keys(list.head)).to.deep.equal(['next', 'prev', 'value']);

        // 1 node from push
        expect(list.head.prev).to.have.property('value', 2);
        expect(Object.keys(list.head.prev)).to.deep.equal(['next', 'prev', 'value']);

        // 2 node from unshift
        expect(list.head.next).to.have.property('value', 1);
        expect(Object.keys(list.head.next)).to.deep.equal(['next', 'prev', 'value']);
      });
    });

    describe('get length', () => {
      it('should be readonly', () => {
        const list = new List<number>();
        expect(() => {
          // @ts-expect-error: testing readonly-ness
          list.length = 34;
        }).to.throw(TypeError);
      });

      it('should increment by one with each item inserted into the list', () => {
        const list = new List<number>();
        expect(list).to.have.property('length', 0);
        list.push(10);
        expect(list).to.have.property('length', 1);
        list.push(23);
        expect(list).to.have.property('length', 2);
        list.pushMany(Array.from({ length: 100 }, () => 22));
        expect(list).to.have.property('length', 102);
      });

      it('should decrement by one with each item removed from the list', () => {
        const list = new List<number>();
        list.pushMany([1, 2, 3]);
        expect(list).to.have.property('length', 3);
        list.pop();
        expect(list).to.have.property('length', 2);
        list.pop();
        expect(list).to.have.property('length', 1);
        list.pop();
        expect(list).to.have.property('length', 0);
        list.pop();
        expect(list).to.have.property('length', 0);
      });

      it('should not fall below zero if items are removed from empty list', () => {
        const list = new List<number>();
        expect(list).to.have.property('length', 0);
        list.pop();
        list.pop();
        list.shift();
        list.shift();
        expect(list).to.have.property('length', 0);
      });
    });

    describe('get [Symbol.toStringTag]()', () => {
      it('should define a toStringTag getter', () => {
        const list = new List<number>();
        expect(Object.prototype.toString.call(list)).to.equal('[object List]');
      });
    });

    describe('*[Symbol.iterator]()', () => {
      it('should be instanceof GeneratorFunction', () => {
        const list = new List<number>();
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        expect(list[Symbol.iterator]).to.be.instanceOf(function* () {}.constructor);
      });

      it('should only run generator for the number of items in the list', () => {
        // Our implementation is circularly linked, so we want to confirm we stop where we started
        const list = new List<number>();
        list.push(1);
        list.push(2);
        list.push(3);
        const iterator = list[Symbol.iterator]();

        const first = iterator.next();
        expect(first).to.have.property('done', false);
        expect(first).to.have.property('value', 1);

        const second = iterator.next();
        expect(second).to.have.property('done', false);
        expect(second).to.have.property('value', 2);

        const third = iterator.next();
        expect(third).to.have.property('done', false);
        expect(third).to.have.property('value', 3);

        // finished
        const fourth = iterator.next();
        expect(fourth).to.have.property('done', true);
        expect(fourth).to.have.property('value', undefined);

        // beyond finished
        const fifth = iterator.next();
        expect(fifth).to.have.property('done', true);
        expect(fifth).to.have.property('value', undefined);
      });
    });

    describe('push()', () => {
      it('should add an item to the end of a list', () => {
        const list = new List<number>();
        list.push(1);
        list.push(2);
        expect(Array.from(list)).to.deep.equal([1, 2]);
      });

      it('should support nullish values', () => {
        const list = new List<null | undefined>();
        list.push(null);
        // @ts-expect-error: Checking if undefined pushes will not be ignored
        list.push();
        expect(Array.from(list)).to.deep.equal([null, undefined]);
      });
    });

    describe('unshift()', () => {
      it('should add an item to the start of a list', () => {
        const list = new List<number>();
        list.unshift(1);
        list.unshift(2);
        expect(Array.from(list)).to.deep.equal([2, 1]);
      });

      it('should support nullish values', () => {
        const list = new List<null | undefined>();
        list.unshift(null);
        // @ts-expect-error: Checking if undefined pushes will not be ignored
        list.unshift();
        expect(Array.from(list)).to.deep.equal([undefined, null]);
      });
    });

    describe('shift()', () => {
      let list: List<number>;

      beforeEach(() => {
        list = new List();
        // Just to make pushing not part of the tests here
        list.push(1);
        list.push(2);
        expect(Array.from(list)).to.deep.equal([1, 2]);
      });

      it('should remove and return an item from the start of the list', () => {
        const last = list.shift();
        expect(last).to.equal(1);
        expect(Array.from(list)).to.deep.equal([2]);
      });

      it('should return null when list is empty', () => {
        const list = new List<number>();
        expect(list.shift()).to.be.null;
        expect(list.shift()).to.be.null;
        expect(list.shift()).to.be.null;
      });
    });

    describe('pop()', () => {
      let list: List<number>;

      beforeEach(() => {
        list = new List();
        // Just to make pushing not part of the tests here
        list.push(1);
        list.push(2);
        expect(Array.from(list)).to.deep.equal([1, 2]);
      });

      it('should remove and return an item from the end of the list', () => {
        const last = list.pop();
        expect(last).to.equal(2);
        expect(Array.from(list)).to.deep.equal([1]);
      });

      it('should return null when list is empty', () => {
        const list = new List<number>();
        expect(list.pop()).to.be.null;
        expect(list.pop()).to.be.null;
        expect(list.pop()).to.be.null;
      });
    });

    describe('clear()', () => {
      let list: List<number>;

      beforeEach(() => {
        list = new List();
        // Just to make pushing not part of the tests here
        list.push(1);
        list.push(2);
        expect(Array.from(list)).to.deep.equal([1, 2]);
      });

      it('should empty a list of all values', () => {
        list.clear();
        expect(list.length).to.equal(0);
        // Double checking some internals, if future code changes modify these expectations
        // They are not intended to be set in stone or expected by users of the List class
        expect(list).to.have.property('head').that.is.not.null;
        expect(list).to.have.nested.property('head.value', null);
        // @ts-expect-error: checking circularity is maintained
        expect(list).to.have.nested.property('head.next').that.equals(list.head);
        // @ts-expect-error: checking circularity is maintained
        expect(list).to.have.nested.property('head.prev').that.equals(list.head);
      });
    });

    describe('first()', () => {
      let list: List<number>;

      beforeEach(() => {
        list = new List();
        // Just to make pushing not part of the tests here
        list.push(1);
        list.push(2);
        expect(Array.from(list)).to.deep.equal([1, 2]);
      });

      it('should return the first item without removing it', () => {
        expect(list.first()).to.equal(1);
        expect(list.first()).to.equal(1);
        expect(list.first()).to.equal(1);
        expect(Array.from(list)).to.deep.equal([1, 2]);
      });
    });

    describe('toString()', () => {
      let list: List<number>;

      beforeEach(() => {
        list = new List();
        // Just to make pushing not part of the tests here
        list.push(1);
        list.push(2);
        list.push(3);
        expect(Array.from(list)).to.deep.equal([1, 2, 3]);
      });

      it('should return string that describes links', () => {
        expect(`${list}`).to.equal('head <=> 1 <=> 2 <=> 3 <=> head');
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

      it('returns a MongoDBCollectionNamespaceObject', () => {
        expect(dbNamespace.withCollection('pets')).to.be.instanceOf(MongoDBCollectionNamespace);
      });
    });
  });

  describe('MongoDBCollectionNamespace', () => {
    it('is a subclass of MongoDBNamespace', () => {
      expect(new MongoDBCollectionNamespace('db', 'collection')).to.be.instanceOf(MongoDBNamespace);
    });

    it('does not enforce the collection property at runtime', () => {
      // @ts-expect-error Intentionally calling constructor incorrectly.
      expect(new MongoDBCollectionNamespace('db')).to.have.property('collection', undefined);
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
        expect(ha).to.have.property('port', undefined);
      });

      it('should handle encoded unix socket path', () => {
        const ha = new HostAddress(encodeURIComponent(socketPath));
        expect(ha).to.have.property('socketPath', socketPath);
        expect(ha).to.have.property('port', undefined);
      });

      it('should handle encoded unix socket path with an unencoded space', () => {
        const socketPathWithSpaces = '/tmp/some directory/mongodb-27017.sock';
        const ha = new HostAddress(socketPathWithSpaces);
        expect(ha).to.have.property('socketPath', socketPathWithSpaces);
        expect(ha).to.have.property('port', undefined);
      });

      it('should handle unix socket path that does not begin with a slash', () => {
        const socketPathWithoutSlash = 'my_local/directory/mustEndWith.sock';
        const ha = new HostAddress(socketPathWithoutSlash);
        expect(ha).to.have.property('socketPath', socketPathWithoutSlash);
        expect(ha).to.have.property('port', undefined);
      });

      it('should only set the socketPath property on HostAddress when hostString ends in .sock', () => {
        // We heuristically determine if we are using a domain socket solely based on .sock
        // if someone has .sock in their hostname we will fail to connect to that host
        const hostnameThatEndsWithSock = 'iLoveJavascript.sock';
        const ha = new HostAddress(hostnameThatEndsWithSock);
        expect(ha).to.have.property('socketPath', hostnameThatEndsWithSock);
        expect(ha).to.have.property('port', undefined);
        expect(ha).to.have.property('host', undefined);
      });

      it('should set the host and port property on HostAddress even when hostname ends in .sock if there is a port number specified', () => {
        // "should determine unix socket usage based on .sock ending" can be worked around by putting
        // the port number at the end of the hostname (even if it is the default)
        const hostnameThatEndsWithSockHasPort = 'iLoveJavascript.sock:27017';
        const ha = new HostAddress(hostnameThatEndsWithSockHasPort);
        expect(ha).to.have.property('socketPath', undefined);
        expect(ha).to.have.property('host', 'iLoveJavascript.sock'.toLowerCase());
        expect(ha).to.have.property('port', 27017);
      });
    });
  });

  describe('compareObjectId()', () => {
    const table = [
      { oid1: null, oid2: null, result: 0 },
      { oid1: undefined, oid2: null, result: 0 },
      { oid1: null, oid2: undefined, result: 0 },
      { oid1: undefined, oid2: undefined, result: 0 },
      { oid1: new ObjectId('00'.repeat(12)), oid2: undefined, result: 1 },
      { oid1: new ObjectId('00'.repeat(12)), oid2: null, result: 1 },
      { oid1: undefined, oid2: new ObjectId('00'.repeat(12)), result: -1 },
      { oid1: null, oid2: new ObjectId('00'.repeat(12)), result: -1 },
      { oid1: new ObjectId('00'.repeat(12)), oid2: new ObjectId('00'.repeat(12)), result: 0 },
      {
        oid1: new ObjectId('00'.repeat(11) + '01'),
        oid2: new ObjectId('00'.repeat(12)),
        result: 1
      },
      {
        oid1: new ObjectId('00'.repeat(12)),
        oid2: new ObjectId('00'.repeat(11) + '01'),
        result: -1
      },
      {
        oid1: 2,
        oid2: 1,
        result: 'throws'
      }
    ];

    for (const { oid1, oid2, result } of table) {
      if (result === 'throws') {
        it('passing non-objectId values throw', () =>
          // @ts-expect-error: Passing bad values to ensure thrown error
          expect(() => compareObjectId(oid1, oid2)).to.throw());
        continue;
      }

      const title = `comparing ${oid1} to ${oid2} returns ${
        result === 0 ? 'equal' : result === -1 ? 'less than' : 'greater than'
      }`;
      // @ts-expect-error: not narrowed based on numeric result, but these values are correct
      it(title, () => expect(compareObjectId(oid1, oid2)).to.equal(result));
    }
  });

  context('const ByteUtils', () => {
    context('toLocalBufferType()', () => {
      it('returns identical Node.js buffer instance when input is Buffer', () => {
        const buffer = Buffer.from([1, 2, 3]);
        // Note: **Not** a deep.equal check
        expect(ByteUtils.toLocalBufferType(buffer)).to.equal(buffer);
      });

      it('returns new Node.js buffer instance when input is Uint8Array', () => {
        const uint8array = new Uint8Array([1, 2, 3]);
        expect(Buffer.isBuffer(ByteUtils.toLocalBufferType(uint8array))).to.be.true;
      });

      it('does not clone ArrayBuffer when creating a new Node.js Buffer', () => {
        const uint8array = new Uint8Array([1, 2, 3]);
        // Note: **Not** a deep.equal check
        expect(ByteUtils.toLocalBufferType(uint8array).buffer).to.equal(uint8array.buffer);
      });
    });

    context('equals()', () => {
      it('is a function', () => expect(ByteUtils).property('equals').is.a('function'));

      it('returns true for equal Buffer or Uint8Array', () => {
        const buffer = Buffer.from([1, 2, 3]);
        const uint8array = new Uint8Array([1, 2, 3]);

        expect(ByteUtils.equals(buffer, uint8array)).to.be.true;
        expect(ByteUtils.equals(uint8array, buffer)).to.be.true;
        expect(ByteUtils.equals(uint8array, uint8array)).to.be.true;
        expect(ByteUtils.equals(buffer, buffer)).to.be.true;
      });

      it('returns false for nonequal Buffer or Uint8Array', () => {
        const buffer = Buffer.from([1, 2, 3]);
        const uint8array = new Uint8Array([1, 2, 4]);

        expect(ByteUtils.equals(buffer, uint8array)).to.be.false;
        expect(ByteUtils.equals(uint8array, buffer)).to.be.false;
      });
    });

    context('compare()', () => {
      it('is a function', () => expect(ByteUtils).property('compare').is.a('function'));

      it('returns 0 for equal Buffer or Uint8Array', () => {
        const buffer = Buffer.from([1, 2, 3]);
        const uint8array = new Uint8Array([1, 2, 3]);

        expect(ByteUtils.compare(buffer, uint8array)).to.equal(0);
        expect(ByteUtils.compare(uint8array, buffer)).to.equal(0);
        expect(ByteUtils.compare(uint8array, uint8array)).to.equal(0);
        expect(ByteUtils.compare(buffer, buffer)).to.equal(0);
      });

      it('returns +/- 1 for Buffer or UInt8Array if one is greater or less than', () => {
        const buffer = Buffer.from([1, 2, 3]);
        const uint8array = new Uint8Array([1, 2, 4]);

        expect(ByteUtils.compare(buffer, uint8array)).to.equal(-1);
        expect(ByteUtils.compare(uint8array, buffer)).to.equal(1);
      });
    });

    context('toBase64()', () => {
      it('is a function', () => expect(ByteUtils).property('toBase64').is.a('function'));

      const oneTwoThreeBase64 = 'AQID';

      it('converts a Buffer to a base64 string', () => {
        expect(ByteUtils.toBase64(Buffer.from([1, 2, 3]))).to.equal(oneTwoThreeBase64);
      });

      it('converts a Uint8Array to a base64 string', () => {
        expect(ByteUtils.toBase64(new Uint8Array([1, 2, 3]))).to.equal(oneTwoThreeBase64);
      });
    });
  });

  describe('matchesParentDomain()', () => {
    const exampleSrvName = 'i-love-javascript.mongodb.io';
    const exampleSrvNameWithDot = 'i-love-javascript.mongodb.io.';
    const exampleHostNameWithoutDot = 'i-love-javascript-00.mongodb.io';
    const exampleHostNamesWithDot = exampleHostNameWithoutDot + '.';
    const exampleHostNamThatDoNotMatchParent = 'i-love-javascript-00.evil-mongodb.io';
    const exampleHostNamThatDoNotMatchParentWithDot = 'i-love-javascript-00.evil-mongodb.io.';

    context('when address does not match parent domain', () => {
      it('without a trailing dot returns false', () => {
        expect(matchesParentDomain(exampleHostNamThatDoNotMatchParent, exampleSrvName)).to.be.false;
      });

      it('with a trailing dot returns false', () => {
        expect(matchesParentDomain(exampleHostNamThatDoNotMatchParentWithDot, exampleSrvName)).to.be
          .false;
      });
    });

    context('when addresses in SRV record end with a dot', () => {
      it('accepts address since it is considered to still match the parent domain', () => {
        expect(matchesParentDomain(exampleHostNamesWithDot, exampleSrvName)).to.be.true;
      });
    });

    context('when SRV host ends with a dot', () => {
      it('accepts address if it ends with a dot', () => {
        expect(matchesParentDomain(exampleHostNamesWithDot, exampleSrvNameWithDot)).to.be.true;
      });

      it('accepts address if it does not end with a dot', () => {
        expect(matchesParentDomain(exampleHostNameWithoutDot, exampleSrvName)).to.be.true;
      });
    });

    context('when addresses in SRV record end without dots', () => {
      it('accepts address since it matches the parent domain', () => {
        expect(matchesParentDomain(exampleHostNamesWithDot, exampleSrvName)).to.be.true;
      });
    });
  });
});
