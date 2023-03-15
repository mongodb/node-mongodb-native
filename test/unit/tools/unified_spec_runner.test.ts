import { BSON } from 'bson';
import { AssertionError, expect } from 'chai';

import { EntitiesMap } from '../../tools/unified-spec-runner/entities';
import { compareLogs, resultCheck } from '../../tools/unified-spec-runner/match';
import { ExpectedLogMessage } from '../../tools/unified-spec-runner/schema';

describe('Unified Spec Runner', function () {
  describe('Matching', function () {
    describe('resultCheck', function () {
      const entitiesMap: EntitiesMap = new EntitiesMap();
      let ranResultCheck: boolean;
      let actual: any;
      let expected: any;

      const runResultCheck = () => {
        ranResultCheck = true;
        resultCheck(actual, expected, entitiesMap, []);
      };

      beforeEach(function () {
        ranResultCheck = false;
      });

      afterEach(function () {
        expect(ranResultCheck, 'Test cannot pass unless resultCheck has been called').to.be.true;
      });

      context('$$matchAsDocument', function () {
        beforeEach(function () {
          expected = {
            $$matchAsDocument: {
              data: { $$exists: true },
              a: { $$type: ['int'] }
            }
          };
        });

        context('when actual value is EJSON string', function () {
          it('throws AssertionError when it finds extra keys', function () {
            actual =
              '{"data": {"$numberLong": "100"}, "a": {"$numberInt": "10"}, "b": {"$numberInt": "100"}}';
            expect(runResultCheck).to.throw(AssertionError, /object has more keys than expected/);
          });

          it('passes when all keys match', function () {
            actual = '{"data": {"$numberLong": "100"}, "a": {"$numberInt": "10"}}';
            runResultCheck();
          });
        });

        context('when actual value is not EJSON string', function () {
          it('throws AssertionError', function () {
            actual = { data: { $numberLong: '100' }, a: { $numberInt: 10 } };
            expect(runResultCheck).to.throw(AssertionError, /Expected .* to be string/);
          });
        });
      });

      context('$$matchAsRoot', function () {
        context('when expected and actual values are documents', function () {
          beforeEach(function () {
            expected = {
              data: {
                $$matchAsRoot: {
                  data: { $$exists: true },
                  a: { $$type: ['int'] }
                }
              }
            };
          });

          it('passes when all expected keys match and there are extra keys', function () {
            actual = {
              data: {
                data: new BSON.Long(100),
                a: 10,
                b: 100
              }
            };

            runResultCheck();
          });

          it('throws AssertionError when some expected keys differ', function () {
            actual = {
              data: {
                data: new BSON.Long(100),
                a: 'string'
              }
            };

            expect(runResultCheck).to.throw(
              AssertionError,
              /Expected \[string\] to be one of \[int\]/
            );
          });
        });

        context('when the expected value is not a document', function () {
          beforeEach(function () {
            expected = { $$matchAsRoot: '{"data": { "data": 10, "a": 11 }}' };
          });

          it('throws AssertionError', function () {
            actual = {
              data: {
                data: 10,
                a: 11
              }
            };

            expect(runResultCheck).to.throw(
              AssertionError,
              /Value of \$\$matchAsRoot must be an object/
            );
          });
        });

        context('when the actual value is not a document', function () {
          beforeEach(function () {
            expected = { data: { data: 10, a: 11 } };
          });

          it('throws AssertionError', function () {
            actual = '{"data": { "data": 10, "a": 11 }}';

            expect(runResultCheck).to.throw(
              AssertionError,
              /Expected actual value to be an object/
            );
          });
        });
      });
    });

    describe('compareLogs', function () {
      const entitiesMap = new EntitiesMap();
      let actual: ExpectedLogMessage;
      let expected: ExpectedLogMessage;
      let ranCompareLogs: boolean;

      const runCompareLogs = () => {
        ranCompareLogs = true;
        compareLogs([expected], [actual], entitiesMap);
      };

      beforeEach(function () {
        ranCompareLogs = false;
      });

      afterEach(function () {
        expect(ranCompareLogs, 'Test cannot pass unless compareLogs has been called').to.be.true;
      });

      context('when failureIsRedacted is present', function () {
        context('when failureIsRedacted=true', function () {
          beforeEach(function () {
            expected = {
              level: 'debug',
              component: 'command',
              failureIsRedacted: true,
              data: { $$exists: true }
            };
          });

          it('passes when failure is present and redacted', function () {
            actual = {
              level: 'debug',
              component: 'command',
              data: {
                failure: {}
              }
            };
            runCompareLogs();
          });

          it('throws AssertionError when failure is absent', function () {
            actual = {
              level: 'debug',
              component: 'command',
              data: {
                message: 'some message'
              }
            };
            expect(runCompareLogs).to.throw(
              AssertionError,
              /Can only use failureIsRedacted when a failure exists/
            );
          });

          it('throws AssertionError when failure is present and not redacted', function () {
            actual = {
              level: 'debug',
              component: 'command',
              data: {
                failure: {
                  message: 'some failure'
                }
              }
            };
            expect(runCompareLogs).to.throw(
              AssertionError,
              /Expected failure to have been redacted/
            );
          });
        });

        context('when failureIsRedacted=false', function () {
          beforeEach(function () {
            expected = {
              level: 'debug',
              component: 'command',
              failureIsRedacted: false,
              data: { $$exists: true }
            };
          });

          it('passes when failure is present and not redacted', function () {
            actual = {
              level: 'debug',
              component: 'command',
              data: {
                failure: {
                  message: 'some failure'
                }
              }
            };

            runCompareLogs();
          });

          it('throws AssertionError when failure is absent', function () {
            actual = {
              level: 'debug',
              component: 'command',
              data: {
                message: 'some message'
              }
            };
            expect(runCompareLogs).to.throw(
              AssertionError,
              /Can only use failureIsRedacted when a failure exists/
            );
          });

          it('throws AssertionError when failure is present and redacted', function () {
            actual = {
              level: 'debug',
              component: 'command',
              data: {
                failure: {}
              }
            };

            expect(runCompareLogs).to.throw(
              AssertionError,
              /Expected failure to have not been redacted/
            );
          });
        });
      });

      context('when failureIsRedacted is undefined', function () {
        beforeEach(function () {
          expected = {
            level: 'debug',
            component: 'command',
            data: { $$exists: true }
          };
        });

        it('throws AssertionError when failure is present', function () {
          actual = {
            level: 'debug',
            component: 'command',
            data: {
              failure: {}
            }
          };

          expect(runCompareLogs).to.throw(
            AssertionError,
            /Expected failure to not exist since test.failureIsRedacted is undefined/
          );
        });

        it('passes when failure is not present', function () {
          actual = {
            level: 'debug',
            component: 'command',
            data: {
              message: 'some message'
            }
          };

          runCompareLogs();
        });
      });

      context('matches data field as root documents', function () {
        beforeEach(function () {
          expected = {
            level: 'debug',
            component: 'command',
            data: {
              a: 1,
              b: 2,
              c: 3
            }
          };
        });

        it('passes when actual.data field has additional fields not specified by expected.data', function () {
          actual = {
            level: 'debug',
            component: 'command',
            data: {
              a: 1,
              b: 2,
              c: 3,
              d: 4,
              e: 5
            }
          };

          runCompareLogs();
        });

        it('throws an Assertion error when expected.data has fields not specified by actual.data', function () {
          actual = {
            level: 'debug',
            component: 'command',
            data: {
              a: 1,
              b: 2
            }
          };

          expect(runCompareLogs).to.throw(AssertionError);
        });
      });
    });
  });
});
