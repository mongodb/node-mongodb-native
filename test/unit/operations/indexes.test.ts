import { expect } from 'chai';

import {
  CreateIndexesOperation,
  type CreateIndexesOptions,
  type IndexDirection
} from '../../../src/operations/indexes';
import { ns } from '../../../src/utils';

describe('class CreateIndexesOperation', () => {
  const testCases = [
    {
      description: 'single string',
      input: 'sample_index',
      mapData: new Map<string, IndexDirection>([['sample_index', 1]]),
      name: 'sample_index_1'
    },
    {
      description: 'single [string, IndexDirection]',
      input: ['sample_index', -1],
      mapData: new Map<string, IndexDirection>([['sample_index', -1]]),
      name: 'sample_index_-1'
    },
    {
      description: 'array of strings',
      input: ['sample_index1', 'sample_index2', 'sample_index3'],
      mapData: new Map<string, IndexDirection>([
        ['sample_index1', 1],
        ['sample_index2', 1],
        ['sample_index3', 1]
      ]),
      name: 'sample_index1_1_sample_index2_1_sample_index3_1'
    },
    {
      description: 'array of [string, IndexDirection]',
      input: [
        ['sample_index1', -1],
        ['sample_index2', 1],
        ['sample_index3', '2d']
      ],
      mapData: new Map<string, IndexDirection>([
        ['sample_index1', -1],
        ['sample_index2', 1],
        ['sample_index3', '2d']
      ]),
      name: 'sample_index1_-1_sample_index2_1_sample_index3_2d'
    },
    {
      description: 'single  { [key: string]: IndexDirection }',
      input: { x: 1 },
      mapData: new Map<string, IndexDirection>([['x', 1]]),
      name: 'x_1'
    },
    {
      description: 'array of { [key: string]: IndexDirection }',
      input: [{ sample_index1: -1 }, { sample_index2: 1 }, { sample_index3: '2d' }],
      mapData: new Map<string, IndexDirection>([
        ['sample_index1', -1],
        ['sample_index2', 1],
        ['sample_index3', '2d']
      ]),
      name: 'sample_index1_-1_sample_index2_1_sample_index3_2d'
    },
    {
      description:
        'mixed array of [string, [string, IndexDirection], { [key: string]: IndexDirection }, Map<string, IndexDirection>]',
      input: [
        'sample_index1',
        ['sample_index2', -1],
        { sample_index3: '2d' },
        new Map<string, IndexDirection>([['sample_index4', '2dsphere']])
      ],
      mapData: new Map<string, IndexDirection>([
        ['sample_index1', 1],
        ['sample_index2', -1],
        ['sample_index3', '2d'],
        ['sample_index4', '2dsphere']
      ]),
      name: 'sample_index1_1_sample_index2_-1_sample_index3_2d_sample_index4_2dsphere'
    },
    {
      description: 'array of Map<string, IndexDirection>',
      input: [
        new Map<string, IndexDirection>([['sample_index1', 1]]),
        new Map<string, IndexDirection>([['sample_index2', -1]]),
        new Map<string, IndexDirection>([['sample_index3', '2d']])
      ],
      mapData: new Map<string, IndexDirection>([
        ['sample_index1', 1],
        ['sample_index2', -1],
        ['sample_index3', '2d']
      ]),
      name: 'sample_index1_1_sample_index2_-1_sample_index3_2d'
    },
    {
      description: 'single  Map<string, IndexDirection>',
      input: new Map<string, IndexDirection>([['sample_index', -1]]),
      mapData: new Map<string, IndexDirection>([['sample_index', -1]]),
      name: 'sample_index_-1'
    }
  ];

  const makeIndexOperation = (input, options: CreateIndexesOptions = {}) =>
    CreateIndexesOperation.fromIndexSpecification(
      { s: { namespace: ns('a.b') } },
      'b',
      input,
      options
    );

  describe('#constructor()', () => {
    for (const { description, input, mapData, name } of testCases) {
      it(`should create fieldHash correctly when input is: ${description}`, () => {
        const realOutput = makeIndexOperation(input);
        expect(realOutput.indexes[0].key).to.deep.equal(mapData);
      });

      it(`should set name correctly if none provided with ${description} input `, () => {
        const realOutput = makeIndexOperation(input);
        expect(realOutput.indexes[0].name).to.equal(name);
      });
    }

    it('should not generate a name if one is provided', () => {
      const realOutput = makeIndexOperation({ a: 1, b: 1 }, { name: 'MyIndex' });
      expect(realOutput.indexes).to.be.an('array');
      expect(realOutput.indexes).to.have.nested.property('[0].name', 'MyIndex');
    });

    it('should keep numerical keys in chronological ordering when using Map input type', () => {
      const desiredMapData = new Map<string, IndexDirection>([
        ['2', -1],
        ['1', 1]
      ]);
      const realOutput = makeIndexOperation(desiredMapData);
      const desiredName = '2_-1_1_1';
      expect(realOutput.indexes[0].key).to.deep.equal(desiredMapData);
      expect(realOutput.indexes[0].name).to.equal(desiredName);
    });

    it('should omit options that are not in the permitted list', () => {
      const indexOutput = makeIndexOperation(
        { a: 1 },
        // @ts-expect-error: Testing bad options get filtered
        { randomOptionThatWillNeverBeAdded: true, storageEngine: { iLoveJavascript: 1 } }
      );
      expect(indexOutput.indexes).to.have.lengthOf(1);
      expect(indexOutput.indexes[0]).to.have.property('key').that.is.instanceOf(Map);
      expect(indexOutput.indexes[0]).to.have.property('name', 'a_1');
      expect(indexOutput.indexes[0])
        .to.have.property('storageEngine')
        .that.deep.equals({ iLoveJavascript: 1 });
      expect(indexOutput.indexes[0]).to.not.have.property('randomOptionThatWillNeverBeAdded');
    });
  });
});
