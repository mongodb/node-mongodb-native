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
      mapData: new Map<string, IndexDirection>([['sample_index', 1]])
    },
    {
      description: 'single [string, IndexDirection]',
      input: ['sample_index', -1],
      mapData: new Map<string, IndexDirection>([['sample_index', -1]])
    },
    {
      description: 'array of strings',
      input: ['sample_index1', 'sample_index2', 'sample_index3'],
      mapData: new Map<string, IndexDirection>([
        ['sample_index1', 1],
        ['sample_index2', 1],
        ['sample_index3', 1]
      ])
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
      ])
    },
    {
      description: 'single  { [key: string]: IndexDirection }',
      input: { sample_index: -1 },
      mapData: new Map<string, IndexDirection>([['sample_index', -1]])
    },
    {
      description: 'array of { [key: string]: IndexDirection }',
      input: [{ sample_index1: -1 }, { sample_index2: 1 }, { sample_index3: '2d' }],
      mapData: new Map<string, IndexDirection>([
        ['sample_index1', -1],
        ['sample_index2', 1],
        ['sample_index3', '2d']
      ])
    },
    {
      name: 'mixed array of [string, [string, IndexDirection], { [key: string]: IndexDirection }]',
      input: ['sample_index1', ['sample_index2', -1], { sample_index3: '2d' }],
      mapData: new Map<string, IndexDirection>([
        ['sample_index1', 1],
        ['sample_index2', -1],
        ['sample_index3', '2d']
      ])
    }
  ];

  const makeIndexOperation = (input, options: CreateIndexesOptions = {}) =>
    new CreateIndexOperation({ s: { namespace: ns('a.b') } }, 'b', input, options);

  for (const { description, input, mapData } of testCases) {
    it(`should create fieldHash correctly when input is: ${description}`, () => {
      const realOutput = makeIndexOperation(input);
      expect(realOutput.indexes[0].key).to.deep.equal(mapData);
    });

    it(`should set name to null if none provided with ${description} input `, () => {
      const realOutput = makeIndexOperation(input);
      expect(realOutput.indexes[0].name).to.equal(null);
    });
  }
});
