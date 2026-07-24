import * as BSON from 'bson';
import { expect } from 'chai';

import {
  DeleteOperation,
  DocumentSequence,
  MongoDBNamespace,
  UpdateOperation
} from '../../mongodb';

describe('Update/Delete DocumentSequence', function () {
  const ns = MongoDBNamespace.fromString('test.coll');

  it('UpdateOperation uses a DocumentSequence for updates when buffers provided', function () {
    const statements = [{ q: { a: 1 }, u: { $set: { b: 2 } } }];
    const buffers = statements.map(s => BSON.serialize(s));
    const op = new UpdateOperation(ns, statements as any, {}, buffers);
    const command = op.buildCommandDocument({} as any);
    expect(command.updates).to.be.instanceOf(DocumentSequence);
    expect(command.updates.documents).to.deep.equal(statements);
  });

  it('DeleteOperation uses a DocumentSequence for deletes when buffers provided', function () {
    const statements = [{ q: { a: 1 }, limit: 1 }];
    const buffers = statements.map(s => BSON.serialize(s));
    const op = new DeleteOperation(ns, statements as any, {}, buffers);
    const command = op.buildCommandDocument({} as any);
    expect(command.deletes).to.be.instanceOf(DocumentSequence);
    expect(command.deletes.documents).to.deep.equal(statements);
  });

  it('falls back to arrays when no buffers provided', function () {
    const u = new UpdateOperation(ns, [{ q: {}, u: {} }] as any, {});
    const d = new DeleteOperation(ns, [{ q: {}, limit: 1 }] as any, {});
    expect(Array.isArray(u.buildCommandDocument({} as any).updates)).to.equal(true);
    expect(Array.isArray(d.buildCommandDocument({} as any).deletes)).to.equal(true);
  });
});
