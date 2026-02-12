import { type Document, EJSON } from 'bson';
import { expect } from 'chai';
import { readdirSync, readFileSync, statSync } from 'fs';
import { basename, extname, join } from 'path';

import {
  DeprioritizedServers,
  ReadPreference,
  type ReadPreferenceMode,
  type ReadPreferenceOptions,
  readPreferenceServerSelector,
  type ServerDescription,
  type ServerSelector,
  type ServerType,
  type TagSet,
  TopologyDescription,
  type TopologyType,
  writableServerSelector
} from '../../mongodb';
import { serverDescriptionFromDefinition } from './server_selection_spec_helper';

interface ServerSelectionLogicTestServer {
  address: string;
  avg_rtt_ms: number;
  type: ServerType;
  tags?: TagSet;
}
interface ServerSelectionLogicTest {
  topology_description: {
    type: TopologyType;
    servers: ServerSelectionLogicTestServer[];
  };
  operation: 'read' | 'write';
  read_preference: {
    mode: ReadPreferenceMode;
    tag_sets?: TagSet[];
  };
  /**
   * The spec says we should confirm the list of suitable servers in addition to the list of
   * servers in the latency window, if possible.  We apply the latency window inside the
   * selector so for Node this is not possible.
   * https://github.com/mongodb/specifications/tree/master/source/server-selection/tests#server-selection-logic-tests
   */
  suitable_servers: never;
  in_latency_window: ServerSelectionLogicTestServer[];
  deprioritized_servers?: ServerSelectionLogicTestServer[];
}

function readPreferenceFromDefinition(definition) {
  const mode = definition.mode
    ? definition.mode.charAt(0).toLowerCase() + definition.mode.slice(1)
    : 'primary';

  const options: ReadPreferenceOptions = {};
  if (typeof definition.maxStalenessSeconds !== 'undefined')
    options.maxStalenessSeconds = definition.maxStalenessSeconds;
  const tags = definition.tag_sets ?? [];

  return new ReadPreference(mode, tags, options);
}

/**
 * Compares two server descriptions and compares all fields that are present
 * in the yaml spec tests.
 */
function compareServerDescriptions(s1: ServerDescription, s2: ServerDescription) {
  expect(s1.address).to.equal(s2.address);
  expect(s1.roundTripTime).to.equal(s2.roundTripTime);
  expect(s1.type).to.equal(s2.type);
  expect(s1.tags).to.deep.equal(s2.tags);
}

function serverDescriptionsToMap(
  descriptions: ServerDescription[]
): Map<string, ServerDescription> {
  const descriptionMap = new Map<string, ServerDescription>();

  for (const description of descriptions) {
    descriptionMap.set(description.address, description);
  }

  return descriptionMap;
}

/**
 * Executes a server selection logic test
 * @see https://github.com/mongodb/specifications/tree/master/source/server-selection/tests#server-selection-logic-tests
 */
export function runServerSelectionLogicTest(testDefinition: ServerSelectionLogicTest) {
  const allHosts = testDefinition.topology_description.servers.map(({ address }) => address);
  const serversInTopology = testDefinition.topology_description.servers.map(s =>
    serverDescriptionFromDefinition(s, allHosts)
  );
  const serverDescriptions = serverDescriptionsToMap(serversInTopology);
  const topologyDescription = new TopologyDescription(
    testDefinition.topology_description.type,
    serverDescriptions
  );
  const expectedServers = serverDescriptionsToMap(
    testDefinition.in_latency_window.map(s => serverDescriptionFromDefinition(s))
  );
  const deprioritized = new DeprioritizedServers(
    testDefinition.deprioritized_servers?.map(s => serverDescriptionFromDefinition(s, allHosts))
  );

  let selector: ServerSelector;
  if (testDefinition.operation === 'write') {
    selector = writableServerSelector();
  } else if (testDefinition.operation === 'read' || testDefinition.read_preference) {
    const readPreference = readPreferenceFromDefinition(testDefinition.read_preference);
    selector = readPreferenceServerSelector(readPreference);
  } else {
    expect.fail('test operation was neither read nor write, and no read preference was provided.');
  }

  const result = selector(topologyDescription, serversInTopology, deprioritized);

  expect(result.length).to.equal(expectedServers.size);

  // console.error({ result, expectedServers });
  for (const server of result) {
    const expectedServer = expectedServers.get(server.address);
    expect(expectedServer).to.exist;
    compareServerDescriptions(server, expectedServer);
    expectedServers.delete(server.address);
  }

  expect(expectedServers.size).to.equal(0);
}

/**
 * reads in the server selection logic tests from the provided directory
 */
export function collectServerSelectionLogicTests(specDir) {
  const testTypes = readdirSync(specDir).filter(d => statSync(join(specDir, d)).isDirectory());

  const tests = {};
  for (const testType of testTypes) {
    const testsOfType = readdirSync(join(specDir, testType)).filter(d =>
      statSync(join(specDir, testType, d)).isDirectory()
    );
    const result = {};
    for (const subType of testsOfType) {
      result[subType] = readdirSync(join(specDir, testType, subType))
        .filter(f => extname(f) === '.json')
        .map(f => {
          const fileContents = readFileSync(join(specDir, testType, subType, f), {
            encoding: 'utf-8'
          });
          const test = EJSON.parse(fileContents, { relaxed: true }) as unknown as Document;
          test.name = basename(f, '.json');
          test.type = testType;
          test.subType = subType;
          return test;
        });
    }

    tests[testType] = result;
  }

  return tests;
}
