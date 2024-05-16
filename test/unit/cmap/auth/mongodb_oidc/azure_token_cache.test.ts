import { expect } from 'chai';

import { AzureTokenCache } from '../../../../mongodb';

describe('AzureTokenCache', function () {
  const tokenResultWithExpiration = Object.freeze({
    access_token: 'test',
    expires_in: 100
  });

  describe('#addEntry', function () {
    describe('when expiresInSeconds is provided', function () {
      const cache = new AzureTokenCache();
      let entry;

      before(function () {
        cache.addEntry('audience', tokenResultWithExpiration);
        entry = cache.getEntry('audience');
      });

      it('adds the token result', function () {
        expect(entry.token).to.equal('test');
      });

      it('creates an expiration', function () {
        expect(entry.expiration).to.be.within(Date.now(), Date.now() + 100 * 1000);
      });
    });
  });

  describe('#clear', function () {
    const cache = new AzureTokenCache();

    before(function () {
      cache.addEntry('audience', tokenResultWithExpiration);
      cache.clear();
    });

    it('clears the cache', function () {
      expect(cache.entries.size).to.equal(0);
    });
  });

  describe('#deleteEntry', function () {
    const cache = new AzureTokenCache();

    before(function () {
      cache.addEntry('audience', tokenResultWithExpiration);
      cache.deleteEntry('audience');
    });

    it('deletes the entry', function () {
      expect(cache.getEntry('audience')).to.not.exist;
    });
  });

  describe('#getEntry', function () {
    const cache = new AzureTokenCache();

    before(function () {
      cache.addEntry('audience1', tokenResultWithExpiration);
      cache.addEntry('audience2', tokenResultWithExpiration);
    });

    describe('when there is a matching entry', function () {
      it('returns the entry', function () {
        expect(cache.getEntry('audience1')?.token).to.equal('test');
      });
    });

    describe('when there is no matching entry', function () {
      it('returns undefined', function () {
        expect(cache.getEntry('audience')).to.equal(undefined);
      });
    });
  });
});
