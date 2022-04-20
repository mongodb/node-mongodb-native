import { EJSON } from 'bson';
import { expect } from 'chai';
import { PathLike, readdirSync, readFileSync } from 'fs';
import { promisify } from 'util';

import { ReadPreference } from '../../../src/read_preference';
import { ServerType, STATE_CONNECTED, TopologyType } from '../../../src/sdam/common';
import { Server } from '../../../src/sdam/server';
import { Topology } from '../../../src/sdam/topology';
import { serverDescriptionFromDefinition } from './server_selection_spec_helper';

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

type Outcome = ServerSelectionLatencyWindowTest['outcome'];
type FrequencyMap = Outcome['expected_frequencies'];

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

function compareResultsToExpected(
  { tolerance, expected_frequencies }: Outcome,
  actual_frequencies: FrequencyMap
) {
  console.error(tolerance);
  console.error(expected_frequencies);
  console.error(actual_frequencies);
  for (const [address, frequency] of Object.entries(expected_frequencies)) {
    expect(actual_frequencies).to.haveOwnProperty(address).not.to.be.undefined;
    const actual_frequency = actual_frequencies[address];
    const is_too_low = actual_frequency < frequency - tolerance;
    const is_too_high = actual_frequency > frequency + tolerance;
    expect(is_too_high, 'failed - too high').to.be.false;
    expect(is_too_low, 'failed - too low').to.be.false;
  }

  const expected_hosts = new Set(Object.keys(expected_frequencies));
  const actual_hosts = new Set(Object.keys(actual_frequencies));

  expect(expected_hosts.size).to.equal(actual_hosts.size);
}

export async function runServerSelectionLatencyWindowTest(test: ServerSelectionLatencyWindowTest) {
  const allHosts = test.topology_description.servers.map(({ address }) => address);
  const topology = new Topology(allHosts, {
    serverSelectionTimeoutMS: 8000
  } as any);

  topology.s.description.type = test.topology_description.type;
  topology.s.state = STATE_CONNECTED;

  for (const [serverAddress, description] of topology.description.servers) {
    const { operation_count } = test.mocked_topology_state.find(
      ({ address }) => address === serverAddress
    );
    const { type, avg_rtt_ms } = test.topology_description.servers.find(
      ({ address }) => address === serverAddress
    );
    expect(operation_count).not.to.be.undefined;
    expect(type).not.to.be.undefined;
    expect(avg_rtt_ms).not.to.be.undefined;
    description.roundTripTime = avg_rtt_ms;
    description.type = type;
    // serverDescription.operationCount = operation_count;
    const serverDescription = serverDescriptionFromDefinition(description, allHosts);
    topology.serverUpdateHandler(serverDescription);
  }

  const results: Server[] = [];

  for (let i = 0; i < test.iterations; ++i) {
    const server: Server = await promisify(topology.selectServer.bind(topology))(
      ReadPreference.NEAREST,
      {}
    );
    results.push(server);
  }

  expect(results).to.have.lengthOf(test.iterations);

  let actualResults: FrequencyMap = {};
  for (const server of results) {
    const count = actualResults[server.description.address] ?? 0;
    actualResults[server.description.address] = count + 1;
  }

  actualResults = Object.fromEntries(
    Object.entries(actualResults).map(([address, count]) => [address, count / test.iterations])
  );

  compareResultsToExpected(test.outcome, actualResults);
}
