'use strict';

const { Compressor } = require('../../../src/options/types');
const { Coerce } = require('../../../src/options/coerce');
const chai = require('chai');
const { CoerceError } = require('../../../src/options/coerce_error');
const expect = chai.expect;

describe('Coerce', () => {
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
    it('should coerce', () => {
      [
        Coerce.boolean(true),
        Coerce.boolean('true'),
        Coerce.boolean([true]),
        Coerce.boolean(['true'])
      ].forEach(v => {
        expect(v).to.equal(true);
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
  });

  context('.enum()', () => {
    it('should coerce', () => {
      const example = Coerce.enum({ Compressor });
      expect(example('snappy')).to.equal('snappy');
      expect(example('SnApPy')).to.equal('snappy');
      expect(example('SNAPPY')).to.equal('snappy');
    });
  });

  context('.enumExact()', () => {
    it('should coerce', () => {
      const example = Coerce.enumExact({ Compressor });
      expect(example('snappy')).to.equal('snappy');
      expect(example('SnApPy')).to.be.instanceof(CoerceError);
      expect(example('SNAPPY')).to.be.instanceof(CoerceError);
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
});
