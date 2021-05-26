'use strict';

const { expect } = require('chai');
const BSON = require('../../src/bson');

describe('BSON Library Import', function () {
  it('should import bson-ext if it exists', function () {
    try {
      require('bson-ext');
    } catch (_) {
      this.skip();
    }
    expect(BSON.deserialize).to.be.a('function');
    expect(BSON.serialize).to.be.a('function');
    expect(BSON.calculateObjectSize).to.be.a('function');
    // Confirms we are using the bson-ext library
    expect(BSON.deserialize.toString()).to.include('[native code]');
    expect(BSON.serialize.toString()).to.include('[native code]');
    expect(BSON.calculateObjectSize.toString()).to.include('[native code]');
  });

  it('bson-ext should correctly round trip a Long', function () {
    try {
      require('bson-ext');
    } catch (_) {
      this.skip();
    }

    const longValue = BSON.Long.fromNumber(2);

    const roundTrip = BSON.deserialize(BSON.serialize({ longValue }));

    expect(roundTrip).has.property('longValue');
  });
  it('should import js-bson if bson-ext does not exist', function () {
    try {
      require('bson-ext');
      this.skip();
      // eslint-disable-next-line no-empty
    } catch (_) {}
    expect(BSON.deserialize).to.be.a('function');
    expect(BSON.serialize).to.be.a('function');
    expect(BSON.calculateObjectSize).to.be.a('function');

    expect(BSON.deserialize.toString()).to.not.include('[native code]');
    expect(BSON.serialize.toString()).to.not.include('[native code]');
    expect(BSON.calculateObjectSize.toString()).to.not.include('[native code]');
  });
});
