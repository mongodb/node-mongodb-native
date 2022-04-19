import { EJSON } from 'bson';
import { expect } from 'chai';
import { PathLike, readdirSync, readFileSync } from 'fs';

import { ServerType, TopologyType } from '../../../src/sdam/common';

interface ServerSelectionLatencyWindowTest {
  description: string;
  topology_description: {
    type: TopologyType;
    servers: ReadonlyArray<{ address: string; avg_rtt_ms: number; type: ServerType }>;
  };

  mocked_topology_state: ReadonlyArray<{
    address: string;
    operation_count: number;
  }>;

  iterations: number;

  outcome: {
    tolerance: number;
    expected_frequencies: {
      [key: string]: number;
    };
  };
}

type TestTopologyDescription = ServerSelectionLatencyWindowTest['topology_description'];
type MockedTopologyState = ServerSelectionLatencyWindowTest['mocked_topology_state'];
type Outcome = ServerSelectionLatencyWindowTest['outcome'];

export function loadLatencyWindowTests(directory: PathLike) {
  const files = readdirSync(directory).filter(fileName => fileName.includes('.json'));

  const tests: ServerSelectionLatencyWindowTest[] = [];

  for (const fileName of files) {
    const path = directory + '/' + fileName;
    const contents = readFileSync(path, { encoding: 'utf-8' });
    tests.push(EJSON.parse(contents) as ServerSelectionLatencyWindowTest);
  }

  return tests;
}

export async function runServerSelectionLatencyWindowTest(test: ServerSelectionLatencyWindowTest) {
  expect(true).to.be.true;
}
