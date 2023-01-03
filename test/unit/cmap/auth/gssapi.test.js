const chai = require('chai');
const dns = require('dns');
const sinon = require('sinon');
const sinonChai = require('sinon-chai');

const {
  GSSAPICanonicalizationValue,
  performGSSAPICanonicalizeHostName,
  resolveCname
} = require('../../../mongodb');

const expect = chai.expect;
chai.use(sinonChai);

describe('GSSAPI', () => {
  const sandbox = sinon.createSandbox();

  beforeEach(() => {
    sandbox.spy(dns);
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('.performGSSAPICanonicalizeHostName', () => {
    const hostName = 'example.com';

    for (const mode of [GSSAPICanonicalizationValue.off, GSSAPICanonicalizationValue.none]) {
      context(`when the mode is ${mode}`, () => {
        it('performs no dns lookups', done => {
          performGSSAPICanonicalizeHostName(
            hostName,
            { CANONICALIZE_HOST_NAME: mode },
            (error, host) => {
              if (error) return done(error);
              expect(host).to.equal(hostName);
              expect(dns.lookup).to.not.be.called;
              expect(dns.resolvePtr).to.not.be.called;
              expect(dns.resolveCname).to.not.be.called;
              done();
            }
          );
        });
      });
    }

    context(`when the mode is forward`, () => {
      const resolved = '10gen.cc';
      const resolveStub = (host, callback) => {
        callback(undefined, [resolved]);
      };

      beforeEach(() => {
        dns.resolveCname.restore();
        sinon.stub(dns, 'resolveCname').callsFake(resolveStub);
      });

      it('performs a cname lookup', done => {
        performGSSAPICanonicalizeHostName(
          hostName,
          { CANONICALIZE_HOST_NAME: GSSAPICanonicalizationValue.forward },
          (error, host) => {
            if (error) return done(error);
            expect(host).to.equal(resolved);
            expect(dns.lookup).to.not.be.called;
            expect(dns.resolvePtr).to.not.be.called;
            expect(dns.resolveCname).to.be.calledOnceWith(hostName);
            done();
          }
        );
      });
    });

    for (const mode of [
      GSSAPICanonicalizationValue.on,
      GSSAPICanonicalizationValue.forwardAndReverse
    ]) {
      context(`when the mode is ${mode}`, () => {
        context('when the forward lookup succeeds', () => {
          const lookedUp = '1.1.1.1';
          const lookupStub = (host, callback) => {
            callback(undefined, lookedUp);
          };

          context('when the reverse lookup succeeds', () => {
            context('when there is 1 result', () => {
              const resolved = '10gen.cc';
              const resolveStub = (host, callback) => {
                callback(undefined, [resolved]);
              };

              beforeEach(() => {
                dns.lookup.restore();
                dns.resolvePtr.restore();
                sinon.stub(dns, 'lookup').callsFake(lookupStub);
                sinon.stub(dns, 'resolvePtr').callsFake(resolveStub);
              });

              it('uses the reverse lookup host', done => {
                performGSSAPICanonicalizeHostName(
                  hostName,
                  { CANONICALIZE_HOST_NAME: mode },
                  (error, host) => {
                    if (error) return done(error);
                    expect(host).to.equal(resolved);
                    expect(dns.lookup).to.be.calledOnceWith(hostName);
                    expect(dns.resolvePtr).to.be.calledOnceWith(lookedUp);
                    expect(dns.resolveCname).to.not.be.called;
                    done();
                  }
                );
              });
            });

            context('when there is more than 1 result', () => {
              const resolved = '10gen.cc';
              const resolveStub = (host, callback) => {
                callback(undefined, [resolved, 'example.com']);
              };

              beforeEach(() => {
                dns.lookup.restore();
                dns.resolvePtr.restore();
                sinon.stub(dns, 'lookup').callsFake(lookupStub);
                sinon.stub(dns, 'resolvePtr').callsFake(resolveStub);
              });

              it('uses the first found reverse lookup host', done => {
                performGSSAPICanonicalizeHostName(
                  hostName,
                  { CANONICALIZE_HOST_NAME: mode },
                  (error, host) => {
                    if (error) return done(error);
                    expect(host).to.equal(resolved);
                    expect(dns.lookup).to.be.calledOnceWith(hostName);
                    expect(dns.resolvePtr).to.be.calledOnceWith(lookedUp);
                    expect(dns.resolveCname).to.not.be.called;
                    done();
                  }
                );
              });
            });
          });

          context('when the reverse lookup fails', () => {
            const cname = 'test.com';
            const resolveStub = (host, callback) => {
              callback(new Error('failed'), undefined);
            };
            const cnameStub = (host, callback) => {
              callback(undefined, [cname]);
            };

            beforeEach(() => {
              dns.lookup.restore();
              dns.resolvePtr.restore();
              dns.resolveCname.restore();
              sinon.stub(dns, 'lookup').callsFake(lookupStub);
              sinon.stub(dns, 'resolvePtr').callsFake(resolveStub);
              sinon.stub(dns, 'resolveCname').callsFake(cnameStub);
            });

            it('falls back to a cname lookup', done => {
              performGSSAPICanonicalizeHostName(
                hostName,
                { CANONICALIZE_HOST_NAME: mode },
                (error, host) => {
                  if (error) return done(error);
                  expect(host).to.equal(cname);
                  expect(dns.lookup).to.be.calledOnceWith(hostName);
                  expect(dns.resolvePtr).to.be.calledOnceWith(lookedUp);
                  expect(dns.resolveCname).to.be.calledWith(hostName);
                  done();
                }
              );
            });
          });

          context('when the reverse lookup is empty', () => {
            const resolveStub = (host, callback) => {
              callback(undefined, []);
            };

            beforeEach(() => {
              dns.lookup.restore();
              dns.resolvePtr.restore();
              sinon.stub(dns, 'lookup').callsFake(lookupStub);
              sinon.stub(dns, 'resolvePtr').callsFake(resolveStub);
            });

            it('uses the provided host', done => {
              performGSSAPICanonicalizeHostName(
                hostName,
                { CANONICALIZE_HOST_NAME: mode },
                (error, host) => {
                  if (error) return done(error);
                  expect(host).to.equal(hostName);
                  expect(dns.lookup).to.be.calledOnceWith(hostName);
                  expect(dns.resolvePtr).to.be.calledOnceWith(lookedUp);
                  expect(dns.resolveCname).to.not.be.called;
                  done();
                }
              );
            });
          });
        });

        context('when the forward lookup fails', () => {
          const lookupStub = (host, callback) => {
            callback(new Error('failed'), undefined);
          };

          beforeEach(() => {
            dns.lookup.restore();
            sinon.stub(dns, 'lookup').callsFake(lookupStub);
          });

          it('fails with the error', done => {
            performGSSAPICanonicalizeHostName(hostName, { CANONICALIZE_HOST_NAME: mode }, error => {
              expect(error.message).to.equal('failed');
              expect(dns.lookup).to.be.calledOnceWith(hostName);
              expect(dns.resolvePtr).to.not.be.called;
              expect(dns.resolveCname).to.not.be.called;
              done();
            });
          });
        });
      });
    }
  });

  describe('.resolveCname', () => {
    context('when the cname call errors', () => {
      const hostName = 'example.com';
      const resolveStub = (host, callback) => {
        callback(new Error('failed'));
      };

      beforeEach(() => {
        dns.resolveCname.restore();
        sinon.stub(dns, 'resolveCname').callsFake(resolveStub);
      });

      it('falls back to the provided host name', done => {
        resolveCname(hostName, (error, host) => {
          if (error) return done(error);
          expect(host).to.equal(hostName);
          expect(dns.resolveCname).to.be.calledOnceWith(hostName);
          done();
        });
      });
    });

    context('when the cname call returns results', () => {
      context('when there is one result', () => {
        const hostName = 'example.com';
        const resolved = '10gen.cc';
        const resolveStub = (host, callback) => {
          callback(undefined, [resolved]);
        };

        beforeEach(() => {
          dns.resolveCname.restore();
          sinon.stub(dns, 'resolveCname').callsFake(resolveStub);
        });

        it('uses the result', done => {
          resolveCname(hostName, (error, host) => {
            if (error) return done(error);
            expect(host).to.equal(resolved);
            expect(dns.resolveCname).to.be.calledOnceWith(hostName);
            done();
          });
        });
      });

      context('when there is more than one result', () => {
        const hostName = 'example.com';
        const resolved = '10gen.cc';
        const resolveStub = (host, callback) => {
          callback(undefined, [resolved, hostName]);
        };

        beforeEach(() => {
          dns.resolveCname.restore();
          sinon.stub(dns, 'resolveCname').callsFake(resolveStub);
        });

        it('uses the first result', done => {
          resolveCname(hostName, (error, host) => {
            if (error) return done(error);
            expect(host).to.equal(resolved);
            expect(dns.resolveCname).to.be.calledOnceWith(hostName);
            done();
          });
        });
      });
    });

    context('when the cname call returns no results', () => {
      const hostName = 'example.com';
      const resolveStub = (host, callback) => {
        callback(undefined, []);
      };

      beforeEach(() => {
        dns.resolveCname.restore();
        sinon.stub(dns, 'resolveCname').callsFake(resolveStub);
      });

      it('falls back to using the provided host', done => {
        resolveCname(hostName, (error, host) => {
          if (error) return done(error);
          expect(host).to.equal(hostName);
          expect(dns.resolveCname).to.be.calledOnceWith(hostName);
          done();
        });
      });
    });
  });
});
