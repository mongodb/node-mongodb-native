import { BSON } from 'bson';
import { expect } from 'chai';

describe('When importing BSON', function () {
  const types = [
    ['Long', 23],
    ['ObjectId', '123456789123456789123456'],
    ['Binary', Buffer.from('abc', 'ascii')],
    ['Timestamp', 23n],
    ['Code', 'function(){}'],
    ['MinKey', undefined],
    ['MaxKey', undefined],
    ['Decimal128', '2.34'],
    ['Int32', 23],
    ['Double', 2.3],
    ['BSONRegExp', 'abc']
  ] as const;
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
    expect(Map).to.be.a('function');
    const doc = { key: new Map([['2', 2]]) };
    const outputDoc = BSON.deserialize(BSON.serialize(doc));
    expect(outputDoc).to.have.nested.property('key.2', 2);
  });
});

describe('MongoDB export', () => {
  it('should include ObjectId', () =>
    expect(BSON).to.have.property('ObjectId').that.is.a('function'));
});
