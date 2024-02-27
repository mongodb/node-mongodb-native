const fs = require('fs');
const yaml = require('js-yaml');
const semver = require('semver');

const {
  MONGODB_VERSIONS,
  versions,
  NODE_VERSIONS,
  LOWEST_LTS,
  LATEST_LTS,
  TOPOLOGIES,
  DEFAULT_OS,
  WINDOWS_OS
} = require('./ci_matrix_constants');

const OPERATING_SYSTEMS = [
  {
    name: DEFAULT_OS,
    display_name: 'rhel8',
    run_on: DEFAULT_OS
  },
  {
    name: WINDOWS_OS,
    display_name: 'Windows',
    run_on: WINDOWS_OS,
    clientEncryption: false // TODO(NODE-3401): Unskip when Windows no longer fails to launch mongocryptd occasionally
  }
].map(osConfig => ({
  nodeVersion: LOWEST_LTS,
  auth: 'auth',
  clientEncryption: true,
  ...osConfig
}));

// TODO: NODE-3060: enable skipped tests on windows except oidc (not supported)
const WINDOWS_SKIP_TAGS = new Set([
  'atlas-connect',
  'auth',
  'load_balancer',
  'socks5-csfle',
  'oidc'
]);

const TASKS = [];
const SINGLETON_TASKS = [];

/**
 * @param {Record<string, any>} expansions - keys become expansion names and values are stringified and become expansion value.
 * @returns {{command: 'expansions.update'; type: 'setup'; params: { updates: Array<{key: string, value: string}> } }}
 */
function updateExpansions(expansions) {
  const updates = Object.entries(expansions).map(([key, value]) => ({ key, value: `${value}` }));
  return {
    command: 'expansions.update',
    type: 'setup',
    params: { updates }
  };
}

function makeTask({ mongoVersion, topology, tags = [], auth = 'auth' }) {
  return {
    name: `test-${mongoVersion}-${topology}${auth === 'noauth' ? '-noauth' : ''}`,
    tags: [mongoVersion, topology, ...tags],
    commands: [
      updateExpansions({ NPM_VERSION: 9, VERSION: mongoVersion, TOPOLOGY: topology, AUTH: auth }),
      { func: 'install dependencies' },
      { func: 'bootstrap mongo-orchestration' },
      { func: 'bootstrap kms servers' },
      { func: 'run tests' }
    ]
  };
}

function generateVersionTopologyMatrix() {
  function* _generate() {
    for (const mongoVersion of MONGODB_VERSIONS) {
      for (const topology of TOPOLOGIES) {
        yield { mongoVersion, topology, tags: ['csfle'] };
      }
    }
  }

  return Array.from(_generate());
}

const BASE_TASKS = generateVersionTopologyMatrix().map(makeTask);

// manually added tasks
TASKS.push(
  ...[
    {
      name: 'test-socks5-csfle',
      tags: ['socks5-csfle', 'csfle'],
      commands: [
        updateExpansions({
          VERSION: 'latest',
          TOPOLOGY: 'replica_set',
          TEST_SOCKS5_CSFLE: 'true'
        }),
        { func: 'install dependencies' },
        { func: 'bootstrap mongo-orchestration' },
        { func: 'bootstrap kms servers' },
        { func: 'run socks5 tests' }
      ]
    }
  ]
);

const BUILD_VARIANTS = [];

for (const {
  name: osName,
  display_name: osDisplayName,
  run_on,
  nodeVersions = NODE_VERSIONS,
  clientEncryption
} of OPERATING_SYSTEMS) {
  const testedNodeVersions = NODE_VERSIONS.filter(version => nodeVersions.includes(version));
  const os = osName.split('-')[0];
  const tasks = BASE_TASKS.concat(TASKS).filter(task => {
    const isAWSTask = task.name.match(/^aws/);
    const isSkippedTaskOnWindows =
      task.tags &&
      os.match(/^windows/) &&
      task.tags.filter(tag => WINDOWS_SKIP_TAGS.has(tag)).length;

    return !isAWSTask && !isSkippedTaskOnWindows;
  });

  for (const NODE_LTS_VERSION of testedNodeVersions) {
    const nodeLTSCodeName = versions.find(
      ({ versionNumber }) => versionNumber === NODE_LTS_VERSION
    ).codeName;
    const nodeLtsDisplayName = `Node${NODE_LTS_VERSION}`;
    const name = `${osName}-${NODE_LTS_VERSION >= 20 ? nodeLtsDisplayName : nodeLTSCodeName}`;
    const display_name = `${osDisplayName} ${nodeLtsDisplayName}`;
    const expansions = { NODE_LTS_VERSION, NPM_VERSION: NODE_LTS_VERSION === 16 ? 9 : 'latest' };
    const taskNames = tasks.map(({ name }) => name);

    if (clientEncryption) {
      expansions.CLIENT_ENCRYPTION = true;
    }

    BUILD_VARIANTS.push({
      name,
      display_name,
      run_on,
      expansions,
      tasks: taskNames,
      tags: ['csfle']
    });
  }

  const configureLatestNodeSmokeTest = os.match(/^rhel/);
  if (configureLatestNodeSmokeTest) {
    const buildVariantData = {
      name: `${osName}-node-latest`,
      display_name: `${osDisplayName} Node Latest`,
      run_on,
      expansions: { NODE_LTS_VERSION: LATEST_LTS },
      tasks: tasks.map(({ name }) => name)
    };
    if (clientEncryption) {
      buildVariantData.expansions.CLIENT_ENCRYPTION = true;
    }

    BUILD_VARIANTS.push(buildVariantData);
  }
}

