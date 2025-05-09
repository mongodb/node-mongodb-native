import { expect } from 'chai';

import {
  MAX_SUPPORTED_SERVER_VERSION,
  MAX_SUPPORTED_WIRE_VERSION,
  MIN_SUPPORTED_SERVER_VERSION,
  MIN_SUPPORTED_WIRE_VERSION
} from '../../../mongodb';

describe('Wire Protocol Constants', function () {
  describe('MIN_SUPPORTED_SERVER_VERSION', function () {
    it('returns 4.2', function () {
      expect(MIN_SUPPORTED_SERVER_VERSION).to.equal('4.2');
    });
  });

  describe('MAX_SUPPORTED_SERVER_VERSION', function () {
    it('returns 8.0', function () {
      expect(MAX_SUPPORTED_SERVER_VERSION).to.equal('8.0');
    });
  });

  describe('MIN_SUPPORTED_WIRE_VERSION', function () {
    it('returns 8', function () {
      expect(MIN_SUPPORTED_WIRE_VERSION).to.equal(8);
    });
  });

  describe('MAX_SUPPORTED_WIRE_VERSION', function () {
    it('returns 25', function () {
      expect(MAX_SUPPORTED_WIRE_VERSION).to.equal(25);
    });
  });
});
