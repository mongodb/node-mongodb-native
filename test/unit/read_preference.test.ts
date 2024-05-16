import { expect } from 'chai';

import { ReadPreference } from '../mongodb';

describe('class ReadPreference', function () {
  const maxStalenessSeconds = 1234;
  const { PRIMARY, PRIMARY_PREFERRED, SECONDARY, SECONDARY_PREFERRED, NEAREST } = ReadPreference;
  const TAGS = [{ loc: 'dc' }];

  describe('::constructor', function () {
    it('should accept (mode)', function () {
      expect(new ReadPreference(PRIMARY)).to.be.an.instanceOf(ReadPreference);
    });

    it('should accept valid (mode, tags)', function () {
      expect(new ReadPreference(PRIMARY, [])).to.be.an.instanceOf(ReadPreference);
      const p0 = new ReadPreference(NEAREST, TAGS);
      expect(p0).to.have.property('mode', NEAREST);
    });

    it('should not accept invalid tags', function () {
      expect(() => new ReadPreference(PRIMARY, 'invalid' as any)).to.throw(
        'ReadPreference tags must be an array'
      );
      expect(
        () => new ReadPreference(PRIMARY, { loc: 'dc' } as any, { maxStalenessSeconds })
      ).to.throw('ReadPreference tags must be an array');
    });

    it('should accept (mode, options)', function () {
      const p1 = new ReadPreference(SECONDARY, { maxStalenessSeconds } as any);
      expect(p1.mode).to.equal(SECONDARY);
      expect(p1).to.have.property('maxStalenessSeconds', maxStalenessSeconds);
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

    it('should not accept mode=primary + options.hedge enabled', function () {
      expect(() => new ReadPreference(PRIMARY, null, { hedge: { enabled: true } })).to.throw(
        'Primary read preference cannot be combined with hedge'
      );
    });

    it('should accept (mode=secondary, tags=null, options)', function () {
      const p2 = new ReadPreference(SECONDARY, null, { maxStalenessSeconds });
      expect(p2).to.be.an.instanceOf(ReadPreference);
      expect(p2).to.have.property('mode', SECONDARY);
      expect(p2).to.have.property('maxStalenessSeconds', maxStalenessSeconds);
    });

    it('should accept (mode=secondary, tags, options)', function () {
      const p3 = new ReadPreference(SECONDARY, TAGS, { maxStalenessSeconds });
      expect(p3).to.be.an.instanceOf(ReadPreference);
      expect(p3).to.have.property('mode', SECONDARY);
      expect(p3.tags).to.deep.equal(TAGS);
      expect(p3).to.have.property('maxStalenessSeconds', maxStalenessSeconds);
    });

    it('should not accept (mode, options, tags)', function () {
      expect(
        () => new ReadPreference(PRIMARY, { maxStalenessSeconds } as any, TAGS as any)
      ).to.throw('ReadPreference tags must be an array');
    });
  });

  describe('fromOptions factory method', () => {
    it('should return undefined if no options are passed', () => {
      const readPreference = ReadPreference.fromOptions();
      expect(readPreference).to.be.undefined;
    });

    describe('readPreference is string', () => {
      it('should accept { readPreference }', function () {
        const readPreference = ReadPreference.fromOptions({
          readPreference: PRIMARY
        });
        expect(readPreference).to.be.an.instanceOf(ReadPreference);
        expect(readPreference).to.have.property('mode', PRIMARY);
      });

      it('should accept { readPreference, readPreferenceTags }', function () {
        const readPreference = ReadPreference.fromOptions({
          readPreference: SECONDARY,
          readPreferenceTags: TAGS
        });
        expect(readPreference).to.be.an.instanceOf(ReadPreference);
        expect(readPreference).to.have.property('mode', SECONDARY);
        expect(readPreference.tags).to.deep.equal(TAGS);
      });

      it('should accept { readPreference, maxStalenessSeconds }', function () {
        const readPreference = ReadPreference.fromOptions({
          readPreference: SECONDARY,
          maxStalenessSeconds: maxStalenessSeconds
        });
        expect(readPreference).to.be.an.instanceOf(ReadPreference);
        expect(readPreference).to.have.property('mode', SECONDARY);
        expect(readPreference).to.have.property('maxStalenessSeconds', maxStalenessSeconds);
      });

      it('should accept { readPreference, hedge }', function () {
        const readPreference = ReadPreference.fromOptions({
          readPreference: SECONDARY,
          hedge: {
            enabled: true
          }
        });
        expect(readPreference).to.be.an.instanceOf(ReadPreference);
        expect(readPreference).to.have.property('mode', SECONDARY);
        expect(readPreference.hedge).to.deep.equal({ enabled: true });
      });
    });

    it('should not accept mode=primary + options.hedge', function () {
      expect(() =>
        ReadPreference.fromOptions({ readPreference: PRIMARY, hedge: { enabled: true } })
      ).to.throw('Primary read preference cannot be combined with hedge');
    });

    it('should not accept mode=primary + options.maxStalenessSeconds', function () {
      expect(() =>
        ReadPreference.fromOptions({ readPreference: PRIMARY, maxStalenessSeconds })
      ).to.throw('Primary read preference cannot be combined with maxStalenessSeconds');
    });
  });

  describe('secondaryOk()', function () {
    it('should be false when readPreference is Primary', function () {
      const readPreference = ReadPreference.fromOptions({
        readPreference: PRIMARY
      });
      expect(readPreference.secondaryOk()).to.be.false;
    });

    it('should be true when readPreference is Primary Preferred', function () {
      const readPreference = ReadPreference.fromOptions({
        readPreference: PRIMARY_PREFERRED
      });
      expect(readPreference.secondaryOk()).to.be.true;
    });

    it('should be true when readPreference is Secondary', function () {
      const readPreference = ReadPreference.fromOptions({
        readPreference: SECONDARY
      });
      expect(readPreference.secondaryOk()).to.be.true;
    });

    it('should be true when readPreference is Secondary Preferred', function () {
      const readPreference = ReadPreference.fromOptions({
        readPreference: SECONDARY_PREFERRED
      });
      expect(readPreference.secondaryOk()).to.be.true;
    });

    it('should be true when readPreference is Nearest', function () {
      const readPreference = ReadPreference.fromOptions({
        readPreference: NEAREST
      });
      expect(readPreference.secondaryOk()).to.be.true;
    });
  });
});
