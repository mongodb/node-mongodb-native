import { expect } from 'chai';

import { TokenEntry, TokenEntryCache } from '../../../../mongodb';

describe('TokenEntryCache', function () {
  const tokenResultWithExpiration = Object.freeze({
    accessToken: 'test',
    expiresInSeconds: 100
  });

  const serverResult = Object.freeze({
    clientId: '1'
  });

  const fnOne = () => {
    return { accessToken: 'test' };
  };

  const fnTwo = () => {
    return { accessToken: 'test' };
  };

  describe('#addEntry', function () {
    context('when expiresInSeconds is provided', function () {
      const cache = new TokenEntryCache();
      let entry;

      before(function () {
        cache.addEntry('localhost', 'user', fnOne, fnTwo, tokenResultWithExpiration, serverResult);
        entry = cache.getEntry('localhost', 'user', fnOne, fnTwo);
      });

      it('adds the token result', function () {
        expect(entry.tokenResult).to.deep.equal(tokenResultWithExpiration);
      });

      it('adds the server result', function () {
        expect(entry.serverResult).to.deep.equal(serverResult);
      });

      it('creates an expiration', function () {
        expect(entry.expiration).to.be.within(Date.now(), Date.now() + 100 * 1000);
      });
    });

    context('when expiresInSeconds is not provided', function () {
      const cache = new TokenEntryCache();
      let entry: TokenEntry | undefined;

      const expiredResult = Object.freeze({ accessToken: 'test' });

      before(function () {
        cache.addEntry('localhost', 'user', fnOne, fnTwo, expiredResult, serverResult);
        entry = cache.getEntry('localhost', 'user', fnOne, fnTwo);
      });

      it('sets an immediate expiration', function () {
        expect(entry.expiration).to.be.at.most(Date.now());
      });
    });

    context('when expiresInSeconds is null', function () {
      const cache = new TokenEntryCache();
      let entry: TokenEntry | undefined;

      const expiredResult = Object.freeze({
        accessToken: 'test',
        expiredInSeconds: null
      });

      before(function () {
        cache.addEntry('localhost', 'user', fnOne, fnTwo, expiredResult, serverResult);
        entry = cache.getEntry('localhost', 'user', fnOne, fnTwo);
      });

      it('sets an immediate expiration', function () {
        expect(entry.expiration).to.be.at.most(Date.now());
      });
    });
  });

  describe('#clear', function () {
    const cache = new TokenEntryCache();

    before(function () {
      cache.addEntry('localhost', 'user', fnOne, fnTwo, tokenResultWithExpiration, serverResult);
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
      cache.addEntry('localhost', 'user', fnOne, fnTwo, tokenResultWithExpiration, serverResult);
      cache.addEntry('localhost', 'user2', fnOne, fnTwo, nonExpiredResult, serverResult);
      cache.deleteExpiredEntries();
    });

    it('deletes all expired tokens from the cache 5 minutes before expiredInSeconds', function () {
      expect(cache.entries.size).to.equal(1);
      expect(cache.getEntry('localhost', 'user', fnOne, fnTwo)).to.not.exist;
      expect(cache.getEntry('localhost', 'user2', fnOne, fnTwo)).to.exist;
    });
  });

  describe('#deleteEntry', function () {
    const cache = new TokenEntryCache();

    before(function () {
      cache.addEntry('localhost', 'user', fnOne, fnTwo, tokenResultWithExpiration, serverResult);
      cache.deleteEntry('localhost', 'user', fnOne, fnTwo);
    });

    it('deletes the entry', function () {
      expect(cache.getEntry('localhost', 'user', fnOne, fnTwo)).to.not.exist;
    });
  });

  describe('#getEntry', function () {
    const cache = new TokenEntryCache();

    before(function () {
      cache.addEntry('localhost', 'user', fnOne, fnTwo, tokenResultWithExpiration, serverResult);
      cache.addEntry('localhost', 'user2', fnOne, fnTwo, tokenResultWithExpiration, serverResult);
    });

    context('when there is a matching entry', function () {
      it('returns the entry', function () {
        expect(cache.getEntry('localhost', 'user', fnOne, fnTwo)?.tokenResult).to.equal(
          tokenResultWithExpiration
        );
      });
    });

    context('when there is no matching entry', function () {
      it('returns undefined', function () {
        expect(cache.getEntry('localhost', 'user1', fnOne, fnTwo)).to.equal(undefined);
      });
    });
  });
});
