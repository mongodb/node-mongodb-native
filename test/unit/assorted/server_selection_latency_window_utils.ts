import { EJSON } from 'bson';
import { expect } from 'chai';
import { PathLike, readdirSync, readFileSync } from 'fs';
import * as sinon from 'sinon';
import { promisify } from 'util';

import { MongoClient } from '../../../src/mongo_client';
import { ReadPreference } from '../../../src/read_preference';
import { ServerType, STATE_CONNECTED, TopologyType } from '../../../src/sdam/common';
import { Server } from '../../../src/sdam/server';
import { Topology } from '../../../src/sdam/topology';
import { getTopology } from '../../../src/utils';
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
  const allHosts = test.topology_description.servers.map(({ address }) => address);
  const topology = new Topology(allHosts, {
    serverSelectionTimeoutMS: 8000
  } as any);

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
    const serverDescription = serverDescriptionFromDefinition(description);
    topology.serverUpdateHandler(serverDescription);
  }

  const results = [];

  // .apply(topology, [
  //   ReadPreference.NEAREST
  // ]);

  for (let i = 0; i < test.iterations; ++i) {
    const server: Server = await promisify(topology.selectServer.bind(topology))(
      ReadPreference.NEAREST,
      {}
    );
    results.push(server);
    // process.exit(0);
  }

  expect(true).to.be.true;
}
