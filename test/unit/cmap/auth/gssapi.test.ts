import { expect } from 'chai';
import { promises as dns } from 'dns';
import * as sinon from 'sinon';

import {
  GSSAPICanonicalizationValue,
  performGSSAPICanonicalizeHostName,
  resolveCname
} from '../../../../src/cmap/auth/gssapi';

describe('GSSAPI', () => {
  let lookupSpy;
  let resolveSpy;

  beforeEach(() => {
    lookupSpy = sinon.spy(dns, 'lookup');
    resolveSpy = sinon.spy(dns, 'resolve');
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('.performGSSAPICanonicalizeHostName', () => {
    const hostName = 'example.com';

    for (const mode of [GSSAPICanonicalizationValue.off, GSSAPICanonicalizationValue.none]) {
      context(`when the mode is ${mode}`, () => {
        it('performs no dns lookups', async () => {
          const host = await performGSSAPICanonicalizeHostName(hostName, {
            CANONICALIZE_HOST_NAME: mode
          });
          expect(host).to.equal(hostName);
          expect(dns.lookup).to.not.be.called;
          expect(dns.resolve.withArgs(sinon.match.string, 'PTR')).to.not.be.called;
          expect(dns.resolve.withArgs(sinon.match.string, 'CNAME')).to.not.be.called;
        });
      });
    }

    context(`when the mode is forward`, () => {
      const resolved = '10gen.cc';

      beforeEach(() => {
        resolveSpy.restore();
        sinon.stub(dns, 'resolve').withArgs(sinon.match.string, 'CNAME').resolves([resolved]);
      });

      it('performs a cname lookup', async () => {
        const host = await performGSSAPICanonicalizeHostName(hostName, {
          CANONICALIZE_HOST_NAME: GSSAPICanonicalizationValue.forward
        });
        expect(host).to.equal(resolved);
        expect(dns.lookup).to.not.be.called;
        expect(dns.resolve.withArgs(sinon.match.string, 'PTR')).to.not.be.called;
        expect(dns.resolve).to.be.calledOnceWith(hostName, 'CNAME');
      });
    });

    for (const mode of [
      GSSAPICanonicalizationValue.on,
      GSSAPICanonicalizationValue.forwardAndReverse
    ]) {
      context(`when the mode is ${mode}`, () => {
        context('when the forward lookup succeeds', () => {
          const lookedUp = { address: '1.1.1.1', family: 4 };

          context('when the reverse lookup succeeds', () => {
            context('when there is 1 result', () => {
              const resolved = '10gen.cc';

              beforeEach(() => {
                lookupSpy.restore();
                resolveSpy.restore();
                sinon.stub(dns, 'lookup').resolves(lookedUp);
                sinon.stub(dns, 'resolve').withArgs(sinon.match.string, 'PTR').resolves([resolved]);
              });

              it('uses the reverse lookup host', async () => {
                const host = await performGSSAPICanonicalizeHostName(hostName, {
                  CANONICALIZE_HOST_NAME: mode
                });
                expect(host).to.equal(resolved);
                expect(dns.lookup).to.be.calledOnceWith(hostName);
                expect(dns.resolve).to.be.calledOnceWith(lookedUp.address, 'PTR');
                expect(dns.resolve).to.not.be.calledOnceWith(lookedUp.address, 'CNAME');
              });
            });

            context('when there is more than 1 result', () => {
              const resolved = '10gen.cc';

              beforeEach(() => {
                lookupSpy.restore();
                resolveSpy.restore();
                sinon.stub(dns, 'lookup').resolves(lookedUp);
                sinon
                  .stub(dns, 'resolve')
                  .withArgs(sinon.match.string, 'PTR')
                  .resolves([resolved, 'example.com']);
              });

              it('uses the first found reverse lookup host', async () => {
                const host = await performGSSAPICanonicalizeHostName(hostName, {
                  CANONICALIZE_HOST_NAME: mode
                });
                expect(host).to.equal(resolved);
                expect(dns.lookup).to.be.calledOnceWith(hostName);
                expect(dns.resolve).to.be.calledOnceWith(lookedUp.address, 'PTR');
                expect(dns.resolve).to.not.be.calledOnceWith(sinon.match.string, 'CNAME');
              });
            });
          });

          context('when the reverse lookup fails', () => {
            const cname = 'test.com';

            beforeEach(() => {
              lookupSpy.restore();
              resolveSpy.restore();
              sinon.stub(dns, 'lookup').resolves(lookedUp);
              const stub = sinon.stub(dns, 'resolve');
              stub.withArgs(sinon.match.string, 'PTR').rejects(new Error('failed'));
              stub.withArgs(sinon.match.string, 'CNAME').resolves([cname]);
            });

            it('falls back to a cname lookup', async () => {
              const host = await performGSSAPICanonicalizeHostName(hostName, {
                CANONICALIZE_HOST_NAME: mode
              });

              expect(host).to.equal(cname);
              expect(dns.lookup).to.be.calledOnceWith(hostName);
              expect(dns.resolve).to.be.calledWith(lookedUp.address, 'PTR');
              expect(dns.resolve).to.be.calledWith(hostName, 'CNAME');
            });
          });

          context('when the reverse lookup is empty', () => {
            beforeEach(() => {
              lookupSpy.restore();
              resolveSpy.restore();
              sinon.stub(dns, 'lookup').resolves(lookedUp);
              sinon.stub(dns, 'resolve').withArgs(sinon.match.string, 'PTR').resolves([]);
            });

            it('uses the provided host', async () => {
              const host = await performGSSAPICanonicalizeHostName(hostName, {
                CANONICALIZE_HOST_NAME: mode
              });
              expect(host).to.equal(hostName);
              expect(dns.lookup).to.be.calledOnceWith(hostName);
              expect(dns.resolve).to.be.calledOnceWith(lookedUp.address, 'PTR');
              expect(dns.resolve).to.not.be.calledWith(sinon.match.string, 'CNAME');
            });
          });
        });

        context('when the forward lookup fails', () => {
          beforeEach(() => {
            lookupSpy.restore();
            sinon.stub(dns, 'lookup').rejects(new Error('failed'));
          });

          it('fails with the error', async () => {
            const error = await performGSSAPICanonicalizeHostName(hostName, {
              CANONICALIZE_HOST_NAME: mode
            }).catch(error => error);

            expect(error.message).to.equal('failed');
            expect(dns.lookup).to.be.calledOnceWith(hostName);
            expect(dns.resolve).to.not.be.calledWith(sinon.match.string, 'PTR');
            expect(dns.resolve).to.not.be.calledWith(sinon.match.string, 'CNAME');
          });
        });
      });
    }
  });

  describe('.resolveCname', () => {
    context('when the cname call errors', () => {
      const hostName = 'example.com';

      beforeEach(() => {
        resolveSpy.restore();
        sinon
          .stub(dns, 'resolve')
          .withArgs(sinon.match.string, 'CNAME')
          .rejects(new Error('failed'));
      });

      it('falls back to the provided host name', async () => {
        const host = await resolveCname(hostName);
        expect(host).to.equal(hostName);
        expect(dns.resolve).to.be.calledOnceWith(hostName, 'CNAME');
      });
    });

    context('when the cname call returns results', () => {
      context('when there is one result', () => {
        const hostName = 'example.com';
        const resolved = '10gen.cc';

        beforeEach(() => {
          resolveSpy.restore();
          sinon.stub(dns, 'resolve').withArgs(sinon.match.string, 'CNAME').resolves([resolved]);
        });

        it('uses the result', async () => {
          const host = await resolveCname(hostName);
          expect(host).to.equal(resolved);
          expect(dns.resolve).to.be.calledOnceWith(hostName, 'CNAME');
        });
      });

      context('when there is more than one result', () => {
        const hostName = 'example.com';
        const resolved = '10gen.cc';

        beforeEach(() => {
          resolveSpy.restore();
          sinon
            .stub(dns, 'resolve')
            .withArgs(sinon.match.string, 'CNAME')
            .resolves([resolved, hostName]);
        });

        it('uses the first result', async () => {
          const host = await resolveCname(hostName);
          expect(host).to.equal(resolved);
          expect(dns.resolve).to.be.calledOnceWith(hostName, 'CNAME');
        });
      });
    });

    context('when the cname call returns no results', () => {
      const hostName = 'example.com';

      beforeEach(() => {
        resolveSpy.restore();
        sinon.stub(dns, 'resolve').withArgs(sinon.match.string, 'CNAME').resolves([]);
      });

      it('falls back to using the provided host', async () => {
        const host = await resolveCname(hostName);
        expect(host).to.equal(hostName);
        expect(dns.resolve).to.be.calledOnceWith(hostName, 'CNAME');
      });
    });
  });
});
