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
  observed_frequencies: FrequencyMap
) {
  for (const [address, frequency] of Object.entries(expected_frequencies)) {
    if (frequency === 0) {
      expect(observed_frequencies).not.to.haveOwnProperty(address);
    } else {
      expect(observed_frequencies).to.haveOwnProperty(address).not.to.be.undefined;
      const actual_frequency = observed_frequencies[address];
      const is_too_low = actual_frequency < frequency - tolerance;
      expect(is_too_low, 'failed - too low').to.be.false;
      const is_too_high = actual_frequency > frequency + tolerance;
      expect(is_too_high, 'failed - too high').to.be.false;
    }
  }
}

function calculateObservedFrequencies(
  observedServers: ReadonlyArray<Server>,
  iterations: number
): FrequencyMap {
  const actualResults: FrequencyMap = {};

  for (const server of observedServers) {
    const count = actualResults[server.description.address] ?? 0;
    actualResults[server.description.address] = count + 1;
  }

  for (const [address, count] of Object.entries(actualResults)) {
    actualResults[address] = count / iterations;
  }

  return actualResults;
}

export async function runServerSelectionLatencyWindowTest(test: ServerSelectionLatencyWindowTest) {
  const allHosts = test.topology_description.servers.map(({ address }) => address);
  const topology = new Topology(allHosts, {} as any);

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
    const serverDescription = serverDescriptionFromDefinition(description, allHosts);
    serverDescription.operationCount = operation_count;
    topology.serverUpdateHandler(serverDescription);
  }

  const selectedServers: Server[] = [];

  for (let i = 0; i < test.iterations; ++i) {
    const server: Server = await promisify(topology.selectServer.bind(topology))(
      ReadPreference.NEAREST,
      {}
    );
    selectedServers.push(server);
  }

  expect(selectedServers).to.have.lengthOf(test.iterations);

  const observedFrequencies = calculateObservedFrequencies(selectedServers, test.iterations);

  compareResultsToExpected(test.outcome, observedFrequencies);
}
