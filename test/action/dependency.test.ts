import { expect } from 'chai';

import { dependencies } from '../../package.json';

const EXPECTED_DEPENDENCIES = ['bson', 'js-sdsl', 'mongodb-connection-string-url', 'socks'];

describe('package.json', function () {
  describe('dependencies', function () {
    it('only contains the expected dependencies', function () {
      expect(Object.getOwnPropertyNames(dependencies)).to.deep.equal(EXPECTED_DEPENDENCIES);
    });
  });
});
