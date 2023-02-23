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
    const cache = new TokenEntryCache();

    context('when providing a username', function () {
      let entry;

      before(function () {
        cache.addEntry(tokenResult, serverResult, 'localhost', 'user');
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

    context('when not providing a username', function () {
      before(function () {
        cache.addEntry(tokenResult, serverResult, 'localhost');
      });

      it('only uses the address as the key', function () {
        expect(cache.entries.has('localhost-')).to.be.true;
      });
    });
  });

  describe('#deleteEntry', function () {
    const cache = new TokenEntryCache();

    context('when providing a username', function () {
      before(function () {
        cache.addEntry(tokenResult, serverResult, 'localhost', 'user');
        cache.deleteEntry('localhost', 'user');
      });

      it('deletes the entry', function () {
        expect(cache.entries.has('localhost-user')).to.be.false;
      });
    });

    context('when not providing a username', function () {
      before(function () {
        cache.addEntry(tokenResult, serverResult, 'localhost');
        cache.deleteEntry('localhost');
      });

      it('deletes the entry', function () {
        expect(cache.entries.has('localhost-')).to.be.false;
      });
    });
  });

  describe('#getEntry', function () {
    const cache = new TokenEntryCache();

    before(function () {
      cache.addEntry(tokenResult, serverResult, 'localhost', 'user');
      cache.addEntry(tokenResult, serverResult, 'localhost');
    });

    context('when providing a username', function () {
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

    context('when not providing a username', function () {
      context('when there is a matching entry', function () {
        it('returns the entry', function () {
          expect(cache.getEntry('localhost').tokenResult).to.deep.equal(tokenResult);
        });
      });

      context('when there is no matching entry', function () {
        it('returns undefined', function () {
          expect(cache.getEntry('local')).to.equal(undefined);
        });
      });
    });
  });
});
