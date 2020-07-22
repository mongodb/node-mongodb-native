'use strict';
const chai = require('chai');
const { CoerceCustom } = require('../../../src/options/coerce_custom');
const { Coerce } = require('../../../src/options/coerce');
const expect = chai.expect;

describe('CoerceCustom', () => {
  context('.readPreference()', () => {
    const rp = CoerceCustom.readPreference;
    it('should coerce', () => {
      expect(rp({})).to.deep.equal({ mode: 'primary', tags: [] });
      expect(rp({ mode: 'secondary' })).to.deep.equal({ mode: 'secondary', tags: [] });
      const expected = {
        mode: 'secondary',
        tags: ['loc:nyc', 'abc:dc']
      };
      expect(rp({ mode: 'secondary', tags: 'loc:nyc,abc:dc' })).to.deep.equal(expected);
      expect(rp({ mode: 'secondary', tags: ['loc:nyc', 'abc:dc'] })).to.deep.equal(expected);
      expect(rp({ mode: 'secondary', tags: { loc: 'nyc', abc: 'dc' } })).to.deep.equal(expected);

      expect(
        rp({
          maxStalenessSeconds: 1000,
          mode: 'secondary',
          tags: { loc: 'nyc', abc: 'dc' },
          hedge: { enable: true }
        })
      ).to.deep.equal({
        mode: 'secondary',
        tags: ['loc:nyc', 'abc:dc'],
        maxStalenessSeconds: 1000,
        hedge: { enable: true }
      });
    });
  });

  context('.authMechanismPropertiesOption()', () => {
    it('should convert from object', () => {
      const coercer = CoerceCustom.authMechanismPropertiesOption;
      const results = coercer({
        SERVICE_NAME: 'example',
        CANONICALIZE_HOST_NAME: 'true',
        SERVICE_REALM: 'the-realm'
      });
      expect(results).to.deep.equal({
        SERVICE_NAME: 'example',
        CANONICALIZE_HOST_NAME: true,
        SERVICE_REALM: 'the-realm'
      });
    });
    it('should convert from string', () => {
      const coercer = CoerceCustom.authMechanismPropertiesOption;
      const results = coercer('SERVICE_NAME:foo,CANONICALIZE_HOST_NAME:true,SERVICE_REALM:bar');
      expect(results).to.deep.equal({
        SERVICE_NAME: 'foo',
        CANONICALIZE_HOST_NAME: true,
        SERVICE_REALM: 'bar'
      });
    });
  });

  context('.mongoClientOptions()', () => {
    it('should work with lowercase key for UriOptions', () => {
      const results = CoerceCustom.mongoClientOptions({ replicaset: 'rs' }, {});
      expect(results.replicaSet).to.be.equal('rs');
    });
    it('should work with normalized key for ClientOptions', () => {
      const results = CoerceCustom.mongoClientOptions({}, { replicaSet: 'rs' });
      expect(results.replicaSet).to.be.equal('rs');
    });
    it('should have clientOptions to be case sensitive', () => {
      const results = CoerceCustom.mongoClientOptions({}, { replicaset: 'rs' }, { warn: false });
      expect(results.replicaSet).to.be.equal(undefined);
    });
    it('should have clientOptions take precedence', () => {
      const results = CoerceCustom.mongoClientOptions(
        { replicaSet: 'a' },
        { replicaSet: 'b' },
        { warn: false }
      );
      expect(results.replicaSet).to.be.equal('b');
    });
  });
});
