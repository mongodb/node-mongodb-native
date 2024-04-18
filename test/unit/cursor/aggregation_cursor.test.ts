import { expect } from 'chai';

import { type AggregationCursor, MongoClient } from '../../mongodb';

describe('class AggregationCursor', () => {
  let client: MongoClient;
  let cursor: AggregationCursor;

  beforeEach(async function () {
    client = new MongoClient('mongodb://iLoveJavascript');
    cursor = client.db().aggregate();
  });

  afterEach(async function () {
    await cursor.close();
    await client.close();
  });

  context('get pipeline()', () => {
    it('returns the current aggregation pipeline', () => {
      expect(cursor.pipeline).to.deep.equal([]);
    });
  });

  context('clone()', () => {
    it('returns a new cursor with a different session', () => {
      const cloned = cursor.clone();
      expect(cursor).to.not.equal(cloned);
      expect(cursor.session).to.not.equal(cloned.session);
    });
  });

  context('map()', () => {
    /*
     * map does not actually return a new cursor,
     * the method exists to allow typescript to redefine the output based on the transform
     */
    it('returns the same cursor instance', () => {
      const mappedCursor = cursor.map(() => ({ blah: 1 }));
      expect(cursor).to.equal(mappedCursor);
    });
  });

  context('geoNear()', () => {
    it('adds a $geoNear stage', () => {
      cursor.geoNear({ lat: 1, lon: 1 });
      expect(cursor.pipeline).to.have.deep.property('0', { $geoNear: { lat: 1, lon: 1 } });
    });
  });

  context('unwind()', () => {
    it('adds a $unwind stage', () => {
      cursor.unwind({ blah: 1 });
      expect(cursor.pipeline).to.have.deep.property('0', { $unwind: { blah: 1 } });
    });
  });

  context('sort()', () => {
    it('adds a $sort stage', () => {
      cursor.sort({ _id: -1 });
      expect(cursor.pipeline).to.have.deep.property('0', { $sort: { _id: -1 } });
    });
  });

  context('skip()', () => {
    it('adds a $skip stage', () => {
      cursor.skip(2);
      expect(cursor.pipeline).to.have.deep.property('0', { $skip: 2 });
    });
  });

  context('redact()', () => {
    it('adds a $redact stage', () => {
      cursor.redact({ redact: true });
      expect(cursor.pipeline).to.have.deep.property('0', { $redact: { redact: true } });
    });
  });

  context('lookup()', () => {
    it('adds a $lookup stage', () => {
      cursor.redact({ lookup: true });
      expect(cursor.pipeline).to.have.deep.property('0', { $redact: { lookup: true } });
    });
  });

  context('project()', () => {
    it('adds a $project stage', () => {
      cursor.project({ project: true });
      expect(cursor.pipeline).to.have.deep.property('0', { $project: { project: true } });
    });
  });

  context('out()', () => {
    it('adds a $out stage', () => {
      cursor.out({ db: 'a', coll: 'b' });
      expect(cursor.pipeline).to.have.deep.property('0', { $out: { db: 'a', coll: 'b' } });
    });
  });

  context('match()', () => {
    it('adds a $match stage', () => {
      cursor.match({ match: true });
      expect(cursor.pipeline).to.have.deep.property('0', { $match: { match: true } });
    });
  });

  context('limit()', () => {
    it('adds a $limit stage', () => {
      cursor.limit(2);
      expect(cursor.pipeline).to.have.deep.property('0', { $limit: 2 });
    });
  });

  context('group()', () => {
    it('adds a $group stage', () => {
      cursor.group({ group: true });
      expect(cursor.pipeline).to.have.deep.property('0', { $group: { group: true } });
    });
  });

  context('addStage()', () => {
    it('adds an arbitrary stage', () => {
      cursor.addStage({ $iLoveJavascriptStage: { yes: true } });
      expect(cursor.pipeline).to.have.deep.property('0', { $iLoveJavascriptStage: { yes: true } });
    });
  });

  context('when addStage, bespoke stage methods, or array is used to construct pipeline', () => {
    it('sets deeply identical aggregations pipelines', () => {
      const collection = client.db().collection('test');

      const expectedPipeline = [
        { $project: { author: 1, tags: 1 } },
        { $unwind: '$tags' },
        { $group: { _id: { tags: '$tags' }, authors: { $addToSet: '$author' } } },
        { $sort: { _id: -1 } }
      ];

      const arrayPipelineCursor = collection.aggregate(Array.from(expectedPipeline));

      const builderPipelineCursor = collection
        .aggregate()
        .project({ author: 1, tags: 1 })
        .unwind('$tags')
        .group({ _id: { tags: '$tags' }, authors: { $addToSet: '$author' } })
        .sort({ _id: -1 });

      const builderGenericStageCursor = collection
        .aggregate()
        .addStage({ $project: { author: 1, tags: 1 } })
        .addStage({ $unwind: '$tags' })
        .addStage({ $group: { _id: { tags: '$tags' }, authors: { $addToSet: '$author' } } })
        .addStage({ $sort: { _id: -1 } });

      expect(arrayPipelineCursor.pipeline).to.deep.equal(expectedPipeline);
      expect(builderPipelineCursor.pipeline).to.deep.equal(expectedPipeline);
      expect(builderGenericStageCursor.pipeline).to.deep.equal(expectedPipeline);
    });
  });
});
