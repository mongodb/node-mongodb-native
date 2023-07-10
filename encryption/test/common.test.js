'use strict';

const { expect } = require('chai');
const maybeCallback = require('../lib/common').maybeCallback;

describe('maybeCallback()', () => {
  it('should accept two arguments', () => {
    expect(maybeCallback).to.have.lengthOf(2);
  });

  describe('when handling an error case', () => {
    it('should pass the error to the callback provided', done => {
      const superPromiseRejection = Promise.reject(new Error('fail'));
      const result = maybeCallback(
        () => superPromiseRejection,
        (error, result) => {
          try {
            expect(result).to.not.exist;
            expect(error).to.be.instanceOf(Error);
            return done();
          } catch (assertionError) {
            return done(assertionError);
          }
        }
      );
      expect(result).to.be.undefined;
    });

    it('should return the rejected promise to the caller when no callback is provided', async () => {
      const superPromiseRejection = Promise.reject(new Error('fail'));
      const returnedPromise = maybeCallback(() => superPromiseRejection, undefined);
      expect(returnedPromise).to.equal(superPromiseRejection);
      // @ts-expect-error: There is no overload to change the return type not be nullish,
      // and we do not want to add one in fear of making it too easy to neglect adding the callback argument
      const thrownError = await returnedPromise.catch(error => error);
      expect(thrownError).to.be.instanceOf(Error);
    });

    it('should not modify a rejection error promise', async () => {
      class MyError extends Error {}
      const driverError = Object.freeze(new MyError());
      const rejection = Promise.reject(driverError);
      // @ts-expect-error: There is no overload to change the return type not be nullish,
      // and we do not want to add one in fear of making it too easy to neglect adding the callback argument
      const thrownError = await maybeCallback(() => rejection, undefined).catch(error => error);
      expect(thrownError).to.be.equal(driverError);
    });

    it('should not modify a rejection error when passed to callback', done => {
      class MyError extends Error {}
      const driverError = Object.freeze(new MyError());
      const rejection = Promise.reject(driverError);
      maybeCallback(
        () => rejection,
        error => {
          try {
            expect(error).to.exist;
            expect(error).to.equal(driverError);
            done();
          } catch (assertionError) {
            done(assertionError);
          }
        }
      );
    });
  });

  describe('when handling a success case', () => {
    it('should pass the result and undefined error to the callback provided', done => {
      const superPromiseSuccess = Promise.resolve(2);

      const result = maybeCallback(
        () => superPromiseSuccess,
        (error, result) => {
          try {
            expect(error).to.be.undefined;
            expect(result).to.equal(2);
            done();
          } catch (assertionError) {
            done(assertionError);
          }
        }
      );
      expect(result).to.be.undefined;
    });

    it('should return the resolved promise to the caller when no callback is provided', async () => {
      const superPromiseSuccess = Promise.resolve(2);
      const result = maybeCallback(() => superPromiseSuccess);
      expect(result).to.equal(superPromiseSuccess);
      expect(await result).to.equal(2);
    });
  });
});
