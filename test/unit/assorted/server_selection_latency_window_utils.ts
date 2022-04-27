import { EJSON } from 'bson';
import { expect } from 'chai';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
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

export function loadLatencyWindowTests(directory: string) {
  const files = readdirSync(directory).filter(fileName => fileName.endsWith('.json'));

  const tests: ServerSelectionLatencyWindowTest[] = [];

  for (const fileName of files) {
    const path = join(directory, fileName);
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
      expect(observed_frequencies).to.haveOwnProperty(address).to.exist;
      const actual_frequency = observed_frequencies[address];
      const is_too_low = actual_frequency < frequency - tolerance;
      expect(
        is_too_low,
        `expected frequency of ${frequency}+/-${tolerance} but received ${actual_frequency}`
      ).to.be.false;
      const is_too_high = actual_frequency > frequency + tolerance;
      expect(
        is_too_high,
        `expected frequency of ${frequency}+/-${tolerance} but received ${actual_frequency}`
      ).to.be.false;
    }
  }
}

function calculateObservedFrequencies(observedServers: ReadonlyArray<Server>): FrequencyMap {
  const actualResults: FrequencyMap = {};
  const iterations = observedServers.length;

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
    expect(operation_count).to.exist;
    expect(type).to.exist;
    expect(avg_rtt_ms).to.exist;
    description.roundTripTime = avg_rtt_ms;
    description.type = type;
    const serverDescription = serverDescriptionFromDefinition(description, allHosts);
    topology.serverUpdateHandler(serverDescription);
    const server = topology.s.servers.get(serverAddress);
    server.s.operationCount = operation_count;
  }

  const selectedServers: Server[] = [];

  for (let i = 0; i < test.iterations; ++i) {
    const server: Server = await promisify(topology.selectServer.bind(topology))(
      ReadPreference.NEAREST,
      {}
    );
    selectedServers.push(server);
  }

  const observedFrequencies = calculateObservedFrequencies(selectedServers);

  compareResultsToExpected(test.outcome, observedFrequencies);
}
