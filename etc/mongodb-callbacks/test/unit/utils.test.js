'use strict';

const { expect } = require('chai');
const utils = require('../../src/utils');

describe('utils.js', () => {
  describe('exports', () => {
    it('should have toLegacy symbol', () => {
      expect(utils).to.have.property('toLegacy').that.is.a('symbol');
    });

    it('should have maybeCallback helper', () => {
      expect(utils).to.have.property('maybeCallback').that.is.a('function');
    });

    it('should have getSymbolFrom helper', () => {
      expect(utils).to.have.property('getSymbolFrom').that.is.a('function');
    });
  });

  describe('maybeCallback', () => {
    const maybeCallback = utils.maybeCallback;
    it('should accept up to three arguments', () => {
      expect(maybeCallback).to.have.lengthOf(3);
    });

    it('should return promise provided if no other arguments are present', async () => {
      const promise = Promise.resolve(2);
      const result = maybeCallback(promise);
      expect(promise).to.equal(result);
      expect(await result).to.equal(2);
    });

    it('should return void if callback is provided', () => {
      const promise = Promise.resolve(2);
      const result = maybeCallback(promise, () => null);
      expect(result).to.be.undefined;
    });

    it('should resolve promise to callback', done => {
      const promise = Promise.resolve(2);
      const result = maybeCallback(promise, (error, result) => {
        try {
          expect(error).to.not.exist;
          expect(result).to.equal(2);
          done();
        } catch (assertionError) {
          done(assertionError);
        }
      });
      expect(result).to.be.undefined;
    });

    it('should create new promise if conversion function is provided', async () => {
      const promise = Promise.resolve(15);
      const result = maybeCallback(promise, null, result => result.toString(16));
      expect(promise).to.not.equal(result);
      expect(await result).to.equal('f');
    });

    it('should use conversion before resolving promise to callback', done => {
      const promise = Promise.resolve(15);
      const result = maybeCallback(
        promise,
        (error, result) => {
          try {
            expect(error).to.not.exist;
            expect(result).to.equal('f');
            done();
          } catch (assertionError) {
            done(assertionError);
          }
        },
        result => result.toString(16)
      );
      expect(result).to.be.undefined;
    });
  });
});
