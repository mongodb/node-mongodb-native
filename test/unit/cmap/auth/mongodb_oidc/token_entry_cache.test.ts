import { expect } from 'chai';

import { TokenEntry, TokenEntryCache } from '../../../../mongodb';

describe('TokenEntryCache', function () {
  const tokenResultWithExpiration = {
    accessToken: 'test',
    expiresInSeconds: 100
  };

  const serverResult = {
    clientId: '1'
  };

  describe('#addEntry', function () {
    context('when expiresInSeconds is provided', function () {
      const cache = new TokenEntryCache();
      let entry;

      before(function () {
        cache.addEntry('localhost', 'user', tokenResultWithExpiration, serverResult);
        entry = cache.getEntry('localhost', 'user');
      });

      it('sets the username in the key', function () {
        expect(cache.entries.has('localhost-user')).to.be.true;
      });

      it('adds the token result', function () {
        expect(entry.tokenResult).to.deep.equal(tokenResultWithExpiration);
      });

      it('adds the server result', function () {
        expect(entry.serverResult).to.deep.equal(serverResult);
      });

      it('creates an expiration', function () {
        expect(entry.expiration).to.be.at.most(Date.now() * 100 * 1000);
      });
    });

    context('when expiresInSeconds is not provided', function () {
      const cache = new TokenEntryCache();
      let entry: TokenEntry | undefined;

      const expiredResult = { accessToken: 'test' };

      before(function () {
        cache.addEntry('localhost', 'user', expiredResult, serverResult);
        entry = cache.getEntry('localhost', 'user');
      });

      it('sets an immediate expiration', function () {
        expect(entry?.expiration).to.be.at.most(Date.now());
      });
    });
  });

  describe('#clear', function () {
    const cache = new TokenEntryCache();

    before(function () {
      cache.addEntry('localhost', 'user', tokenResultWithExpiration, serverResult);
      cache.clear();
    });

    it('clears the cache', function () {
      expect(cache.entries.size).to.equal(0);
    });
  });

  describe('#deleteExpiredEntries', function () {
    const cache = new TokenEntryCache();

    const nonExpiredResult = {
      accessToken: 'test',
      expiresInSeconds: 600
    };

    before(function () {
      cache.addEntry('localhost', 'user', tokenResultWithExpiration, serverResult);
      cache.addEntry('localhost', 'user2', nonExpiredResult, serverResult);
      cache.deleteExpiredEntries();
    });

    it('deletes all expired tokens from the cache', function () {
      expect(cache.entries.size).to.equal(1);
    });
  });

  describe('#deleteEntry', function () {
    const cache = new TokenEntryCache();

    before(function () {
      cache.addEntry('localhost', 'user', tokenResultWithExpiration, serverResult);
      cache.deleteEntry('localhost', 'user');
    });

    it('deletes the entry', function () {
      expect(cache.entries.has('localhost-user')).to.be.false;
    });
  });

  describe('#getEntry', function () {
    const cache = new TokenEntryCache();

    before(function () {
      cache.addEntry('localhost', 'user', tokenResultWithExpiration, serverResult);
      cache.addEntry('localhost', 'user2', tokenResultWithExpiration, serverResult);
    });

    context('when there is a matching entry', function () {
      it('returns the entry', function () {
        expect(cache.getEntry('localhost', 'user')?.tokenResult).to.deep.equal(
          tokenResultWithExpiration
        );
      });
    });

    context('when there is no matching entry', function () {
      it('returns undefined', function () {
        expect(cache.getEntry('localhost', 'user1')).to.equal(undefined);
      });
    });
  });
});
