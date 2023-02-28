import { expect } from 'chai';

import { TokenEntryCache } from '../../../../mongodb';

describe('TokenEntryCache', function () {
  const tokenResult = {
    accessToken: 'test',
    expiresInSeconds: 100
  };

  const serverResult = {
    clientId: 1
  };

  describe('#addEntry', function () {
    context('when expiresInSeconds is provided', function () {
      const cache = new TokenEntryCache();
      let entry;

      before(function () {
        cache.addEntry('localhost', 'user', tokenResult, serverResult);
        entry = cache.getEntry('localhost', 'user');
      });

      it('sets the username in the key', function () {
        expect(cache.entries.has('localhost-user')).to.be.true;
      });

      it('adds the token result', function () {
        expect(entry.tokenResult).to.deep.equal(tokenResult);
      });

      it('adds the server result', function () {
        expect(entry.serverResult).to.deep.equal(serverResult);
      });

      it('creates an expiration', function () {
        expect(entry.expiration).to.be.above(Date.now());
      });
    });

    context('when expiresInSeconds is not provided', function () {
      const cache = new TokenEntryCache();
      let entry;

      const expiredResult = { accessToken: 'test' };

      before(function () {
        cache.addEntry('localhost', 'user', expiredResult, serverResult);
        entry = cache.getEntry('localhost', 'user');
      });

      it('sets an immediate expiration', function () {
        expect(entry.expiration).to.be.below(Date.now() + 1);
      });
    });

    context('when expiresInSeconds is null', function () {
      const cache = new TokenEntryCache();
      let entry;

      const expiredResult = {
        accessToken: 'test',
        expiresInSeconds: null
      };

      before(function () {
        cache.addEntry('localhost', 'user', expiredResult, serverResult);
        entry = cache.getEntry('localhost', 'user');
      });

      it('sets an immediate expiration', function () {
        expect(entry.expiration).to.be.below(Date.now() + 1);
      });
    });
  });

  describe('#clear', function () {
    const cache = new TokenEntryCache();

    before(function () {
      cache.addEntry('localhost', 'user', tokenResult, serverResult);
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
      cache.addEntry('localhost', 'user', tokenResult, serverResult);
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
      cache.addEntry('localhost', 'user', tokenResult, serverResult);
      cache.deleteEntry('localhost', 'user');
    });

    it('deletes the entry', function () {
      expect(cache.entries.has('localhost-user')).to.be.false;
    });
  });

  describe('#getEntry', function () {
    const cache = new TokenEntryCache();

    before(function () {
      cache.addEntry('localhost', 'user', tokenResult, serverResult);
      cache.addEntry('localhost', 'user2', tokenResult, serverResult);
    });

    context('when there is a matching entry', function () {
      it('returns the entry', function () {
        expect(cache.getEntry('localhost', 'user').tokenResult).to.deep.equal(tokenResult);
      });
    });

    context('when there is no matching entry', function () {
      it('returns undefined', function () {
        expect(cache.getEntry('localhost', 'user1')).to.equal(undefined);
      });
    });
  });
});
