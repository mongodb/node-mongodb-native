'use strict';

const sinon = require('sinon');
const { Compressor } = require('../../../src/options/types');
const { Coerce } = require('../../../src/options/coerce');
const chai = require('chai');
const { CoerceError } = require('../../../src/options/coerce_error');
const expect = chai.expect;
const Errors = require('../../../src/options/coerce_error');

describe('Coerce', () => {
  let errorWarningStub;
  let deprecationWarningStub;
  let unrecognizedWarningStub;
  beforeEach(() => {
    errorWarningStub = sinon.stub(Errors.CoerceError.prototype, 'warn').returns({});
    deprecationWarningStub = sinon.stub(Errors.CoerceDeprecate.prototype, 'warn').returns({});
    unrecognizedWarningStub = sinon.stub(Errors.CoerceUnrecognized.prototype, 'warn').returns({});
  });

  afterEach(() => {
    Errors.CoerceError.prototype.warn.restore();
    Errors.CoerceDeprecate.prototype.warn.restore();
    Errors.CoerceUnrecognized.prototype.warn.restore();
  });

  context('.string()', () => {
    it('should coerce', () => {
      // prettier-ignore
      [
        Coerce.string('hi'),
        Coerce.string(['hi'])
      ].forEach(v => {
        expect(v).to.equal('hi');
      });
    });
    it('should result in CoerceError', () => {
      // prettier-ignore
      [
        Coerce.string(1),
        Coerce.string([1]),
        Coerce.string(true),
        Coerce.string([true]),
      ].forEach(v => {
        expect(v).to.be.instanceof(CoerceError);
      });
    });
  });

  context('.number()', () => {
    it('should coerce', () => {
      // prettier-ignore
      [
        Coerce.number(1),
        Coerce.number('1'),
        Coerce.number([1]),
        Coerce.number(['1']),
      ].forEach(v => {
        expect(v).to.equal(1);
      });
    });
    it('should result in CoerceError', () => {
      // prettier-ignore
      [
        Coerce.number(true),
        Coerce.number([true]),
      ].forEach(v => {
        expect(v).to.be.instanceof(CoerceError);
      });
    });
  });

  context('.boolean()', () => {
    it('should coerce true', () => {
      [
        Coerce.boolean(true),
        Coerce.boolean('true'),
        Coerce.boolean([true]),
        Coerce.boolean(['true'])
      ].forEach(v => {
        expect(v).to.equal(true);
      });
    });
    it('should coerce false', () => {
      [
        Coerce.boolean(false),
        Coerce.boolean('false'),
        Coerce.boolean([false]),
        Coerce.boolean(['false'])
      ].forEach(v => {
        expect(v).to.equal(false);
      });
    });
    it('should result in CoerceError', () => {
      // prettier-ignore
      [
        Coerce.boolean('TRUE'),
        Coerce.boolean(1),
        Coerce.boolean(['TRUE']),
        Coerce.boolean([1])
      ].forEach(v => {
        expect(v).to.be.instanceof(CoerceError);
      });
    });
  });

  context('.union()', () => {
    it('should coerce (number | string)', () => {
      const union = Coerce.union(Coerce.number, Coerce.string);
      expect(union(1)).to.equal(1);
      expect(union('1')).to.equal(1);
      expect(union([1])).to.equal(1);
      expect(union(['1'])).to.equal(1);
      expect(union('hi')).to.equal('hi');
      expect(union(['hi'])).to.equal('hi');
    });
    it('should fail to coerce (number | string)', () => {
      const union = Coerce.union(Coerce.number, Coerce.string);
      expect(union(true)).to.be.instanceOf(CoerceError);
      expect(union(null)).to.be.instanceOf(CoerceError);
      expect(union(undefined)).to.be.instanceOf(CoerceError);
    });
    it('should not include typeName when missing', () => {
      const union = Coerce.union(() => new CoerceError());
      expect(union(true)).to.be.instanceOf(CoerceError);
      expect(union(null)).to.be.instanceOf(CoerceError);
      expect(union(undefined)).to.be.instanceOf(CoerceError);
    });
  });

  context('.object()', () => {
    it('should coerce ', () => {
      const example = Coerce.object(match => ({
        ...match('foo', Coerce.boolean),
        ...match('bar', Coerce.boolean)
      }));
      const expected = {
        foo: true,
        bar: true
      };
      expect(example({ foo: true, bar: true })).to.deep.equal(expected);
      expect(example({ foo: 'true', bar: 'true' })).to.deep.equal(expected);
      expect(example({ foo: ['true'], bar: ['true'] })).to.deep.equal(expected);
    });
    it('should return error if not invoked with object', () => {
      const example = Coerce.object(match => ({
        ...match('foo', Coerce.boolean),
        ...match('bar', Coerce.boolean)
      }));
      expect(example(1)).to.be.instanceOf(CoerceError);
    });
    it('should ignore property values that are invalid ', () => {
      const example = Coerce.object(match => ({
        ...match('foo', Coerce.boolean),
        ...match('bar', Coerce.boolean)
      }));
      expect(example({ foo: 1, bar: true })).to.deep.equal({ bar: true });
    });
    it('should warn invalid property values that are invalid ', () => {
      const objMatcher = Coerce.object(match => ({
        ...match('foo', Coerce.boolean),
        ...match('bar', Coerce.boolean)
      }));
      const example = Coerce.warn(objMatcher);
      expect(example({ foo: 1, bar: true })).to.deep.equal({ bar: true });
    });

    it('should apply default', () => {
      const example = Coerce.object(match => ({
        ...match('foo', Coerce.default(Coerce.boolean, true)),
        ...match('bar', Coerce.boolean)
      }));
      expect(example({})).to.deep.equal({ foo: true });
    });

    it('should not apply default', () => {
      const example = Coerce.object(match => ({
        ...match('foo', Coerce.default(Coerce.boolean, true)),
        ...match('bar', Coerce.boolean)
      }));
      expect(example({}, { applyDefaults: false })).to.deep.equal({});
    });

    it('should catch required property in defaultMatch', () => {
      const example = Coerce.object(match => ({
        ...match('foo', Coerce.require(Coerce.boolean)),
        ...match('bar', Coerce.boolean)
      }));
      expect(example({ foo: true })).to.deep.equal({ foo: true });
    });

    it('should throw when required property is missing', () => {
      const example = Coerce.object(match => ({
        ...match('foo', Coerce.require(Coerce.boolean)),
        ...match('bar', Coerce.boolean)
      }));
      expect(() => example({})).to.throw();
    });

    context('unrecognized property warnings', () => {
      it('should warn unrecognized by default', () => {
        const core = Coerce.object(match => ({
          ...match('foo', Coerce.boolean),
          ...match('bar', Coerce.boolean)
        }));
        const example = Coerce.warn(core);
        expect(example({ baz: true })).to.deep.equal({});
        expect(unrecognizedWarningStub.calledOnce).to.equal(true);
      });
      it('should warn unrecognized explicit warn', () => {
        const example = Coerce.object(match => ({
          ...match('foo', Coerce.boolean),
          ...match('bar', Coerce.boolean)
        }));
        expect(example({ baz: true }, { warn: true })).to.deep.equal({});
        expect(unrecognizedWarningStub.calledOnce).to.equal(true);
      });
      it('should warn unrecognized explicit warnUnrecognized', () => {
        const example = Coerce.object(match => ({
          ...match('foo', Coerce.boolean),
          ...match('bar', Coerce.boolean)
        }));
        expect(example({ baz: true }, { warnUnrecognized: true })).to.deep.equal({});
        expect(unrecognizedWarningStub.calledOnce).to.equal(true);
      });
      it('should not warn unrecognized mismatch warn: false', () => {
        const example = Coerce.object(match => ({
          ...match('foo', Coerce.boolean),
          ...match('bar', Coerce.boolean)
        }));
        expect(example({ baz: true }, { warn: false, warnUnrecognized: true })).to.deep.equal({});
        expect(unrecognizedWarningStub.calledOnce).to.equal(false);
      });
      it('should not warn unrecognized mismatch warnUnrecognized: false', () => {
        const example = Coerce.object(match => ({
          ...match('foo', Coerce.boolean),
          ...match('bar', Coerce.boolean)
        }));
        expect(example({ baz: true }, { warn: true, warnUnrecognized: false })).to.deep.equal({});
        expect(unrecognizedWarningStub.calledOnce).to.equal(false);
      });
    });
  });

  context('.objectExact()', () => {
    it('should coerce', () => {
      const example = Coerce.objectExact(match => ({
        ...match('foo', Coerce.boolean),
        ...match('bar', Coerce.boolean)
      }));
      const expected = { foo: true };
      expect(example({ foo: true, BAR: true })).to.deep.equal(expected);
      expect(example({ foo: 'true', BAR: 'true' })).to.deep.equal(expected);
      expect(example({ foo: ['true'], BAR: ['true'] })).to.deep.equal(expected);
    });
    it('should warn when invalid property', () => {
      const core = Coerce.objectExact(match => ({
        ...match('foo', Coerce.boolean),
        ...match('bar', Coerce.boolean)
      }));
      const example = Coerce.warn(core);
      expect(example({ foo: 1 })).to.deep.equal({});
      expect(errorWarningStub.calledOnce).to.equal(true);
    });
    it('should return error if not invoked with object', () => {
      const example = Coerce.objectExact(match => ({
        ...match('foo', Coerce.boolean),
        ...match('bar', Coerce.boolean)
      }));
      expect(example(1)).to.be.instanceOf(CoerceError);
    });
    it('should not apply default', () => {
      const example = Coerce.objectExact(match => ({
        ...match('foo', Coerce.default(Coerce.boolean, true)),
        ...match('bar', Coerce.boolean)
      }));
      expect(example({}, { applyDefaults: false })).to.deep.equal({});
    });
    context('unrecognized property warnings', () => {
      it('should warn unrecognized by default', () => {
        const core = Coerce.objectExact(match => ({
          ...match('foo', Coerce.boolean),
          ...match('bar', Coerce.boolean)
        }));
        const example = Coerce.warn(core);
        expect(example({ baz: true })).to.deep.equal({});
        expect(unrecognizedWarningStub.calledOnce).to.equal(true);
      });
      it('should warn unrecognized explicit warn', () => {
        const example = Coerce.objectExact(match => ({
          ...match('foo', Coerce.boolean),
          ...match('bar', Coerce.boolean)
        }));
        expect(example({ baz: true }, { warn: true })).to.deep.equal({});
        expect(unrecognizedWarningStub.calledOnce).to.equal(true);
      });
      it('should warn unrecognized explicit warnUnrecognized', () => {
        const example = Coerce.objectExact(match => ({
          ...match('foo', Coerce.boolean),
          ...match('bar', Coerce.boolean)
        }));
        expect(example({ baz: true }, { warnUnrecognized: true })).to.deep.equal({});
        expect(unrecognizedWarningStub.calledOnce).to.equal(true);
      });
      it('should not warn unrecognized mismatch warn: false', () => {
        const example = Coerce.objectExact(match => ({
          ...match('foo', Coerce.boolean),
          ...match('bar', Coerce.boolean)
        }));
        expect(example({ baz: true }, { warn: false, warnUnrecognized: true })).to.deep.equal({});
        expect(unrecognizedWarningStub.calledOnce).to.equal(false);
      });
      it('should not warn unrecognized mismatch warnUnrecognized: false', () => {
        const example = Coerce.objectExact(match => ({
          ...match('foo', Coerce.boolean),
          ...match('bar', Coerce.boolean)
        }));
        expect(example({ baz: true }, { warn: true, warnUnrecognized: false })).to.deep.equal({});
        expect(unrecognizedWarningStub.calledOnce).to.equal(false);
      });
    });
  });

  context('.enum()', () => {
    it('should coerce', () => {
      const example = Coerce.enum({ Compressor });
      expect(example('snappy')).to.equal('snappy');
      expect(example('SnApPy')).to.equal('snappy');
      expect(example('SNAPPY')).to.equal('snappy');
    });
    it('should coerce array of strings', () => {
      const example = Coerce.enum({ Compressor });
      expect(example(['snappy'])).to.equal('snappy');
      expect(example(['SnApPy'])).to.equal('snappy');
      expect(example(['SNAPPY'])).to.equal('snappy');
    });
    it('should iterate enum using second enum', () => {
      const example = Coerce.enum({ Compressor });
      expect(example('zlib')).to.equal('zlib');
      expect(example('ZLIB')).to.equal('zlib');
    });
    it('should fail', () => {
      const example = Coerce.enum({ Compressor });
      expect(example('meow')).to.be.instanceOf(CoerceError);
    });
    it('should error if invalid type', () => {
      const example = Coerce.enum({ Compressor });
      expect(example(1)).to.be.instanceOf(CoerceError);
    });
  });

  context('.enumExact()', () => {
    it('should coerce', () => {
      const example = Coerce.enumExact({ Compressor });
      expect(example('snappy')).to.equal('snappy');
      expect(example('SnApPy')).to.be.instanceof(CoerceError);
      expect(example('SNAPPY')).to.be.instanceof(CoerceError);
    });
    it('should coerce string of arrays', () => {
      const example = Coerce.enumExact({ Compressor });
      expect(example(['snappy'])).to.equal('snappy');
      expect(example(['SnApPy'])).to.be.instanceof(CoerceError);
      expect(example(['SNAPPY'])).to.be.instanceof(CoerceError);
    });
    it('should be an error', () => {
      const example = Coerce.enumExact({ Compressor });
      expect(example('meow')).to.be.instanceof(CoerceError);
      expect(example(1)).to.be.instanceof(CoerceError);
    });
  });

  context('.default()', () => {
    it('should apply default', () => {
      const example = Coerce.default(Coerce.string, 'love');
      expect(example()).to.equal('love');
      expect(example('hi')).to.equal('hi');
    });
  });

  context('.require()', () => {
    it('should throw if error', () => {
      const example = Coerce.require(Coerce.string);
      expect(() => example()).to.throw();
      expect(() => example('hi')).not.to.throw();
    });
  });

  context('.tags()', () => {
    it('should coerce', () => {
      const example = Coerce.tags;
      expect(example('loc:nyc,abc:dc')).to.deep.equal(['loc:nyc', 'abc:dc']);
      expect(example(['loc:nyc', 'abc:dc'])).to.deep.equal(['loc:nyc', 'abc:dc']);
      expect(example({ loc: 'nyc', abc: 'dc' })).to.deep.equal(['loc:nyc', 'abc:dc']);
    });
    it('should filter out non-string options', () => {
      const example = Coerce.tags;
      expect(example({ loc: true, abc: 'dc' })).to.deep.equal(['abc:dc']);
      expect(example({ loc: null, abc: 'dc' })).to.deep.equal(['abc:dc']);
      expect(example({ loc: 1, abc: 'dc' })).to.deep.equal(['abc:dc']);
    });
    it('should not coerce', () => {
      const example = Coerce.tags;
      expect(example(1)).to.be.instanceOf(CoerceError);
    });
  });

  context('.keyValue()', () => {
    it('should coerce', () => {
      const value = 'SERVICE_NAME:foo,CANONICALIZE_HOST_NAME:true,SERVICE_REALM:bar';
      expect(Coerce.keyValue(value)).to.deep.equal({
        SERVICE_NAME: 'foo',
        CANONICALIZE_HOST_NAME: 'true',
        SERVICE_REALM: 'bar'
      });
    });

    it('should not include key:value when missing :', () => {
      const value = 'SERVICE_NAMEfoo,CANONICALIZE_HOST_NAME:true,SERVICE_REALM:bar';
      expect(Coerce.keyValue(value)).to.deep.equal({
        CANONICALIZE_HOST_NAME: 'true',
        SERVICE_REALM: 'bar'
      });
    });

    it('should result in CoerceError', () => {
      expect(Coerce.keyValue(true)).to.be.instanceOf(CoerceError);
    });
  });

  context('.deprecate()', () => {
    it('should give deprecate warning', () => {
      const s = Coerce.deprecate(Coerce.string);
      expect(s('hi')).to.equal('hi');
      expect(deprecationWarningStub.calledOnce).to.equal(true);
    });
    it('should give better deprecate warning when id is passed', () => {
      const s = Coerce.deprecate(Coerce.string);
      expect(s('hi', { id: 'some test variable' })).to.equal('hi');
      expect(deprecationWarningStub.calledOnce).to.equal(true);
    });
    it('should not give deprecate warning when explicit warn: false', () => {
      const s = Coerce.deprecate(Coerce.string);
      expect(s('hi', { warn: false })).to.equal('hi');
      expect(deprecationWarningStub.calledOnce).to.equal(false);
    });
    it('should not give deprecate warning when explicit warnDeprecated: false', () => {
      const s = Coerce.deprecate(Coerce.string);
      expect(s('hi', { warnDeprecated: false })).to.equal('hi');
      expect(deprecationWarningStub.calledOnce).to.equal(false);
    });
  });

  context('.warn()', () => {
    it('should not warn when no issues', () => {
      const s = Coerce.warn(Coerce.string);
      expect(s('hi')).to.equal('hi');
      expect(errorWarningStub.calledOnce).to.equal(false);
    });
    it('should warn when issues by default', () => {
      const s = Coerce.warn(Coerce.string);
      expect(s(1)).to.be.instanceOf(CoerceError);
      expect(errorWarningStub.calledOnce).to.equal(true);
    });
    it('should not warn when explicitly flagged', () => {
      const s = Coerce.warn(Coerce.string);
      expect(s(1, { warn: false })).to.be.instanceOf(CoerceError);
      expect(errorWarningStub.calledOnce).to.equal(false);
    });
  });

  context('.buffer()', () => {
    it('should coerce', () => {
      const buffBaby = Buffer.alloc(10);
      expect(Coerce.buffer(buffBaby)).to.equal(buffBaby);
    });
    it('should not coerce', () => {
      expect(Coerce.buffer('hi')).to.be.instanceOf(CoerceError);
      expect(Coerce.buffer(1)).to.be.instanceOf(CoerceError);
    });
  });

  context('.function()', () => {
    it('should coerce', () => {
      const fn = () => {};
      expect(Coerce.function(fn)).to.equal(fn);
    });
    it('should not coerce', () => {
      expect(Coerce.function('hi')).to.be.instanceOf(CoerceError);
      expect(Coerce.function(1)).to.be.instanceOf(CoerceError);
    });
  });

  context('.null()', () => {
    it('should coerce', () => {
      expect(Coerce.null(null)).to.equal(null);
    });
    it('should not coerce', () => {
      expect(Coerce.null('hi')).to.be.instanceOf(CoerceError);
      expect(Coerce.null(1)).to.be.instanceOf(CoerceError);
      expect(Coerce.null(undefined)).to.be.instanceOf(CoerceError);
    });
  });

  context('.any()', () => {
    it('should coerce', () => {
      expect(Coerce.any(1)).to.equal(1);
      expect(Coerce.any('hello')).to.equal('hello');
      expect(Coerce.any(true)).to.equal(true);
    });
  });

  context('.given()', () => {
    it('should coerce given number', () => {
      const example = Coerce.given(1);
      expect(example(1)).to.equal(1);
      expect(example(2)).to.be.instanceOf(CoerceError);
      expect(example(null)).to.be.instanceOf(CoerceError);
      expect(example('hi')).to.be.instanceOf(CoerceError);
      expect(example(1000)).to.be.instanceOf(CoerceError);
    });
    it('should coerce given string', () => {
      const example = Coerce.given('hello');
      expect(example('HELLO')).to.equal('hello');
      expect(example('hello')).to.equal('hello');
      expect(example(2)).to.be.instanceOf(CoerceError);
      expect(example(null)).to.be.instanceOf(CoerceError);
      expect(example('hi')).to.be.instanceOf(CoerceError);
      expect(example(1000)).to.be.instanceOf(CoerceError);
    });
  });

  context('.givenExact()', () => {
    it('should coerce given string', () => {
      const example = Coerce.givenExact('hello');
      expect(example('hello')).to.equal('hello');
      expect(example('HELLO')).to.be.instanceOf(CoerceError);
      expect(example(2)).to.be.instanceOf(CoerceError);
      expect(example(null)).to.be.instanceOf(CoerceError);
      expect(example('hi')).to.be.instanceOf(CoerceError);
      expect(example(1000)).to.be.instanceOf(CoerceError);
    });
  });

  context('.array()', () => {
    it('should coerce array of strings', () => {
      const example = Coerce.array(Coerce.string);
      expect(example('meow')).to.deep.equal(['meow']);
      expect(example(['meow'])).to.deep.equal(['meow']);
      expect(example([])).to.deep.equal([]);
    });
    it('should warn if array contains invalid value', () => {
      const example = Coerce.array(Coerce.string);
      expect(example([null, 'meow'])).to.deep.equal(['meow']);
      expect(errorWarningStub.calledOnce).to.equal(true);
    });
    it('should not warn if explicit', () => {
      const example = Coerce.array(Coerce.string);
      expect(example([null, 'meow'], { warn: false })).to.deep.equal(['meow']);
      expect(errorWarningStub.calledOnce).to.equal(false);
    });
  });

  context('.compose()', () => {
    it('should chain keyValue with object', () => {
      const loveObj = Coerce.object(match => ({
        ...match('love', Coerce.boolean)
      }));
      const example = Coerce.compose(Coerce.keyValue, loveObj);
      expect(example('love:true')).to.deep.equal({ love: true });
    });
    it('should error', () => {
      const loveObj = Coerce.object(match => ({
        ...match('love', Coerce.boolean),
        ...match('marriage', Coerce.require(Coerce.boolean))
      }));
      const example = Coerce.compose(Coerce.keyValue, loveObj);
      expect(example('love:true')).to.be.instanceOf(CoerceError);
    });
    it('should should halt once error has bubbled', () => {
      const loveObj = Coerce.object(match => ({
        ...match('love', Coerce.boolean),
        ...match('marriage', Coerce.require(Coerce.boolean))
      }));
      const example = Coerce.compose(Coerce.keyValue, loveObj, () => {});
      expect(example('love:true')).to.be.instanceOf(CoerceError);
    });
  });

  context('.commaSeparated()', () => {
    it('should coerce comma separated string', () => {
      expect(Coerce.commaSeparated('snappy,zlib')).to.deep.equal(['snappy', 'zlib']);
      expect(Coerce.commaSeparated('snappy')).to.deep.equal(['snappy']);
    });
    it('should be error', () => {
      expect(Coerce.commaSeparated(1)).to.be.instanceOf(CoerceError);
    });
  });

  context('.collide()', () => {
    it('should handle collisions', () => {
      expect(Coerce.collide(true)(false, false)).to.equal(false);
      expect(Coerce.collide(true)(true, false)).to.equal(false);
      expect(Coerce.collide(true)(true, false)).to.equal(false);
      expect(Coerce.collide(true)(true, true)).to.equal(true);

      expect(Coerce.collide('foo')('foo', 'foo')).to.equal('foo');
      expect(Coerce.collide('foo')('bar', 'baz')).to.equal('bar');
      expect(Coerce.collide('foo')('foo', 'baz')).to.equal('baz');
      expect(Coerce.collide('foo')(undefined, 'foo')).to.equal('foo');
      expect(Coerce.collide('foo')('foo', undefined, 'baz')).to.equal('baz');
    });
  });
});
