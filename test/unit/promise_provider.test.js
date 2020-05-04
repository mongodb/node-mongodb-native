'use strict';
const expect = require('chai').expect;

const PromiseProvider = require('../../lib/promise_provider');

const symbols = {
  withOptions: Symbol('withOptions'),
  withClientOptions: Symbol('withClientOptions'),
  withS: Symbol('withS')
};

const candidates = {
  withOptions: { options: { promiseLibrary: () => symbols.withOptions } },
  withClientOptions: { clientOptions: { promiseLibrary: () => symbols.withClientOptions } },
  withS: { s: { promiseLibrary: () => symbols.withS } }
};

describe('PromiseProvider', () => {
  it('should pass correct option along', () => {
    const withOptions = PromiseProvider.get(candidates.withOptions);
    expect(withOptions()).to.equal(symbols.withOptions);

    const withClientOptions = PromiseProvider.get(candidates.withClientOptions);
    expect(withClientOptions()).to.equal(symbols.withClientOptions);

    const withS = PromiseProvider.get(candidates.withS);
    expect(withS()).to.equal(symbols.withS);

    // test non-viable option first, still retrieves second option
    const preWithOptions = PromiseProvider.get({}, candidates.withOptions);
    expect(preWithOptions()).to.equal(symbols.withOptions);

    const preWithClientOptions = PromiseProvider.get({}, candidates.withClientOptions);
    expect(preWithClientOptions()).to.equal(symbols.withClientOptions);

    const preWithS = PromiseProvider.get({}, candidates.withS);
    expect(preWithS()).to.equal(symbols.withS);

    // non-viable, with two viable, shows gets first viable
    const getsPremier = PromiseProvider.get({}, candidates.withOptions, candidates.withS);
    expect(getsPremier()).to.equal(symbols.withOptions);

    // demonstrates default is retrieved
    const state = PromiseProvider.get();
    const empty = PromiseProvider.get({}, null);
    expect(empty).to.equal(state);
  });
});
