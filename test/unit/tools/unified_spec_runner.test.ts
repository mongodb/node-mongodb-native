import { BSON } from 'bson';
import { AssertionError, expect } from 'chai';
import * as sinon from 'sinon';

import { EntitiesMap } from '../../tools/unified-spec-runner/entities';
import { compareLogs, resultCheck } from '../../tools/unified-spec-runner/match';
import { type ExpectedLogMessage } from '../../tools/unified-spec-runner/schema';

describe('Unified Spec Runner', function () {
  describe('Matching', function () {
    describe('resultCheck', function () {
      const entitiesMap: EntitiesMap = new EntitiesMap();
      let actual: any;
      let expected: any;
      let resultCheckSpy;

      beforeEach(function () {
        resultCheckSpy = sinon.spy(resultCheck);
      });

      afterEach(function () {
        expect(resultCheckSpy).to.have.been.calledOnce;
        sinon.restore();
      });

      describe('$$matchAsDocument', function () {
        beforeEach(function () {
          expected = {
            $$matchAsDocument: {
              data: { $$exists: true },
              a: { $$type: ['int'] }
            }
          };
        });

        describe('when actual value is EJSON string', function () {
          it('throws AssertionError when it finds extra keys', function () {
            actual =
              '{"data": {"$numberLong": "100"}, "a": {"$numberInt": "10"}, "b": {"$numberInt": "100"}}';
            expect(() => resultCheckSpy(actual, expected, entitiesMap, [])).to.throw(
              AssertionError,
              /object has more keys than expected/
            );
          });

          it('passes when all keys match', function () {
            actual = '{"data": {"$numberLong": "100"}, "a": {"$numberInt": "10"}}';
            resultCheckSpy(actual, expected, entitiesMap, []);
          });
        });

        describe('when actual value is not EJSON string', function () {
          it('throws AssertionError', function () {
            actual = { data: { $numberLong: '100' }, a: { $numberInt: 10 } };
            expect(() => resultCheckSpy(actual, expected, entitiesMap, [])).to.throw(
              AssertionError,
              /Expected .* to be string/
            );
          });
        });
      });

      describe('$$matchAsRoot', function () {
        describe('when expected and actual values are documents', function () {
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
            resultCheckSpy(actual, expected, entitiesMap, []);
          });

          it('throws AssertionError when some expected keys differ', function () {
            actual = {
              data: {
                data: new BSON.Long(100),
                a: 'string'
              }
            };
            expect(() => resultCheckSpy(actual, expected, entitiesMap, [])).to.throw(
              AssertionError,
              /Expected \[string\] to be one of \[int\]/
            );
          });
        });

        describe('when the expected value is not a document', function () {
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
            expect(() => resultCheckSpy(actual, expected, entitiesMap, [])).to.throw(
              AssertionError,
              /Value of \$\$matchAsRoot must be an object/
            );
          });
        });

        describe('when the actual value is not a document', function () {
          beforeEach(function () {
            expected = { data: { data: 10, a: 11 } };
          });

          it('throws AssertionError', function () {
            actual = '{"data": { "data": 10, "a": 11 }}';
            expect(() => resultCheckSpy(actual, expected, entitiesMap, [])).to.throw(
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
      let compareLogsSpy;

      beforeEach(function () {
        compareLogsSpy = sinon.spy(compareLogs);
      });

      afterEach(function () {
        expect(compareLogsSpy).to.have.been.calledOnce;
        sinon.restore();
      });

      describe('when failureIsRedacted is present', function () {
        describe('when failureIsRedacted=true', function () {
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
                failure: '(redacted)'
              }
            };
            compareLogsSpy([expected], [actual], entitiesMap);
          });

          it('throws AssertionError when failure is absent', function () {
            actual = {
              level: 'debug',
              component: 'command',
              data: {
                message: 'some message'
              }
            };
            expect(() => compareLogsSpy([expected], [actual], entitiesMap)).to.throw(
              AssertionError,
              /Expected failure to exist/
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
            expect(() => compareLogsSpy([expected], [actual], entitiesMap)).to.throw(
              AssertionError,
              /Expected failure to have been redacted/
            );
          });
        });

        describe('when failureIsRedacted=false', function () {
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
            compareLogsSpy([expected], [actual], entitiesMap);
          });

          it('throws AssertionError when failure is absent', function () {
            actual = {
              level: 'debug',
              component: 'command',
              data: {
                message: 'some message'
              }
            };
            expect(() => compareLogsSpy([expected], [actual], entitiesMap)).to.throw(
              AssertionError,
              /Expected failure to exist/
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
            expect(() => compareLogsSpy([expected], [actual], entitiesMap)).to.throw(
              AssertionError,
              /Expected failure to have not been redacted/
            );
          });
        });
      });

      describe('when failureIsRedacted is undefined', function () {
        beforeEach(function () {
          expected = {
            level: 'debug',
            component: 'command',
            data: { $$exists: true }
          };
        });

        it('passes when failure is not present', function () {
          actual = {
            level: 'debug',
            component: 'command',
            data: {
              message: 'some message'
            }
          };
          compareLogsSpy([expected], [actual], entitiesMap);
        });
      });

      describe('matches data field as root documents', function () {
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
          compareLogsSpy([expected], [actual], entitiesMap);
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
          expect(() => compareLogsSpy([expected], [actual], entitiesMap)).to.throw(
            AssertionError,
            /expected undefined to equal 3/
          );
        });
      });
    });
  });
});
