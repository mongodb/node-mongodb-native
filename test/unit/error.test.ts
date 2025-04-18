import { expect } from 'chai';
import { setTimeout } from 'timers';

// Exception to the import from mongodb rule we're unit testing our public Errors API
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import * as importsFromErrorSrc from '../../src/error';
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import * as importsFromEntryPoint from '../../src/index';
import {
  isHello,
  isResumableError,
  isRetryableReadError,
  isSDAMUnrecoverableError,
  LEGACY_NOT_PRIMARY_OR_SECONDARY_ERROR_MESSAGE,
  LEGACY_NOT_WRITABLE_PRIMARY_ERROR_MESSAGE,
  MONGODB_ERROR_CODES,
  MongoDriverError,
  MongoError,
  MongoErrorLabel,
  MongoMissingDependencyError,
  MongoNetworkError,
  MongoNetworkTimeoutError,
  MongoOperationTimeoutError,
  MongoParseError,
  MongoRuntimeError,
  MongoServerError,
  MongoSystemError,
  MongoWriteConcernError,
  needsRetryableWriteLabel,
  NODE_IS_RECOVERING_ERROR_MESSAGE,
  ns,
  PoolClosedError as MongoPoolClosedError,
  setDifference,
  TimeoutContext,
  type TopologyDescription,
  type TopologyOptions,
  WaitQueueTimeoutError as MongoWaitQueueTimeoutError
} from '../mongodb';
import { ReplSetFixture } from '../tools/common';
import { cleanup } from '../tools/mongodb-mock/index';
import { topologyWithPlaceholderClient } from '../tools/utils';

