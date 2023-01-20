'use strict';

const { expect } = require('chai');
const BSON = require('../mongodb');

describe('When importing BSON', function () {
  const types = [
    ['Long', 23],
    ['ObjectId', '123456789123456789123456'],
    ['Binary', Buffer.from('abc', 'ascii')],
    ['Timestamp', 23],
    ['Code', 'function(){}'],
    ['MinKey', undefined],
    ['MaxKey', undefined],
    ['Decimal128', '2.34'],
    ['Int32', 23],
    ['Double', 2.3],
    ['BSONRegExp', 'abc']
  ];
  // Omitted types since they're deprecated:
  // BSONSymbol
  // DBRef

  const options = {
    promoteValues: false,
    bsonRegExp: true
  };

  for (const [type, ctorArg] of types) {
    it(`should correctly round trip ${type}`, function () {
      const typeCtor = BSON[type];
      expect(typeCtor).to.be.a('function');
      const doc = { key: new typeCtor(ctorArg) };
      const outputDoc = BSON.deserialize(BSON.serialize(doc), options);
      expect(outputDoc).to.have.property('key').that.is.instanceOf(typeCtor);
      expect(outputDoc).to.deep.equal(doc);
    });
  }

  it('should correctly round trip Map', function () {
    expect(BSON.Map).to.be.a('function');
    const doc = { key: new BSON.Map([['2', 2]]) };
    const outputDoc = BSON.deserialize(BSON.serialize(doc));
    expect(outputDoc).to.have.nested.property('key.2', 2);
  });
});

describe('MongoDB export', () => {
  it('should include ObjectId', () =>
    expect(BSON).to.have.property('ObjectId').that.is.a('function'));
});
