import { expect } from 'chai';
import { promises as dns } from 'dns';
import * as sinon from 'sinon';

import {
  GSSAPICanonicalizationValue,
  performGSSAPICanonicalizeHostName,
  resolveCname
} from '../../../mongodb';

describe('GSSAPI', () => {
  let lookupSpy;
  let resolvePtrSpy;
  let resolveCnameSpy;

  beforeEach(() => {
    lookupSpy = sinon.spy(dns, 'lookup');
    resolvePtrSpy = sinon.spy(dns, 'resolvePtr');
    resolveCnameSpy = sinon.spy(dns, 'resolveCname');
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('.performGSSAPICanonicalizeHostName', () => {
    const hostName = 'example.com';
    for (const mode of [GSSAPICanonicalizationValue.off, GSSAPICanonicalizationValue.none]) {
      describe(`when the mode is ${mode}`, () => {
        it('performs no dns lookups', async () => {
          const host = await performGSSAPICanonicalizeHostName(hostName, {
            CANONICALIZE_HOST_NAME: mode
          });
          expect(host).to.equal(hostName);
          expect(dns.lookup).to.not.be.called;
          expect(dns.resolvePtr).to.not.be.called;
          expect(dns.resolveCname).to.not.be.called;
        });
      });
    }

    describe(`when the mode is forward`, () => {
      const resolved = '10gen.cc';

      beforeEach(() => {
        resolveCnameSpy.restore();
        sinon.stub(dns, 'resolveCname').resolves([resolved]);
      });

      it('performs a cname lookup', async () => {
        const host = await performGSSAPICanonicalizeHostName(hostName, {
          CANONICALIZE_HOST_NAME: GSSAPICanonicalizationValue.forward
        });
        expect(host).to.equal(resolved);
        expect(dns.lookup).to.not.be.called;
        expect(dns.resolvePtr).to.not.be.called;
        expect(dns.resolveCname).to.be.calledOnceWith(hostName);
      });
    });
    for (const mode of [
      GSSAPICanonicalizationValue.on,
      GSSAPICanonicalizationValue.forwardAndReverse
    ]) {
      describe(`when the mode is ${mode}`, () => {
        describe('when the forward lookup succeeds', () => {
          const lookedUp = { address: '1.1.1.1', family: 4 };

          describe('when the reverse lookup succeeds', () => {
            describe('when there is 1 result', () => {
              const resolved = '10gen.cc';

              beforeEach(() => {
                lookupSpy.restore();
                resolvePtrSpy.restore();
                sinon.stub(dns, 'lookup').resolves(lookedUp);
                sinon.stub(dns, 'resolvePtr').resolves([resolved]);
              });

              it('uses the reverse lookup host', async () => {
                const host = await performGSSAPICanonicalizeHostName(hostName, {
                  CANONICALIZE_HOST_NAME: mode
                });
                expect(host).to.equal(resolved);
                expect(dns.lookup).to.be.calledOnceWith(hostName);
                expect(dns.resolvePtr).to.be.calledOnceWith(lookedUp.address);
                expect(dns.resolveCname).to.not.be.called;
              });
            });

            describe('when there is more than 1 result', () => {
              const resolved = '10gen.cc';

              beforeEach(() => {
                lookupSpy.restore();
                resolvePtrSpy.restore();
                sinon.stub(dns, 'lookup').resolves(lookedUp);
                sinon.stub(dns, 'resolvePtr').resolves([resolved, 'example.com']);
              });

              it('uses the first found reverse lookup host', async () => {
                const host = await performGSSAPICanonicalizeHostName(hostName, {
                  CANONICALIZE_HOST_NAME: mode
                });
                expect(host).to.equal(resolved);
                expect(dns.lookup).to.be.calledOnceWith(hostName);
                expect(dns.resolvePtr).to.be.calledOnceWith(lookedUp.address);
                expect(dns.resolveCname).to.not.be.called;
              });
            });
          });

          describe('when the reverse lookup fails', () => {
            const cname = 'test.com';

            beforeEach(() => {
              lookupSpy.restore();
              resolvePtrSpy.restore();
              resolveCnameSpy.restore();
              sinon.stub(dns, 'lookup').resolves(lookedUp);
              sinon.stub(dns, 'resolvePtr').rejects(new Error('failed'));
              sinon.stub(dns, 'resolveCname').resolves([cname]);
            });

            it('falls back to a cname lookup', async () => {
              const host = await performGSSAPICanonicalizeHostName(hostName, {
                CANONICALIZE_HOST_NAME: mode
              });
              expect(host).to.equal(cname);
              expect(dns.lookup).to.be.calledOnceWith(hostName);
              expect(dns.resolvePtr).to.be.calledOnceWith(lookedUp.address);
              expect(dns.resolveCname).to.be.calledWith(hostName);
            });
          });

          describe('when the reverse lookup is empty', () => {
            beforeEach(() => {
              lookupSpy.restore();
              resolvePtrSpy.restore();
              sinon.stub(dns, 'lookup').resolves(lookedUp);
              sinon.stub(dns, 'resolvePtr').resolves([]);
            });

            it('uses the provided host', async () => {
              const host = await performGSSAPICanonicalizeHostName(hostName, {
                CANONICALIZE_HOST_NAME: mode
              });
              expect(host).to.equal(hostName);
              expect(dns.lookup).to.be.calledOnceWith(hostName);
              expect(dns.resolvePtr).to.be.calledOnceWith(lookedUp.address);
              expect(dns.resolveCname).to.not.be.called;
            });
          });
        });

        describe('when the forward lookup fails', () => {
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
            expect(dns.resolvePtr).to.not.be.called;
            expect(dns.resolveCname).to.not.be.called;
          });
        });
      });
    }
  });

  describe('.resolveCname', () => {
    describe('when the cname call errors', () => {
      const hostName = 'example.com';

      beforeEach(() => {
        resolveCnameSpy.restore();
        sinon.stub(dns, 'resolveCname').rejects(new Error('failed'));
      });

      it('falls back to the provided host name', async () => {
        const host = await resolveCname(hostName);
        expect(host).to.equal(hostName);
        expect(dns.resolveCname).to.be.calledOnceWith(hostName);
      });
    });

    describe('when the cname call returns results', () => {
      describe('when there is one result', () => {
        const hostName = 'example.com';
        const resolved = '10gen.cc';

        beforeEach(() => {
          resolveCnameSpy.restore();
          sinon.stub(dns, 'resolveCname').resolves([resolved]);
        });

        it('uses the result', async () => {
          const host = await resolveCname(hostName);
          expect(host).to.equal(resolved);
          expect(dns.resolveCname).to.be.calledOnceWith(hostName);
        });
      });

      describe('when there is more than one result', () => {
        const hostName = 'example.com';
        const resolved = '10gen.cc';

        beforeEach(() => {
          resolveCnameSpy.restore();
          sinon.stub(dns, 'resolveCname').resolves([resolved, hostName]);
        });

        it('uses the first result', async () => {
          const host = await resolveCname(hostName);
          expect(host).to.equal(resolved);
          expect(dns.resolveCname).to.be.calledOnceWith(hostName);
        });
      });
    });

    describe('when the cname call returns no results', () => {
      const hostName = 'example.com';

      beforeEach(() => {
        resolveCnameSpy.restore();
        sinon.stub(dns, 'resolveCname').resolves([]);
      });

      it('falls back to using the provided host', async () => {
        const host = await resolveCname(hostName);
        expect(host).to.equal(hostName);
        expect(dns.resolveCname).to.be.calledOnceWith(hostName);
      });
    });
  });
});