// Running CSFLE tests with mongocryptd
const MONGOCRYPTD_CSFLE_TASKS = MONGODB_VERSIONS.filter(
  mongoVersion =>
    ['latest', 'rapid'].includes(mongoVersion) || semver.gte(`${mongoVersion}.0`, '4.2.0')
).map(mongoVersion => {
  return {
    name: `test-${mongoVersion}-csfle-mongocryptd`,
    tags: [mongoVersion, 'sharded_cluster', 'csfle'],
    commands: [
      updateExpansions({
        VERSION: mongoVersion,
        TOPOLOGY: 'sharded_cluster',
        AUTH: 'auth',
        TEST_NPM_SCRIPT: 'check:csfle'
      }),
      { func: 'install dependencies' },
      { func: 'bootstrap mongo-orchestration' },
      { func: 'bootstrap kms servers' },
      { func: 'run tests' }
    ]
  };
});

for (const nodeVersion of [LOWEST_LTS, LATEST_LTS]) {
  const name = `rhel8-node${nodeVersion}-test-csfle-mongocryptd`;
  const displayName = `rhel 8 Node${nodeVersion} test mongocryptd`;
  BUILD_VARIANTS.push({
    name,
    display_name: displayName,
    run_on: DEFAULT_OS,
    expansions: {
      CLIENT_ENCRYPTION: true,
      RUN_WITH_MONGOCRYPTD: true,
      NODE_LTS_VERSION: LOWEST_LTS,
      NPM_VERSION: 9
    },
    tasks: MONGOCRYPTD_CSFLE_TASKS.map(task => task.name)
  });
}

// singleton build variant for linting
SINGLETON_TASKS.push(
  ...[
    {
      name: 'run-unit-tests',
      tags: ['run-unit-tests'],
      commands: [
        updateExpansions({
          NODE_LTS_VERSION: LOWEST_LTS,
          NPM_VERSION: 9
        }),
        { func: 'install dependencies' },
        { func: 'run unit tests' }
      ]
    }
  ]
);

BUILD_VARIANTS.push({
  name: 'lint',
  display_name: 'lint',
  run_on: DEFAULT_OS,
  tasks: ['run-unit-tests']
});

const oneOffFuncAsTasks = [];

const FLE_PINNED_COMMIT = '974a4614f8c1c3786e5e39fa63568d83f4f69ebd';

for (const version of ['5.0', 'rapid', 'latest']) {
  for (const ref of [FLE_PINNED_COMMIT, 'master']) {
    oneOffFuncAsTasks.push({
      name: `run-custom-csfle-tests-${version}-${ref === 'master' ? ref : 'pinned-commit'}`,
      tags: ['run-custom-dependency-tests', 'csfle'],
      commands: [
        updateExpansions({
          NODE_LTS_VERSION: LOWEST_LTS,
          NPM_VERSION: 9,
          VERSION: version,
          TOPOLOGY: 'replica_set',
          CSFLE_GIT_REF: ref
        }),
        { func: 'install dependencies' },
        { func: 'bootstrap mongo-orchestration' },
        { func: 'bootstrap kms servers' },
        { func: 'run custom csfle tests' }
      ]
    });
  }
}

SINGLETON_TASKS.push(...oneOffFuncAsTasks);

BUILD_VARIANTS.push({
  name: 'rhel8-custom-dependency-tests',
  display_name: 'Custom Dependency Version Test',
  run_on: DEFAULT_OS,
  tags: ['csfle'],
  tasks: oneOffFuncAsTasks.map(({ name }) => name)
});

// special case for serverless testing
BUILD_VARIANTS.push({
  name: 'rhel8-test-serverless',
  display_name: 'Serverless Test',
  run_on: DEFAULT_OS,
  tags: ['csfle'],
  expansions: {
    NODE_LTS_VERSION: LOWEST_LTS
  },
  tasks: ['serverless_task_group']
});

// TODO(NODE-4575): unskip zstd and snappy on node 16
for (const variant of BUILD_VARIANTS.filter(
  variant => variant.expansions && [16, 18, 20].includes(variant.expansions.NODE_LTS_VERSION)
)) {
  variant.tasks = variant.tasks.filter(
    name => !['test-zstd-compression', 'test-snappy-compression'].includes(name)
  );
}

// TODO(NODE-4897): Debug socks5 tests on node latest
for (const variant of BUILD_VARIANTS.filter(
  variant => variant.expansions && ['latest'].includes(variant.expansions.NODE_LTS_VERSION)
)) {
  variant.tasks = variant.tasks.filter(name => !['test-socks5'].includes(name));
}

const fileData = yaml.load(fs.readFileSync(`${__dirname}/config.in.yml`, 'utf8'));
fileData.tasks = (fileData.tasks || [])
  .concat(BASE_TASKS)
  .concat(TASKS)
  .concat(SINGLETON_TASKS)
  .concat(MONGOCRYPTD_CSFLE_TASKS);

fileData.buildvariants = (fileData.buildvariants || []).concat(BUILD_VARIANTS);

fs.writeFileSync(
  `${__dirname}/config.yml`,
  yaml.dump(fileData, { lineWidth: 120, noRefs: true, flowLevel: 7, condenseFlow: false }),
  'utf8'
);
