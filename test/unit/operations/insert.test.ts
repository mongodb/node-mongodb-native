import * as BSON from 'bson';
import { expect } from 'chai';

import { DocumentSequence, InsertOperation, MongoDBNamespace } from '../../mongodb';

describe('InsertOperation', function () {
  const ns = MongoDBNamespace.fromString('test.coll');
  const docs = [{ _id: 1 }, { _id: 2 }];

  it('uses a DocumentSequence when serialized buffers are provided', function () {
    const buffers = docs.map(d => BSON.serialize(d));
    const op = new InsertOperation(ns, docs, {}, buffers);
    const command = op.buildCommandDocument({} as any);
    expect(command.documents).to.be.instanceOf(DocumentSequence);
    expect(command.documents.documents).to.deep.equal(docs);
  });

  it('uses a plain array when no serialized buffers are provided', function () {
    const op = new InsertOperation(ns, docs, {});
    const command = op.buildCommandDocument({} as any);
    expect(Array.isArray(command.documents)).to.equal(true);
    expect(command.documents).to.deep.equal(docs);
  });
});
