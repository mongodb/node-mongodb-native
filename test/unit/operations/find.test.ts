import { expect } from 'chai';
import * as sinon from 'sinon';

import { FindOperation } from '../../../src/operations/find';
import { ns } from '../../../src/utils';

describe('FindOperation', function () {
  const namespace = ns('db.coll');
  const options = {
    batchSize: 100
  };
  const filter = {
    ts: { $gt: new Date() }
  };

  afterEach(function () {
    sinon.restore();
  });

  describe('#constructor', function () {
    const operation = new FindOperation(namespace, filter, options);

    it('sets the namespace', function () {
      expect(operation.ns).to.deep.equal(namespace);
    });

    it('sets options', function () {
      expect(operation.options).to.deep.equal(options);
    });

    it('sets filter', function () {
      expect(operation.filter).to.deep.equal(filter);
    });
  });

  context('command construction', () => {
    const namespace = ns('db.collection');

    it('should build find command with oplogReplay', () => {
      const options = {
        oplogReplay: true
      };
      const findOperation = new FindOperation(namespace, {}, options);
      const command = findOperation.buildCommandDocument();
      expect(command.oplogReplay).to.be.true;
    });
  });
});
