'use strict';

const { ReadPreference } = require('../../src');
const chai = require('chai');
chai.use(require('chai-subset'));
const expect = chai.expect;

describe.only('ReadPreference', function () {
  describe('::constructor', function () {
    const maxStalenessSeconds = 1234;
    const { PRIMARY, SECONDARY, NEAREST } = ReadPreference;
    const TAGS = [{ loc: 'dc' }];

    it('should accept (mode)', function () {
      expect(new ReadPreference(PRIMARY)).to.be.an.instanceOf(ReadPreference);
    });

    it('should accept valid (mode, tags)', function () {
      expect(new ReadPreference(PRIMARY, [])).to.be.an.instanceOf(ReadPreference);
      const p0 = new ReadPreference(NEAREST, TAGS);
      expect(p0.mode).to.equal(NEAREST);
    });

    it('should not accept invalid tags', function () {
      expect(() => new ReadPreference(PRIMARY, 'invalid')).to.throw(
        'ReadPreference tags must be an array'
      );
      expect(() => new ReadPreference(PRIMARY, { loc: 'dc' }, { maxStalenessSeconds })).to.throw(
        'ReadPreference tags must be an array'
      );
    });

    it('should accept (mode, options)', function () {
      const p1 = new ReadPreference(SECONDARY, { maxStalenessSeconds });
      expect(p1.mode).to.equal(SECONDARY);
      expect(p1.maxStalenessSeconds).to.equal(maxStalenessSeconds);
    });

    it('should not accept mode=primary + tags', function () {
      expect(() => new ReadPreference(PRIMARY, TAGS)).to.throw(
        'Primary read preference cannot be combined with tags'
      );
    });

    it('should not accept mode=primary + options.maxStalenessSeconds', function () {
      expect(() => new ReadPreference(PRIMARY, null, { maxStalenessSeconds })).to.throw(
        'Primary read preference cannot be combined with maxStalenessSeconds'
      );
    });

    it('should accept (mode=secondary, tags=null, options)', function () {
      const p2 = new ReadPreference(SECONDARY, null, { maxStalenessSeconds });
      expect(p2).to.be.an.instanceOf(ReadPreference);
      expect(p2.mode).to.equal(SECONDARY);
      expect(p2.maxStalenessSeconds).to.equal(maxStalenessSeconds);
    });

    it('should accept (mode=secondary, tags, options)', function () {
      const p3 = new ReadPreference(SECONDARY, TAGS, { maxStalenessSeconds });
      expect(p3).to.be.an.instanceOf(ReadPreference);
      expect(p3.mode).to.equal(SECONDARY);
      expect(p3.tags).to.eql(TAGS);
      expect(p3.maxStalenessSeconds).to.equal(maxStalenessSeconds);
    });

    it('should not accept (mode, options, tags)', function () {
      expect(() => new ReadPreference(PRIMARY, { maxStalenessSeconds }, TAGS)).to.throw(
        'ReadPreference tags must be an array'
      );
    });
  });

  describe('fromOptions factory method', () => {
    const { PRIMARY, SECONDARY } = ReadPreference;
    const TAGS = [{ loc: 'dc' }];

    it('should return undefined if no options are passed', () => {
      const readPreference = ReadPreference.fromOptions();
      expect(readPreference).to.be.undefined;
    });

    context('readPreference is string', () => {
      it('should accept { readPreference }', function () {
        const readPreference = ReadPreference.fromOptions({
          readPreference: PRIMARY
        });
        expect(readPreference).to.be.an.instanceOf(ReadPreference);
        expect(readPreference.mode).to.equal(PRIMARY);
      });

      it('should accept { readPreference, readPreferenceTags }', function () {
        const readPreference = ReadPreference.fromOptions({
          readPreference: SECONDARY,
          readPreferenceTags: TAGS
        });
        expect(readPreference).to.be.an.instanceOf(ReadPreference);
        expect(readPreference.mode).to.equal(SECONDARY);
        expect(readPreference.tags).to.eql(TAGS);
      });

      it('should accept { readPreference, readPreferenceTags, hedge }', function () {
        const readPreference = ReadPreference.fromOptions({
          readPreference: SECONDARY,
          readPreferenceTags: TAGS,
          hedge: {
            enabled: true
          }
        });
        expect(readPreference).to.be.an.instanceOf(ReadPreference);
        expect(readPreference.mode).to.equal(SECONDARY);
        expect(readPreference.tags).to.eql(TAGS);
        expect(readPreference.hedge).to.eql({ enabled: true });
      });
    });
  });
});