describe('MongoErrors', () => {
  let errorClassesFromEntryPoint = Object.fromEntries(
    Object.entries(importsFromEntryPoint).filter(
      ([key, value]) => key.endsWith('Error') && value.toString().startsWith('class')
    )
  ) as any;
  errorClassesFromEntryPoint = {
    ...errorClassesFromEntryPoint,
    MongoPoolClosedError,
    MongoWaitQueueTimeoutError
  };

  const errorClassesFromErrorSrc = Object.fromEntries(
    Object.entries(importsFromErrorSrc).filter(
      ([key, value]) => key.endsWith('Error') && value.toString().startsWith('class')
    )
  );

  it('all defined errors should be public', () => {
    expect(
      setDifference(Object.keys(errorClassesFromEntryPoint), Object.keys(errorClassesFromErrorSrc))
    ).to.have.property('size', 9);

    expect(
      setDifference(Object.keys(errorClassesFromErrorSrc), Object.keys(errorClassesFromEntryPoint))
    ).to.have.property('size', 0);
  });

  describe('error names should be read-only', () => {
    for (const [errorName, errorClass] of Object.entries<{ new (): Error }>(
      errorClassesFromEntryPoint
    )) {
      it(`${errorName} should be read-only`, () => {
        const errorNameDescriptor = Object.getOwnPropertyDescriptor(errorClass.prototype, 'name');
        expect(errorNameDescriptor).to.have.property('set').that.does.not.exist;
        expect(errorNameDescriptor).to.not.have.property('value');
        expect(errorNameDescriptor).to.have.property('get');
        expect(errorNameDescriptor.get.call(undefined)).to.equal(errorName);
      });
    }
  });

  describe('MongoError#constructor', () => {
    it('should accept a string', function () {
      const errorMessage = 'A test error';
      const err = new MongoError(errorMessage);
      expect(err).to.be.an.instanceof(Error);
      expect(err.name).to.equal('MongoError');
      expect(err.message).to.equal(errorMessage);
      expect(err).to.not.have.property('cause');
    });

    it('should accept options and set cause property', () => {
      const errorMessage = 'A test error';
      const inputError = new Error(errorMessage);
      const err = new MongoError('test', { cause: inputError });
      expect(err).to.be.an.instanceof(Error);
      expect(err.name).to.equal('MongoError');
      expect(err.message).to.equal('test');
      expect(err).to.have.property('cause').that.is.instanceOf(Error);
    });
  });

  describe('MongoServerError#constructor', () => {
    it('should accept an object', function () {
      const errorMessage = 'A test error';
      const err = new MongoServerError({ message: errorMessage, someData: 12345 });
      expect(err).to.be.an.instanceof(Error);
      expect(err.name).to.equal('MongoServerError');
      expect(err.message).to.equal(errorMessage);
      expect(err.someData).to.equal(12345);
    });
    context('errorResponse property', function () {
      it(`should set errorResponse to raw results document passed in`, function () {
        const errorDoc = { message: 'A test error', someData: 12345 };
        const err = new MongoServerError(errorDoc);
        expect(err).to.be.an.instanceof(Error);
        expect(err.errorResponse).to.deep.equal(errorDoc);
      });
      it(`should not construct enumerated key 'errorResponse' if present`, function () {
        const errorDoc = {
          message: 'A test error',
          errorResponse: 'I will not be an enumerated key'
        };
        const err = new MongoServerError(errorDoc);
        expect(err).to.be.an.instanceof(Error);
        expect(err.errorResponse).to.deep.equal(errorDoc);
        expect(err.errorResponse?.errorResponse).to.deep.equal('I will not be an enumerated key');
      });
    });
  });

  describe('MongoNetworkError#constructor', () => {
    it('should accept a string', function () {
      const errorMessage = 'A test error';
      const err = new MongoNetworkError(errorMessage);
      expect(err).to.be.an.instanceof(Error);
      expect(err).to.be.an.instanceof(MongoError);
      expect(err.name).to.equal('MongoNetworkError');
      expect(err.message).to.equal(errorMessage);
    });
  });

  describe('MongoSystemError#constructor', () => {
    context('when the topology description contains an error code', () => {
      it('contains the specified code as a top level property', () => {
        const topologyDescription = {
          error: {
            code: 123
          }
        } as TopologyDescription;

        const error = new MongoSystemError('something went wrong', topologyDescription);
        expect(error).to.haveOwnProperty('code', 123);
      });
    });

    context('when the topology description does not contain an error code', () => {
      it('contains the code as a top level property that is undefined', () => {
        const topologyDescription = { error: {} } as TopologyDescription;

        const error = new MongoSystemError('something went wrong', topologyDescription);
        expect(error).to.haveOwnProperty('code', undefined);
      });
    });

    context('when the topology description does not contain an error property', () => {
      it('contains the code as a top level property that is undefined', () => {
        const topologyDescription = {} as TopologyDescription;

        const error = new MongoSystemError('something went wrong', topologyDescription);
        expect(error).to.haveOwnProperty('code', undefined);
      });
    });
  });

  describe('class MongoOperationTimeoutError', () => {
    it('has a name property equal to MongoOperationTimeoutError', () => {
      const error = new MongoOperationTimeoutError('time out!');
      expect(error).to.have.property('name', 'MongoOperationTimeoutError');
    });

    it('is instanceof MongoDriverError', () => {
      const error = new MongoOperationTimeoutError('time out!');
      expect(error).to.be.instanceOf(MongoDriverError);
    });

    it('is not instanceof MongoRuntimeError', () => {
      const error = new MongoOperationTimeoutError('time out!');
      expect(error).to.not.be.instanceOf(MongoRuntimeError);
    });
  });

  describe('MongoMissingDependencyError#constructor', () => {
    context('when options.cause is set', () => {
      it('attaches the cause property to the instance', () => {
        const error = new MongoMissingDependencyError('missing!', { cause: new Error('hello') });
        expect(error).to.have.property('cause');
      });
    });

    context('when options.cause is not set', () => {
      it('attaches the cause property to the instance', () => {
        const error = new MongoMissingDependencyError('missing!', { cause: undefined });
        expect(error).to.have.property('cause').that.is.undefined;
      });
    });
  });

  describe('#isSDAMUnrecoverableError', function () {
    context('when the error is a MongoParseError', function () {
      it('returns true', function () {
        const error = new MongoParseError('');
        expect(isSDAMUnrecoverableError(error)).to.be.true;
      });
    });

    context('when the error is null', function () {
      it('returns true', function () {
        expect(isSDAMUnrecoverableError(null)).to.be.true;
      });
    });

    context('when the error has a "node is recovering" error code', function () {
      it('returns true', function () {
        const error = new MongoError('');
        // Code for NotPrimaryOrSecondary
        error.code = 13436;
        expect(isSDAMUnrecoverableError(error)).to.be.true;
      });
    });

    context('when the error has a "not writable primary" error code', function () {
      it('returns true', function () {
        const error = new MongoError('');
        // Code for NotWritablePrimary
        error.code = 10107;
        expect(isSDAMUnrecoverableError(error)).to.be.true;
      });
    });

    context(
      'when the code is not a "node is recovering" error and not a "not writable primary" error',
      function () {
        it('returns false', function () {
          // If the response includes an error code, it MUST be solely used to determine if error is a "node is recovering" or "not writable primary" error.
          const error = new MongoError(NODE_IS_RECOVERING_ERROR_MESSAGE.source);
          error.code = 555;
          expect(isSDAMUnrecoverableError(error)).to.be.false;
        });
      }
    );

    context(
      'when the error message contains the legacy "not primary" message and no error code is used',
      function () {
        it('returns true', function () {
          const error = new MongoError(
            `this is ${LEGACY_NOT_WRITABLE_PRIMARY_ERROR_MESSAGE.source}.`
          );
          expect(isSDAMUnrecoverableError(error)).to.be.true;
        });
      }
    );

    context(
      'when the error message contains "node is recovering" and no error code is used',
      function () {
        it('returns true', function () {
          const error = new MongoError(`the ${NODE_IS_RECOVERING_ERROR_MESSAGE} from an error`);
          expect(isSDAMUnrecoverableError(error)).to.be.true;
        });
      }
    );

    context(
      'when the error message contains the legacy "not primary or secondary" message and no error code is used',
      function () {
        it('returns true', function () {
          const error = new MongoError(
            `this is ${LEGACY_NOT_PRIMARY_OR_SECONDARY_ERROR_MESSAGE}, so we have a problem `
          );
          expect(isSDAMUnrecoverableError(error)).to.be.true;
        });
      }
    );
  });

  describe('when MongoNetworkError is constructed', () => {
    describe('without options', () => {
      it('sets beforeHandshake to false', () => {
        const error = new MongoNetworkError('error');
        expect(error.beforeHandshake).to.be.false;
      });
    });

    describe('with options', () => {
      it('sets beforeHandshake to false if it is nullish or false', () => {
        const error = new MongoNetworkError('error', {});
        expect(error.beforeHandshake).to.be.false;
        const error2 = new MongoNetworkError('error', { beforeHandshake: false });
        expect(error2.beforeHandshake).to.be.false;
      });

      it('sets beforeHandshake to true if it is set', () => {
        const error = new MongoNetworkError('error', { beforeHandshake: true });
        expect(error.beforeHandshake).to.be.true;
      });
    });
  });

  describe('WriteConcernError', function () {
    let test;
    const RAW_USER_WRITE_CONCERN_CMD = {
      createUser: 'foo2',
      pwd: 'pwd',
      roles: ['read'],
      writeConcern: { w: 'majority', wtimeoutMS: 1 }
    };

    const RAW_USER_WRITE_CONCERN_ERROR = {
      ok: 1,
      errmsg: 'waiting for replication timed out',
      code: 64,
      codeName: 'WriteConcernFailed',
      writeConcernError: {
        code: 64,
        codeName: 'WriteConcernFailed',
        errmsg: 'waiting for replication timed out',
        errInfo: {
          wtimeout: true
        }
      }
    };

    const RAW_USER_WRITE_CONCERN_ERROR_INFO = {
      ok: 1,
      errmsg: 'waiting for replication timed out',
      code: 64,
      codeName: 'WriteConcernFailed',
      writeConcernError: {
        code: 64,
        codeName: 'WriteConcernFailed',
        errmsg: 'waiting for replication timed out',
        errInfo: {
          writeConcern: {
            w: 2,
            wtimeout: 0,
            provenance: 'clientSupplied'
          }
        }
      }
    };

    before(() => (test = new ReplSetFixture()));

    afterEach(() => cleanup());

    beforeEach(() => test.setup());

    function makeAndConnectReplSet(cb) {
      let invoked = false;
      const replSet = topologyWithPlaceholderClient(
        [test.primaryServer.hostAddress(), test.firstSecondaryServer.hostAddress()],
        { replicaSet: 'rs' } as TopologyOptions
      );

      replSet.once('error', err => {
        if (invoked) {
          return;
        }
        invoked = true;
        cb(err);
      });

      replSet.on('connect', () => {
        if (invoked) {
          return;
        }

        invoked = true;
        cb(undefined, replSet);
      });

      replSet.connect();
    }

    it('should expose a user command writeConcern error like a normal WriteConcernError', function () {
      test.primaryServer.setMessageHandler(request => {
        const doc = request.document;
        if (isHello(doc)) {
          setTimeout(() => request.reply(test.primaryStates[0]));
        } else if (doc.createUser) {
          setTimeout(() => request.reply(RAW_USER_WRITE_CONCERN_ERROR));
        }
      });
      const replSet = topologyWithPlaceholderClient(
        [test.primaryServer.hostAddress(), test.firstSecondaryServer.hostAddress()],
        { replicaSet: 'rs' } as TopologyOptions
      );

      const timeoutContext = TimeoutContext.create({
        serverSelectionTimeoutMS: 0,
        waitQueueTimeoutMS: 0
      });
      return replSet
        .connect()
        .then(topology => topology.selectServer('primary', { timeoutContext }))
        .then(server =>
          server.command(ns('db1'), Object.assign({}, RAW_USER_WRITE_CONCERN_CMD), {
            timeoutContext
          })
        )
        .then(
          () => expect.fail('expected command to fail'),
          err => {
            expect(err).to.be.an.instanceOf(MongoWriteConcernError);
            expect(err.result).to.exist;
            expect(err.result).to.have.property('ok', 1);
            expect(err.result).to.have.property('errmsg');
            expect(err.result).to.have.property('code');
            expect(err.result).to.have.property('codeName');
            expect(err.result).to.have.property('writeConcernError');
          }
        )
        .finally(() => {
          replSet.close();
        });
    });

    it('should propagate writeConcernError.errInfo ', function (done) {
      test.primaryServer.setMessageHandler(request => {
        const doc = request.document;
        if (isHello(doc)) {
          setTimeout(() => request.reply(test.primaryStates[0]));
        } else if (doc.createUser) {
          setTimeout(() => request.reply(RAW_USER_WRITE_CONCERN_ERROR_INFO));
        }
      });

      makeAndConnectReplSet((err, topology) => {
        // cleanup the server before calling done
        const cleanup = err => {
          topology.close();
          done(err);
        };

        if (err) {
          return cleanup(err);
        }
        const timeoutContext = TimeoutContext.create({
          serverSelectionTimeoutMS: 0,
          waitQueueTimeoutMS: 0
        });

        topology.selectServer('primary', { timeoutContext }).then(server => {
          server
            .command(ns('db1'), Object.assign({}, RAW_USER_WRITE_CONCERN_CMD), { timeoutContext })
            .then(expect.fail, err => {
              let _err;
              try {
                expect(err).to.be.an.instanceOf(MongoWriteConcernError);
                expect(err.result).to.exist;
                expect(err.result.writeConcernError).to.deep.equal(
                  RAW_USER_WRITE_CONCERN_ERROR_INFO.writeConcernError
                );
              } catch (e) {
                _err = e;
              } finally {
                cleanup(_err);
              }
            });
        }, expect.fail);
      });
    });
  });

  describe('retryable errors', () => {
    describe('#needsRetryableWriteLabel', () => {
      // Note the wireVersions used below are used to represent
      // 8 - below server version 4.4
      // 9 - above server version 4.4

      const ABOVE_4_4 = 9;
      const BELOW_4_4 = 8;

      const tests: {
        description: string;
        result: boolean;
        error: Error;
        maxWireVersion: number;
      }[] = [
        {
          description: 'a plain error',
          result: false,
          error: new Error('do not retry me!'),
          maxWireVersion: BELOW_4_4
        },
        {
          description: 'a MongoError with no code nor label',
          result: false,
          error: new MongoError('do not retry me!'),
          maxWireVersion: BELOW_4_4
        },
        {
          description: 'network error',
          result: true,
          error: new MongoNetworkError('socket bad, try again'),
          maxWireVersion: BELOW_4_4
        },
        {
          description: 'a MongoWriteConcernError with a random label',
          result: false,
          error: new MongoWriteConcernError({
            writeConcernError: {
              errmsg: 'random label',
              code: 1
            },
            errorLabels: ['myLabel']
          }),
          maxWireVersion: BELOW_4_4
        },
        {
          description: 'a MongoWriteConcernError with a retryable code above server 4.4',
          result: false,
          error: new MongoWriteConcernError({
            writeConcernError: {
              errmsg: 'code 262', // ExceededTimeLimit, is retryable
              code: 262
            }
          }),
          maxWireVersion: ABOVE_4_4
        },
        {
          description: 'a MongoWriteConcernError with a retryable code below server 4.4',
          result: true,
          error: new MongoWriteConcernError({
            writeConcernError: {
              errmsg: 'code 262',
              code: 262
            }
          }),
          maxWireVersion: BELOW_4_4
        },
        {
          description: 'a MongoWriteConcernError with a RetryableWriteError label below server 4.4',
          result: false,
          error: new MongoWriteConcernError({
            writeConcernError: {
              errmsg: 'code 1',
              code: 1
            },
            errorLabels: ['RetryableWriteError']
          }),
          maxWireVersion: BELOW_4_4
        },
        {
          description: 'a MongoWriteConcernError with a RetryableWriteError label above server 4.4',
          result: false,
          error: new MongoWriteConcernError({
            writeConcernError: {
              errmsg: 'code 1',
              code: 1
            },
            errorLabels: ['RetryableWriteError']
          }),
          maxWireVersion: ABOVE_4_4
        },
        {
          description: 'any MongoError with a RetryableWriteError label',
          result: false,
          error: (() => {
            // These tests all use MongoWriteConcernError because
            // its constructor is easier to call but any MongoError should work
            const error = new MongoError('');
            error.addErrorLabel('RetryableWriteError');
            return error;
          })(),
          maxWireVersion: ABOVE_4_4
        }
      ];
      for (const { description, result, error, maxWireVersion } of tests) {
        it(`${description} ${result ? 'needs' : 'does not need'} a retryable write label`, () => {
          expect(needsRetryableWriteLabel(error, maxWireVersion)).to.be.equal(result);
        });
      }
    });

    describe('#isRetryableReadError', () => {
      const tests: { description: string; result: boolean; error: MongoError }[] = [
        {
          description: 'plain error',
          result: false,
          // @ts-expect-error: passing in a plain error to test false case
          error: new Error('do not retry me!')
        },
        {
          description: 'An error code that is not retryable',
          result: false,
          error: new MongoServerError({ message: '', code: 1 })
        },
        {
          description: 'An error code that is retryable',
          result: true,
          error: new MongoServerError({ message: '', code: 91 })
        },
        {
          description: 'network error',
          result: true,
          error: new MongoNetworkError('socket bad, try again')
        },
        {
          description: 'error with legacy not writable primary error message',
          result: true,
          error: new MongoError(LEGACY_NOT_WRITABLE_PRIMARY_ERROR_MESSAGE.source)
        },
        {
          description: 'error with node is recovering error message',
          result: true,
          error: new MongoError('node is recovering')
        }
      ];

      for (const { description, result, error } of tests) {
        it(`${description} is${result ? '' : ' not'} a retryable read`, () => {
          expect(isRetryableReadError(error)).to.be.equal(result);
        });
      }
    });
  });

  describe('isResumableError()', () => {
    describe('should return true', () => {
      it('for MongoNetworkError regardless of wire version', () => {
        expect(isResumableError(new MongoNetworkError('ah!'))).to.be.true;
        expect(isResumableError(new MongoNetworkError('ah!'), 8)).to.be.true;
        expect(isResumableError(new MongoNetworkError('ah!'), 9)).to.be.true;
        expect(isResumableError(new MongoNetworkTimeoutError('ah!'))).to.be.true;
        expect(isResumableError(new MongoNetworkTimeoutError('ah!'), 8)).to.be.true;
        expect(isResumableError(new MongoNetworkTimeoutError('ah!'), 9)).to.be.true;
      });

      it('for labelless MongoError with CursorNotFound code regardless of wire version', () => {
        const mongoError = new MongoError('ah!');
        mongoError.code = MONGODB_ERROR_CODES.CursorNotFound;
        expect(isResumableError(mongoError)).to.be.true;
        expect(isResumableError(mongoError, 9)).to.be.true;
        expect(isResumableError(mongoError, 8)).to.be.true;
      });

      it('for resumable codes if wireVersion is below 9 or unspecified', () => {
        const mongoError = new MongoError('ah!');
        mongoError.code = MONGODB_ERROR_CODES.ShutdownInProgress; // Shutdown in progress is resumable
        expect(isResumableError(mongoError)).to.be.true;
        expect(isResumableError(mongoError, 8)).to.be.true;
      });

      it('for labeled MongoError only if the wireVersion is at least 9', () => {
        const mongoError = new MongoError('ah!');
        mongoError.addErrorLabel(MongoErrorLabel.ResumableChangeStreamError);
        expect(mongoError.hasErrorLabel(MongoErrorLabel.ResumableChangeStreamError)).to.be.true;
        expect(isResumableError(mongoError, 9)).to.be.true;
      });
    });

    describe('should return false', () => {
      it('for errors that are not MongoError', () => {
        expect(isResumableError(new Error('ah!'))).to.be.false;
        expect(isResumableError(new TypeError('ah!'))).to.be.false;
      });

      it('for an error that is not a MongoError regardless of code property or wire version', () => {
        // a plain error with and without wire version argument
        expect(isResumableError(new Error('ah!'))).to.be.false;
        expect(isResumableError(new Error('ah!'), 9)).to.be.false;
        expect(isResumableError(new Error('ah!'), 8)).to.be.false;

        const errorWithCode = new (class extends Error {
          get code() {
            throw new Error('code on a non-MongoError should not be inspected');
          }
          hasErrorLabel() {
            throw new Error('hasErrorLabel should not be checked on a non-MongoError');
          }
        })();
        // Expectations that prove this syntax provides what is desired for the test
        expect(errorWithCode).to.be.instanceOf(Error);
        expect(errorWithCode).to.not.be.instanceOf(MongoError);
        // Testing that even coded and labeled non-MongoErrors will not get resumed
        expect(isResumableError(errorWithCode)).to.be.false;
        expect(isResumableError(errorWithCode, 8)).to.be.false;
        expect(isResumableError(errorWithCode, 9)).to.be.false;
      });

      it('for nullish error argument regardless of wire version', () => {
        expect(isResumableError()).to.be.false;
        expect(isResumableError(undefined)).to.be.false;
        expect(isResumableError(null)).to.be.false;
        expect(isResumableError(null, null)).to.be.false;
        expect(isResumableError(undefined, undefined)).to.be.false;
        expect(isResumableError(null, undefined)).to.be.false;
        expect(isResumableError(undefined, null)).to.be.false;
        expect(isResumableError(null, 8)).to.be.false;
        expect(isResumableError(null, 9)).to.be.false;
        expect(isResumableError(undefined, 8)).to.be.false;
        expect(isResumableError(undefined, 9)).to.be.false;
      });

      it('for resumable codes if wireVersion is at least 9', () => {
        const mongoError = new MongoError('ah!');
        mongoError.code = MONGODB_ERROR_CODES.ShutdownInProgress; // Shutdown in progress is resumable
        expect(isResumableError(mongoError, 9)).to.be.false; // 4.4+ uses label only except for CursorNotFound
      });

      it('for non numeric code regardless of wire version', () => {
        const mongoError = new MongoError('ah!');
        mongoError.code = 'Random String';
        expect(isResumableError(mongoError)).to.be.false;
        expect(isResumableError(mongoError, 8)).to.be.false;
        expect(isResumableError(mongoError, 9)).to.be.false;
      });

      it('for labeled error below wire version 9', () => {
        const mongoError = new MongoError('ah!');
        mongoError.addErrorLabel(MongoErrorLabel.ResumableChangeStreamError);
        expect(mongoError.hasErrorLabel(MongoErrorLabel.ResumableChangeStreamError)).to.be.true;
        expect(isResumableError(mongoError, 8)).to.be.false;
        expect(isResumableError(mongoError)).to.be.false;
      });
    });
  });

  describe('MongoError#buildErrorMessage', function () {
    context(
      'when passed an AggregateError with an empty message and non-empty errors array',
      function () {
        it('returns error messages separated by commas', function () {
          const aggErr = new AggregateError([new Error('message 1'), new Error('message 2')], '');
          expect(MongoError.buildErrorMessage(aggErr)).to.deep.equal('message 1, message 2');
        });
      }
    );
    context('when passed an AggregateError with a non-empty message', function () {
      it('returns message field', function () {
        const aggErr = new AggregateError(
          [new Error('message 1'), new Error('message 2')],
          'aggErr'
        );
        expect(MongoError.buildErrorMessage(aggErr)).to.deep.equal(aggErr.message);
      });
    });
    context(
      'when passed an AggregateError with an empty errors array and empty message',
      function () {
        it('returns string instructing user to check `cause` property', function () {
          const aggErr = new AggregateError([], '');
          expect(MongoError.buildErrorMessage(aggErr)).to.match(
            /Please check the `cause` property for more information./
          );
        });
      }
    );
    context('when passed an Error that is not an AggregateError', function () {
      it("returns the Error's message property", function () {
        const err = new Error('error message');
        expect(MongoError.buildErrorMessage(err)).to.deep.equal('error message');
      });
    });

    context('when passed a string', function () {
      it('returns the string', function () {
        expect(MongoError.buildErrorMessage('message')).to.deep.equal('message');
      });
    });
  });

  describe('MongoWriteConcernError constructor', function () {
    context('when no top-level code is provided', function () {
      it('error.code is set to writeConcernError.code', function () {
        const res = {
          writeConcernError: {
            code: 81, // nested code
            errmsg: 'fake msg'
          },
          ok: 1
        };
        expect(new MongoWriteConcernError(res).code).to.equal(81);
      });
    });
    context('when top-level code is provided and  writeConcernError.code exists', function () {
      it('error.code equals the top-level code', function () {
        const topLevelCode = 10;
        const res = {
          writeConcernError: {
            code: 81, // nested code
            errmsg: 'fake msg'
          },
          ok: 1,
          code: topLevelCode
        };
        expect(new MongoWriteConcernError(res).code).to.equal(topLevelCode);
      });
    });
  });
});
