import { EJSON } from 'bson';
import { expect } from 'chai';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

import { ReadPreference } from '../../../src/read_preference';
import { type ServerType, STATE_CONNECTED, type TopologyType } from '../../../src/sdam/common';
import { type Server } from '../../../src/sdam/server';
import { type Topology } from '../../../src/sdam/topology';
import { topologyWithPlaceholderClient } from '../../tools/utils';
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
  observedFrequencies: FrequencyMap
) {
  expect(
    Object.entries(expected_frequencies),
    'Encountered an empty set of frequencies to assert on.  Is there something wrong with the test or the runner?'
  ).to.have.length.greaterThan(0);
  for (const [address, frequency] of Object.entries(expected_frequencies)) {
    if (frequency === 0) {
      expect(observedFrequencies).not.to.haveOwnProperty(address);
    } else {
      expect(observedFrequencies).to.haveOwnProperty(address).that.is.a('number');
      const actualFrequency = observedFrequencies[address];
      const isTooLow = actualFrequency < frequency - tolerance;
      const isTooHigh = actualFrequency > frequency + tolerance;

      if (isTooHigh || isTooLow) {
        expect.fail(
          `expected frequency of ${frequency}+/-${tolerance} but received ${actualFrequency}`
        );
      }
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

function setupTest(test: ServerSelectionLatencyWindowTest): Topology {
  const allHosts = test.topology_description.servers.map(({ address }) => address);
  const topology = topologyWithPlaceholderClient(allHosts, {} as any);

  topology.s.description.type = test.topology_description.type;
  topology.s.state = STATE_CONNECTED;

  for (const [serverAddress, description] of topology.description.servers) {
    const { operation_count } = test.mocked_topology_state.find(
      ({ address }) => address === serverAddress
    );
    const { type, avg_rtt_ms } = test.topology_description.servers.find(
      ({ address }) => address === serverAddress
    );
    expect(
      operation_count,
      'Encountered server without an operation count.  Is there something wrong with the test format or the runner?'
    ).to.exist;
    expect(
      type,
      'Encountered server without a server type.  Is there something wrong with the test format or the runner?'
    ).to.exist;
    expect(
      avg_rtt_ms,
      'Encountered server without an avg_rtt_ms.  Is there something wrong with the test format or the runner?'
    ).to.exist;
    description.roundTripTime = avg_rtt_ms;
    description.type = type;
    const serverDescription = serverDescriptionFromDefinition(description, allHosts);
    topology.serverUpdateHandler(serverDescription);
    const server = topology.s.servers.get(serverAddress);
    server.s.operationCount = operation_count;
  }

  return topology;
}

export async function runServerSelectionLatencyWindowTest(test: ServerSelectionLatencyWindowTest) {
  const topology = setupTest(test);

  const selectedServers: Server[] = [];

  for (let i = 0; i < test.iterations; ++i) {
    const server: Server = await topology.selectServer(ReadPreference.NEAREST, {
      deprioritizedServers: [],
      operationName: 'test operation'
    });
    selectedServers.push(server);
  }

  const observedFrequencies = calculateObservedFrequencies(selectedServers);

  compareResultsToExpected(test.outcome, observedFrequencies);

  await topology.close();
}
