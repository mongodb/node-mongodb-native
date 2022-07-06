import { expect } from 'chai';

import { IndexDirection, makeIndexSpec } from '../../../src/operations/indexes';

describe('makeIndexSpec()', () => {
  const testCases = [
    {
      description: 'single string',
      input: 'sample_index',
      mapData: [['sample_index', 1]]
    },
    {
      description: 'single [string, IndexDirection]',
      input: ['sample_index', -1],
      mapData: [['sample_index', -1]]
    },
    {
      description: 'array of strings',
      input: ['sample_index1', 'sample_index2', 'sample_index3'],
      mapData: [
        ['sample_index1', 1],
        ['sample_index2', 1],
        ['sample_index3', 1]
      ]
    },
    {
      description: 'array of [string, IndexDirection]',
      input: [
        ['sample_index1', -1],
        ['sample_index2', 1],
        ['sample_index3', '2d']
      ],
      mapData: [
        ['sample_index1', -1],
        ['sample_index2', 1],
        ['sample_index3', '2d']
      ]
    },
    {
      description: 'single  { [key: string]: IndexDirection }',
      input: { sample_index: -1 },
      mapData: [['sample_index', -1]]
    },
    {
      description: 'array of { [key: string]: IndexDirection }',
      input: [{ sample_index1: -1 }, { sample_index2: 1 }, { sample_index3: '2d' }],
      mapData: [
        ['sample_index1', -1],
        ['sample_index2', 1],
        ['sample_index3', '2d']
      ]
    },
    {
      name: 'mixed array of [string, [string, IndexDirection], { [key: string]: IndexDirection }]',
      input: ['sample_index1', ['sample_index2', -1], { sample_index3: '2d' }],
      mapData: [
        ['sample_index1', 1],
        ['sample_index2', -1],
        ['sample_index3', '2d']
      ]
    }
  ];

  for (const { description, input, mapData } of testCases) {
    it(`should parse index options correctly when input is: ${description}`, () => {
      const desiredOutput: Map<string, IndexDirection> = new Map(mapData);
      const realOutput = makeIndexSpec(input, {});
      expect(realOutput.key).to.eql(desiredOutput);
    });
  }
});
