'use strict';
const expect = require('chai').expect;

const PromiseProvider = require('../../lib/promise_provider');

const candidates = {
  withOptions: { options: { promiseLibrary: Symbol('withOptions') } },
  withClientOptions: { clientOptions: { promiseLibrary: Symbol('withClientOptions') } },
  withS: { s: { promiseLibrary: Symbol('withS') } }
};

describe('PromiseProvider', () => {
  it('should pass correct option along', () => {
    // test single option
    const withOptions = PromiseProvider.get(candidates.withOptions);
    expect(withOptions).to.equal(candidates.withOptions.options.promiseLibrary);
    const withClientOptions = PromiseProvider.get(candidates.withClientOptions);
    expect(withClientOptions).to.equal(candidates.withClientOptions.clientOptions.promiseLibrary);
    const withS = PromiseProvider.get(candidates.withS);
    expect(withS).to.equal(candidates.withS.s.promiseLibrary);

    // test non-viable option first, still retrieves second option
    const preWithOptions = PromiseProvider.get({}, candidates.withOptions);
    expect(preWithOptions).to.equal(candidates.withOptions.options.promiseLibrary);
    const preWithClientOptions = PromiseProvider.get({}, candidates.withClientOptions);
    expect(preWithClientOptions).to.equal(
      candidates.withClientOptions.clientOptions.promiseLibrary
    );
    const preWithS = PromiseProvider.get({}, candidates.withS);
    expect(preWithS).to.equal(candidates.withS.s.promiseLibrary);

    // non-viable, with two viable, shows gets first viable
    const getsPremier = PromiseProvider.get({}, candidates.withOptions, candidates.withS);
    expect(getsPremier).to.equal(candidates.withOptions.options.promiseLibrary);

    // demonstrates default is retrieved
    const state = PromiseProvider.get();
    const empty = PromiseProvider.get({}, null);
    expect(empty).to.equal(state);
  });
});
