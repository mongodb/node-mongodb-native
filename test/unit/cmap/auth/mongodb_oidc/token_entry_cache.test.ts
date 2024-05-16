import { expect } from 'chai';

import { type TokenEntry, TokenEntryCache } from '../../../../mongodb';

describe('TokenEntryCache', function () {
  const tokenResultWithExpiration = Object.freeze({
    accessToken: 'test',
    expiresInSeconds: 100
  });
  const serverResult = Object.freeze({
    issuer: 'test',
    clientId: '1'
  });
  const callbackHash = '1';

  describe('#addEntry', function () {
    describe('when expiresInSeconds is provided', function () {
      const cache = new TokenEntryCache();
      let entry;

      before(function () {
        cache.addEntry('localhost', 'user', callbackHash, tokenResultWithExpiration, serverResult);
        entry = cache.getEntry('localhost', 'user', callbackHash);
      });

      it('adds the token result', function () {
        expect(entry.tokenResult).to.deep.equal(tokenResultWithExpiration);
      });

      it('adds the server result', function () {
        expect(entry.serverInfo).to.deep.equal(serverResult);
      });

      it('creates an expiration', function () {
        expect(entry.expiration).to.be.within(Date.now(), Date.now() + 100 * 1000);
      });
    });

    describe('when expiresInSeconds is not provided', function () {
      const cache = new TokenEntryCache();
      let entry: TokenEntry | undefined;
      const expiredResult = Object.freeze({ accessToken: 'test' });

      before(function () {
        cache.addEntry('localhost', 'user', callbackHash, expiredResult, serverResult);
        entry = cache.getEntry('localhost', 'user', callbackHash);
      });

      it('sets an immediate expiration', function () {
        expect(entry?.expiration).to.be.at.most(Date.now());
      });
    });

    describe('when expiresInSeconds is null', function () {
      const cache = new TokenEntryCache();
      let entry: TokenEntry | undefined;
      const expiredResult = Object.freeze({
        accessToken: 'test',
        expiredInSeconds: null
      });

      before(function () {
        cache.addEntry('localhost', 'user', callbackHash, expiredResult, serverResult);
        entry = cache.getEntry('localhost', 'user', callbackHash);
      });

      it('sets an immediate expiration', function () {
        expect(entry?.expiration).to.be.at.most(Date.now());
      });
    });
  });

  describe('#clear', function () {
    const cache = new TokenEntryCache();

    before(function () {
      cache.addEntry('localhost', 'user', callbackHash, tokenResultWithExpiration, serverResult);
      cache.clear();
    });

    it('clears the cache', function () {
      expect(cache.entries.size).to.equal(0);
    });
  });

  describe('#deleteExpiredEntries', function () {
    const cache = new TokenEntryCache();
    const nonExpiredResult = Object.freeze({
      accessToken: 'test',
      expiresInSeconds: 600
    });

    before(function () {
      cache.addEntry('localhost', 'user', callbackHash, tokenResultWithExpiration, serverResult);
      cache.addEntry('localhost', 'user2', callbackHash, nonExpiredResult, serverResult);
      cache.deleteExpiredEntries();
    });

    it('deletes all expired tokens from the cache 5 minutes before expiredInSeconds', function () {
      expect(cache.entries.size).to.equal(1);
      expect(cache.getEntry('localhost', 'user', callbackHash)).to.not.exist;
      expect(cache.getEntry('localhost', 'user2', callbackHash)).to.exist;
    });
  });

  describe('#deleteEntry', function () {
    const cache = new TokenEntryCache();

    before(function () {
      cache.addEntry('localhost', 'user', callbackHash, tokenResultWithExpiration, serverResult);
      cache.deleteEntry('localhost', 'user', callbackHash);
    });

    it('deletes the entry', function () {
      expect(cache.getEntry('localhost', 'user', callbackHash)).to.not.exist;
    });
  });

  describe('#getEntry', function () {
    const cache = new TokenEntryCache();

    before(function () {
      cache.addEntry('localhost', 'user', callbackHash, tokenResultWithExpiration, serverResult);
      cache.addEntry('localhost', 'user2', callbackHash, tokenResultWithExpiration, serverResult);
    });

    describe('when there is a matching entry', function () {
      it('returns the entry', function () {
        expect(cache.getEntry('localhost', 'user', callbackHash)?.tokenResult).to.equal(
          tokenResultWithExpiration
        );
      });
    });

    describe('when there is no matching entry', function () {
      it('returns undefined', function () {
        expect(cache.getEntry('localhost', 'user1', callbackHash)).to.equal(undefined);
      });
    });
  });
});
