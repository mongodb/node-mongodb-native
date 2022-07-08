import { expect } from 'chai';

import {
  CreateIndexesOptions,
  CreateIndexOperation,
  IndexDirection
} from '../../../src/operations/indexes';
import { ns } from '../../../src/utils';

describe('makeIndexSpec()', () => {
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
      input: { sample_index: -1 },
      mapData: new Map<string, IndexDirection>([['sample_index', -1]]),
      name: 'sample_index_-1'
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
      description: 'mixed array of [string, [string, IndexDirection], { [key: string]: IndexDirection }]',
      input: ['sample_index1', ['sample_index2', -1], { sample_index3: '2d' }],
      mapData: new Map<string, IndexDirection>([
        ['sample_index1', 1],
        ['sample_index2', -1],
        ['sample_index3', '2d']
      ]),
      name: 'sample_index1_1_sample_index2_-1_sample_index3_2d'
    }
  ];

  const makeIndexOperation = (input, options: CreateIndexesOptions = {}) =>
    new CreateIndexOperation({ s: { namespace: ns('a.b') } }, 'b', input, options);

  for (const { description, input, mapData, name } of testCases) {
    it(`should create fieldHash correctly when input is: ${description}`, () => {
      const realOutput = makeIndexOperation(input);
      expect(realOutput.indexes[0].key).to.deep.equal(mapData);
    });

    it(`should set name to null if none provided with ${description} input `, () => {
      const realOutput = makeIndexOperation(input);
      expect(realOutput.indexes[0].name).to.equal(name);
    });
  }

  it('should keep numerical keys in chronological ordering', () => {
    const desiredMapData = new Map<string, IndexDirection>([
      ['2', -1],
      ['1', 1]
    ]);
    const realOutput = makeIndexOperation(desiredMapData);
    const desiredName = '2_-1_1_1';
    expect(realOutput.indexes[0].key).to.deep.equal(desiredMapData);
    expect(realOutput.indexes[0].name).to.equal(desiredName);
  });
});
