'use strict';
const sinon = require('sinon');
const chai = require('chai');
const { CoerceCustom } = require('../../../src/options/coerce_custom');
const expect = chai.expect;
const Errors = require('../../../src/options/coerce_error');
const { ReadConcernLevel } = require('../../../src/options/types');

describe('CoerceCustom', () => {
  let unrecognizedWarningStub;
  beforeEach(() => {
    unrecognizedWarningStub = sinon.stub(Errors.CoerceUnrecognized.prototype, 'warn').returns({});
  });

  afterEach(() => {
    Errors.CoerceUnrecognized.prototype.warn.restore();
  });

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
      expect(unrecognizedWarningStub.calledOnce).to.equal(true);
    });
    it('should have clientOptions take precedence', () => {
      const results = CoerceCustom.mongoClientOptions(
        { replicaSet: 'a' },
        { replicaSet: 'b' },
        { warn: false }
      );
      expect(results.replicaSet).to.be.equal('b');
    });
    it('should resolve appName/appname collision', () => {
      const results = CoerceCustom.mongoClientOptions(
        { appName: 'a' },
        { appname: 'b' },
        { warn: false }
      );
      expect(results.appname).to.be.equal('a');
      expect(results.appName).to.be.equal('a');
    });

    it('should resolve autoReconnect/auto_reconnect collision', () => {
      const results = CoerceCustom.mongoClientOptions(
        { autoReconnect: 'false' },
        { auto_reconnect: 'false', autoReconnect: 'true' },
        { warn: false }
      );
      expect(results.autoReconnect).to.be.equal(false);
      expect(results.auto_reconnect).to.be.equal(false);
    });

    it('should resolve autoReconnect/auto_reconnect collision #2', () => {
      const results = CoerceCustom.mongoClientOptions(
        {},
        { auto_reconnect: 'true' },
        { warn: false }
      );
      expect(results.autoReconnect).to.be.equal(true);
      expect(results.auto_reconnect).to.be.equal(true);
    });

    it('should resolve autoReconnect/auto_reconnect collision #3', () => {
      const results = CoerceCustom.mongoClientOptions(
        {},
        { auto_reconnect: 'false' },
        { warn: false }
      );
      expect(results.autoReconnect).to.be.equal(false);
      expect(results.auto_reconnect).to.be.equal(false);
    });

    it('should resolve wtimeoutMS/wtimeout undefined', () => {
      const results = CoerceCustom.mongoClientOptions({}, {}, { warn: false });
      expect(results.wtimeoutMS).to.be.equal(undefined);
      expect(results.wtimeout).to.be.equal(undefined);
      expect(results.writeConcern.wtimeout).to.be.equal(undefined);
    });
    it('should resolve wtimeoutMS/wtimeout wtimeoutMS', () => {
      const results = CoerceCustom.mongoClientOptions({}, { wtimeoutMS: 1000 }, { warn: false });
      expect(results.wtimeoutMS).to.be.equal(1000);
      expect(results.wtimeout).to.be.equal(1000);
      expect(results.writeConcern.wtimeout).to.be.equal(1000);
    });
    it('should resolve wtimeoutMS/wtimeout wtimeoutMS', () => {
      const results = CoerceCustom.mongoClientOptions({}, { wtimeout: 1000 }, { warn: false });
      expect(results.wtimeoutMS).to.be.equal(1000);
      expect(results.wtimeout).to.be.equal(1000);
      expect(results.writeConcern.wtimeout).to.be.equal(1000);
    });
    it('should resolve readConcern.level/readConcernLevel', () => {
      const results = CoerceCustom.mongoClientOptions(
        {},
        { readConcernLevel: ReadConcernLevel.majority },
        { warn: false }
      );
      expect(results.readConcern.level).to.be.equal(ReadConcernLevel.majority);
      expect(results.readConcernLevel).to.be.equal(ReadConcernLevel.majority);
    });
    it('should resolve readConcern.level/readConcernLevel #2', () => {
      const results = CoerceCustom.mongoClientOptions(
        {},
        {
          readConcern: {
            level: ReadConcernLevel.majority
          }
        },
        { warn: false }
      );
      expect(results.readConcern.level).to.be.equal(ReadConcernLevel.majority);
      expect(results.readConcernLevel).to.be.equal(ReadConcernLevel.majority);
    });

    it('should resolve compressors/compression', () => {
      const results = CoerceCustom.mongoClientOptions(
        { compressors: 'snappy' },
        {
          compression: 'zlib'
        },
        { warn: false }
      );
      expect(results.compressors).to.deep.equal(['snappy', 'zlib']);
      expect(results.compression).to.deep.equal('snappy');
    });

    it('should resolve compressors/compression #2', () => {
      const results = CoerceCustom.mongoClientOptions(
        {},
        {
          compression: 'zlib'
        },
        { warn: false }
      );
      expect(results.compressors).to.deep.equal(['zlib']);
      expect(results.compression).to.deep.equal('zlib');
    });
  });
  context('.readPreferenceFromOptions()', () => {
    it('should create readPreference empty object', () => {
      const result = CoerceCustom.readPreferenceFromOptions({});
      expect(result).to.deep.equal({ mode: 'primary', tags: [] });
    });
    it('should create readPreference nothing', () => {
      const result = CoerceCustom.readPreferenceFromOptions();
      expect(result).to.deep.equal({ mode: 'primary', tags: [] });
    });
    it('should create readPreference from string', () => {
      const result = CoerceCustom.readPreferenceFromOptions({
        readPreference: 'primary'
      });
      expect(result).to.deep.equal({ mode: 'primary', tags: [] });
    });
    it('should create readPreference with just maxStalenessSeconds', () => {
      const result = CoerceCustom.readPreferenceFromOptions({
        maxStalenessSeconds: 1000
      });
      expect(result).to.deep.equal({ mode: 'primary', tags: [], maxStalenessSeconds: 1000 });
    });
    it('should create readPreference with just tags', () => {
      const result = CoerceCustom.readPreferenceFromOptions({
        readPreferenceTags: ['loc:nyc']
      });
      expect(result).to.deep.equal({ mode: 'primary', tags: ['loc:nyc'] });
    });
    it('should create readPreference from string with maxStalenessSeconds', () => {
      const result = CoerceCustom.readPreferenceFromOptions({
        readPreference: 'primary',
        maxStalenessSeconds: 1000
      });
      expect(result).to.deep.equal({ mode: 'primary', tags: [], maxStalenessSeconds: 1000 });
    });
    it('should create readPreference from object with maxStalenessSeconds', () => {
      const result = CoerceCustom.readPreferenceFromOptions({
        readPreference: {
          mode: 'primary'
        },
        maxStalenessSeconds: 1000
      });
      expect(result).to.deep.equal({ mode: 'primary', tags: [], maxStalenessSeconds: 1000 });
    });
    it('should create use readPreference objects maxStalenessSeconds', () => {
      const result = CoerceCustom.readPreferenceFromOptions({
        readPreference: {
          mode: 'primary',
          maxStalenessSeconds: 3000
        },
        maxStalenessSeconds: 1000
      });
      expect(result).to.deep.equal({ mode: 'primary', tags: [], maxStalenessSeconds: 3000 });
    });

    it('should merge tags and readPreferenceTags', () => {
      const result = CoerceCustom.readPreferenceFromOptions({
        readPreference: {
          mode: 'primary',
          tags: ['hello:world']
        },
        readPreferenceTags: ['foo:bar']
      });
      expect(result).to.deep.equal({
        mode: 'primary',
        tags: ['hello:world', 'foo:bar']
      });
    });
  });

  context('.readConcern()', () => {
    it('should be default with empty object', () => {
      const result = CoerceCustom.readConcern({});
      expect(result).to.deep.equal({
        level: ReadConcernLevel.local
      });
    });
    it('should resolve level', () => {
      const result = CoerceCustom.readConcern({ level: ReadConcernLevel.majority });
      expect(result).to.deep.equal({
        level: ReadConcernLevel.majority
      });
    });
  });

  context('.auth()', () => {
    it('should be default with empty object', () => {
      const result = CoerceCustom.auth({});
      expect(result).to.deep.equal({});
    });
    it('should coerce', () => {
      const result = CoerceCustom.auth({
        user: 'thomas',
        pass: 'pass'
      });
      expect(result).to.deep.equal({
        user: 'thomas',
        pass: 'pass'
      });
    });
  });

  context('.driverInfo()', () => {
    it('should be default with empty object', () => {
      const result = CoerceCustom.driverInfo({});
      expect(result).to.deep.equal({});
    });
    it('should coerce', () => {
      const result = CoerceCustom.driverInfo({
        name: 'name',
        version: 'version',
        platform: 'platform'
      });
      expect(result).to.deep.equal({
        name: 'name',
        version: 'version',
        platform: 'platform'
      });
    });
  });

  context('.collide()', () => {
    it('should handle collisions', () => {
      expect(CoerceCustom.collide(true)(false, false)).to.equal(false);
      expect(CoerceCustom.collide(true)(true, false)).to.equal(false);
      expect(CoerceCustom.collide(true)(true, false)).to.equal(false);
      expect(CoerceCustom.collide(true)(true, true)).to.equal(true);

      expect(CoerceCustom.collide('foo')('foo', 'foo')).to.equal('foo');
      expect(CoerceCustom.collide('foo')('bar', 'baz')).to.equal('bar');
      expect(CoerceCustom.collide('foo')('foo', 'baz')).to.equal('baz');
      expect(CoerceCustom.collide('foo')(undefined, 'foo')).to.equal('foo');
      expect(CoerceCustom.collide('foo')('foo', undefined, 'baz')).to.equal('baz');
    });
  });

  context('.compressors()', () => {
    it('should deduce compressors', () => {
      [
        CoerceCustom.compressors(['snappy', 'invalid', 'zlib'], { warn: false }),
        CoerceCustom.compressors('snappy,invalid,zlib', { warn: false })
      ].forEach(r => expect(r).to.deep.equal(['snappy', 'zlib']));
    });
  });
});
