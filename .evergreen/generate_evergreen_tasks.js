const fs = require('fs');
const yaml = require('js-yaml');
const { mongoshTasks } = require('./generate_mongosh_tasks');

const {
  MONGODB_VERSIONS,
  versions,
  NODE_VERSIONS,
  LOWEST_LTS,
  LATEST_LTS,
  TOPOLOGIES,
  AWS_AUTH_VERSIONS,
  TLS_VERSIONS,
  DEFAULT_OS,
  WINDOWS_OS,
  MACOS_OS,
  UBUNTU_OS,
  DEBIAN_OS
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

// TODO: NODE-3060: enable skipped tests on windows
const WINDOWS_SKIP_TAGS = new Set(['atlas-connect', 'auth', 'load_balancer']);
const SKIPPED_WINDOWS_NODE_VERSIONS = new Set([12]);

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
      updateExpansions({
        VERSION: mongoVersion,
        TOPOLOGY: topology,
        AUTH: auth
      }),
      { func: 'install dependencies' },
      {
        func: 'bootstrap mongo-orchestration',

      },
      { func: 'bootstrap kms servers' },
      { func: 'run tests' }
    ]
  };
}

function generateVersionTopologyMatrix() {
  function* _generate() {
    for (const mongoVersion of MONGODB_VERSIONS) {
      for (const topology of TOPOLOGIES) {
        yield { mongoVersion, topology };
      }
    }
  }

  return Array.from(_generate());
}

const BASE_TASKS = generateVersionTopologyMatrix().map(makeTask);
const AUTH_DISABLED_TASKS = generateVersionTopologyMatrix().map(test =>
  makeTask({ ...test, auth: 'noauth', tags: ['noauth'] })
);

BASE_TASKS.push({
  name: `test-latest-server-v1-api`,
  tags: ['latest', 'server', 'v1-api'],
  commands: [
    updateExpansions({
      VERSION: 'latest',
      TOPOLOGY: 'server',
      REQUIRE_API_VERSION: '1',
      AUTH: 'auth',
      MONGODB_API_VERSION: '1'
    }),
    { func: 'install dependencies' },
    { func: 'bootstrap mongo-orchestration' },
    { func: 'bootstrap kms servers' },
    { func: 'run tests' }
  ]
});

// manually added tasks
TASKS.push(
  ...[
    {
      name: 'test-atlas-connectivity',
      tags: ['atlas-connect'],
      commands: [{ func: 'install dependencies' }, { func: 'run atlas tests' }]
    },
    {
      name: 'test-atlas-data-lake',
      commands: [
        { func: 'install dependencies' },
        { func: 'bootstrap mongohoused' },
        { func: 'run data lake tests' }
      ]
    },
    {
      name: 'test-5.0-load-balanced',
      tags: ['latest', 'sharded_cluster', 'load_balancer'],
      commands: [
        updateExpansions({
          VERSION: '5.0',
          TOPOLOGY: 'sharded_cluster',
          AUTH: 'auth',
          LOAD_BALANCER: 'true'
        }),
        { func: 'install dependencies' },
        { func: 'bootstrap mongo-orchestration' },
        { func: 'start-load-balancer' },
        { func: 'run-lb-tests' },
        { func: 'stop-load-balancer' }
      ]
    },
    {
      name: 'test-6.0-load-balanced',
      tags: ['latest', 'sharded_cluster', 'load_balancer'],
      commands: [
        updateExpansions({
          VERSION: '6.0',
          TOPOLOGY: 'sharded_cluster',
          AUTH: 'auth',
          LOAD_BALANCER: 'true'
        }),
        { func: 'install dependencies' },
        { func: 'bootstrap mongo-orchestration' },
        { func: 'start-load-balancer' },
        { func: 'run-lb-tests' },
        { func: 'stop-load-balancer' }
      ]
    },
    {
      name: 'test-latest-load-balanced',
      tags: ['latest', 'sharded_cluster', 'load_balancer'],
      commands: [
        updateExpansions({
          VERSION: 'latest',
          TOPOLOGY: 'sharded_cluster',
          AUTH: 'auth',
          LOAD_BALANCER: 'true'
        }),
        { func: 'install dependencies' },
        { func: 'bootstrap mongo-orchestration' },
        { func: 'start-load-balancer' },
        { func: 'run-lb-tests' },
        { func: 'stop-load-balancer' }
      ]
    },
    {
      name: 'test-auth-kerberos',
      tags: ['auth', 'kerberos'],
      commands: [{ func: 'install dependencies' }, { func: 'run kerberos tests' }]
    },
    {
      name: 'test-auth-ldap',
      tags: ['auth', 'ldap'],
      commands: [{ func: 'install dependencies' }, { func: 'run ldap tests' }]
    },
    {
      name: 'test-socks5',
      tags: [],
      commands: [
        updateExpansions({
          VERSION: 'latest',
          TOPOLOGY: 'replica_set'
        }),
        { func: 'install dependencies' },
        { func: 'bootstrap mongo-orchestration' },
        { func: 'bootstrap kms servers' },
        { func: 'run socks5 tests' }
      ]
    },
    {
      name: 'test-socks5-tls',
      tags: [],
      commands: [
        updateExpansions({
          SSL: 'ssl',
          VERSION: 'latest',
          TOPOLOGY: 'replica_set'
        }),
        { func: 'install dependencies' },
        { func: 'bootstrap mongo-orchestration' },
        { func: 'run socks5 tests' }
      ]
    }
  ]
);

for (const compressor of ['zstd', 'snappy']) {
  TASKS.push({
    name: `test-${compressor}-compression`,
    tags: ['latest', compressor],
    commands: [
      updateExpansions({
        VERSION: 'latest',
        TOPOLOGY: 'replica_set',
        AUTH: 'auth',
        COMPRESSOR: compressor
      }),
      { func: 'install dependencies' },
      { func: 'bootstrap mongo-orchestration' },
      { func: 'run-compression-tests' }
    ]
  });
}

const AWS_LAMBDA_HANDLER_TASKS = [];
// Add task for testing lambda example without aws auth.
AWS_LAMBDA_HANDLER_TASKS.push({
  name: 'test-lambda-example',
  tags: ['latest', 'lambda'],
  commands: [
    updateExpansions({
      VERSION: 'rapid',
      TOPOLOGY: 'server'
    }),
    { func: 'install dependencies' },
    { func: 'bootstrap mongo-orchestration' },
    { func: 'run lambda handler example tests' }
  ]
});

// Add task for testing lambda example with aws auth.
AWS_LAMBDA_HANDLER_TASKS.push({
  name: 'test-lambda-aws-auth-example',
  tags: ['latest', 'lambda'],
  commands: [
    updateExpansions({
      VERSION: 'rapid',
      AUTH: 'auth',
      ORCHESTRATION_FILE: 'auth-aws.json',
      TOPOLOGY: 'server'
    }),
    { func: 'install dependencies' },
    { func: 'bootstrap mongo-orchestration' },
    { func: 'add aws auth variables to file' },
    { func: 'setup aws env' },
    { func: 'run lambda handler example tests with aws auth' }
  ]
});

for (const VERSION of TLS_VERSIONS) {
  TASKS.push({
    name: `test-tls-support-${VERSION}`,
    tags: ['tls-support'],
    commands: [
      updateExpansions({
        VERSION,
        SSL: 'ssl',
        TOPOLOGY: 'server'
        // TODO: NODE-3891 - fix tests broken when AUTH enabled
        // AUTH: 'auth'
      }),
      { func: 'install dependencies' },
      { func: 'bootstrap mongo-orchestration' },
      { func: 'run tls tests' }
    ]
  });
}

const AWS_AUTH_TASKS = [];

for (const VERSION of AWS_AUTH_VERSIONS) {
  const name = ex => `aws-${VERSION}-auth-test-${ex.split(' ').join('-')}`;
  const awsFuncs = [
    { func: 'run aws auth test with regular aws credentials' },
    { func: 'run aws auth test with assume role credentials' },
    { func: 'run aws auth test with aws EC2 credentials' },
    { func: 'run aws auth test with aws credentials as environment variables' },
    { func: 'run aws auth test with aws credentials and session token as environment variables' },
    { func: 'run aws ECS auth test' },
    { func: 'run aws auth test AssumeRoleWithWebIdentity with AWS_ROLE_SESSION_NAME unset' },
    { func: 'run aws auth test AssumeRoleWithWebIdentity with AWS_ROLE_SESSION_NAME set' }
  ];

  const awsTasks = awsFuncs.map(fn => ({
    name: name(fn.func),
    commands: [
      updateExpansions({
        VERSION: VERSION,
        AUTH: 'auth',
        ORCHESTRATION_FILE: 'auth-aws.json',
        TOPOLOGY: 'server'
      }),
      { func: 'install dependencies' },
      { func: 'bootstrap mongo-orchestration' },
      { func: 'add aws auth variables to file' },
      { func: 'setup aws env' },
      { ...fn }
    ]
  }));

  const awsNoOptionalTasks = awsFuncs.map(fn => ({
    name: `${name(fn.func)}-no-optional`,
    commands: [
      updateExpansions({
        NPM_OPTIONS: '--no-optional',
        VERSION: VERSION,
        AUTH: 'auth',
        ORCHESTRATION_FILE: 'auth-aws.json',
        TOPOLOGY: 'server'
      }),
      { func: 'install dependencies' },
      { func: 'bootstrap mongo-orchestration' },
      { func: 'add aws auth variables to file' },
      { func: 'setup aws env' },
      { ...fn }
    ]
  }));

  const allAwsTasks = awsTasks.concat(awsNoOptionalTasks);

  TASKS.push(...allAwsTasks);
  AWS_AUTH_TASKS.push(...allAwsTasks.map(t => t.name));
}

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

  function npmVersion(nodeVersion) {
    switch (nodeVersion) {
      case 16:
      case 14: return 9;
      case 12: return 8;
      default: return 'latest';
    }
  }

  for (const NODE_LTS_VERSION of testedNodeVersions) {
    const nodeLTSCodeName = versions.find(({ versionNumber }) => versionNumber === NODE_LTS_VERSION).codeName;
    const nodeLtsDisplayName = `Node${NODE_LTS_VERSION}`;
    const name = `${osName}-${NODE_LTS_VERSION >= 20 ? nodeLtsDisplayName : nodeLTSCodeName}`;
    const display_name = `${osDisplayName} ${nodeLtsDisplayName}`;
    const expansions = { NODE_LTS_VERSION, NPM_VERSION: npmVersion(NODE_LTS_VERSION) };
    const taskNames = tasks.map(({ name }) => name);

    if (clientEncryption) {
      expansions.CLIENT_ENCRYPTION = true;
    }

    if (os.match(/^windows/) && SKIPPED_WINDOWS_NODE_VERSIONS.has(NODE_LTS_VERSION)) {
      continue;
    }

    BUILD_VARIANTS.push({ name, display_name, run_on, expansions, tasks: taskNames });
  }

  const configureLatestNodeSmokeTest = os.match(/^rhel/);
  if (configureLatestNodeSmokeTest) {
    const buildVariantData = {
      name: `${osName}-node-latest`,
      display_name: `${osDisplayName} Node Latest`,
      run_on,
      expansions: { NODE_LTS_VERSION: 'latest' },
      tasks: tasks.map(({ name }) => name)
    };
    if (clientEncryption) {
      buildVariantData.expansions.CLIENT_ENCRYPTION = true;
    }

    BUILD_VARIANTS.push(buildVariantData);
  }
}

BUILD_VARIANTS.push({
  name: MACOS_OS,
  display_name: `MacOS 11 Node${versions.find(version => version.versionNumber === LATEST_LTS).versionNumber
    }`,
  run_on: MACOS_OS,
  expansions: {
    NODE_LTS_VERSION: LATEST_LTS,
    CLIENT_ENCRYPTION: true
  },
  tasks: ['test-rapid-server']
});

// singleton build variant for linting
SINGLETON_TASKS.push(
  ...[
    {
      name: 'run-unit-tests',
      tags: ['run-unit-tests'],
      commands: [
        updateExpansions({
          NODE_LTS_VERSION: LOWEST_LTS,
          NPM_VERSION: 8
        }),
        { func: 'install dependencies' },
        { func: 'run unit tests' }
      ]
    },
    {
      name: 'run-lint-checks',
      tags: ['run-lint-checks'],
      commands: [
        updateExpansions({
          NODE_LTS_VERSION: LOWEST_LTS,
          NPM_VERSION: 8
        }),
        { func: 'install dependencies' },
        { func: 'run lint checks' }
      ]
    },
    ...Array.from(makeTypescriptTasks())
  ]
);

function* makeTypescriptTasks() {
  for (const TS_VERSION of ['next', 'current', '4.1.6']) {
    // 4.1.6 can consume the public API but not compile the driver
    if (TS_VERSION !== '4.1.6' && TS_VERSION !== 'next') {
      yield {
        name: `compile-driver-typescript-${TS_VERSION}`,
        tags: [`compile-driver-typescript-${TS_VERSION}`],
        commands: [
          updateExpansions({
            NODE_LTS_VERSION: LOWEST_LTS,
            NPM_VERSION: 8,
            TS_VERSION
          }),
          { func: 'install dependencies' },
          { func: 'compile driver' }
        ]
      };
    }

    yield {
      name: `check-types-typescript-${TS_VERSION}`,
      tags: [`check-types-typescript-${TS_VERSION}`],
      commands: [
        updateExpansions({
          NODE_LTS_VERSION: LATEST_LTS,
          TS_VERSION
        }),
        { func: 'install dependencies' },
        { func: 'check types' }
      ]
    };
  }
  return {
    name: 'run-typescript-next',
    tags: ['run-typescript-next'],
    commands: [
      updateExpansions({
        NODE_LTS_VERSION: LATEST_LTS
      }),
      { func: 'install dependencies' },
      { func: 'run typescript next' }
    ]
  };
}

BUILD_VARIANTS.push({
  name: 'lint',
  display_name: 'lint',
  run_on: DEFAULT_OS,
  tasks: [
    'run-unit-tests',
    'run-lint-checks',
    ...Array.from(makeTypescriptTasks()).map(({ name }) => name)
  ]
});

BUILD_VARIANTS.push({
  name: 'generate-combined-coverage',
  display_name: 'Generate Combined Coverage',
  run_on: DEFAULT_OS,
  tasks: ['download-and-merge-coverage']
});

BUILD_VARIANTS.push({
  name: 'mongosh_integration_tests',
  display_name: 'mongosh integration tests',
  run_on: UBUNTU_OS,
  tasks: mongoshTasks.map(({ name }) => name)
});

// special case for MONGODB-AWS authentication
BUILD_VARIANTS.push({
  name: 'ubuntu1804-test-mongodb-aws',
  display_name: 'MONGODB-AWS Auth test',
  run_on: UBUNTU_OS,
  expansions: {
    NODE_LTS_VERSION: LOWEST_LTS,
    NPM_VERSION: 8
  },
  tasks: AWS_AUTH_TASKS
});

const oneOffFuncs = [
  {
    name: 'run-custom-snappy-tests',
    func: 'run custom snappy tests'
  },
  {
    name: 'run-bson-ext-integration',
    func: 'run bson-ext test',
    expansions: {
      TEST_NPM_SCRIPT: 'check:test'
    }
  },
  {
    name: 'run-bson-ext-unit',
    func: 'run bson-ext test',
    expansions: {
      TEST_NPM_SCRIPT: 'check:unit'
    }
  }
];

const oneOffFuncAsTasks = oneOffFuncs.map(({ name, expansions, func }) => ({
  name,
  tags: ['run-custom-dependency-tests'],
  commands: [
    updateExpansions({
      ...expansions,
      NODE_LTS_VERSION: LOWEST_LTS,
      NPM_VERSION: 8,
      VERSION: '5.0',
      TOPOLOGY: 'server',
      AUTH: 'auth'
    }),
    { func: 'install dependencies' },
    { func: 'bootstrap mongo-orchestration' },
    { func }
  ]
}));

for (const version of ['5.0', 'rapid', 'latest']) {
  oneOffFuncAsTasks.push({
    name: `run-custom-csfle-tests-${version}-pinned-commit`,
    tags: ['run-custom-dependency-tests'],
    commands: [
      updateExpansions({
        NODE_LTS_VERSION: LOWEST_LTS,
        NPM_VERSION: 8,
        VERSION: version,
        TOPOLOGY: 'replica_set',
        CSFLE_GIT_REF: '5e922eb1302f1efbf4e8ddeb5f2ef113fd58ced0'

      }),
      { func: 'install dependencies' },
      { func: 'bootstrap mongo-orchestration' },
      { func: 'bootstrap kms servers' },
      { func: 'run custom csfle tests' }
    ]
  });
}

const coverageTask = {
  name: 'download and merge coverage'.split(' ').join('-'),
  tags: [],
  commands: [
    {
      func: 'download and merge coverage'
    }
  ],
  depends_on: [{ name: '*', variant: '*', status: '*', patch_optional: true }]
};

SINGLETON_TASKS.push(coverageTask);
SINGLETON_TASKS.push(...oneOffFuncAsTasks);

BUILD_VARIANTS.push({
  name: 'rhel8-custom-dependency-tests',
  display_name: 'Custom Dependency Version Test',
  run_on: DEFAULT_OS,
  tasks: oneOffFuncAsTasks.map(({ name }) => name)
});

// special case for serverless testing
BUILD_VARIANTS.push({
  name: 'rhel8-test-serverless',
  display_name: 'Serverless Test',
  run_on: DEFAULT_OS,
  expansions: {
    NODE_LTS_VERSION: LOWEST_LTS,
    NPM_VERSION: 8
  },
  tasks: ['serverless_task_group']
});

BUILD_VARIANTS.push({
  name: 'rhel8-no-auth-tests',
  display_name: 'No Auth Tests',
  run_on: DEFAULT_OS,
  expansions: {
    CLIENT_ENCRYPTION: true
  },
  tasks: AUTH_DISABLED_TASKS.map(({ name }) => name)
});

BUILD_VARIANTS.push({
  name: 'rhel8-test-lambda',
  display_name: 'AWS Lambda handler tests',
  run_on: DEFAULT_OS,
  tasks: ['test-lambda-example', 'test-lambda-aws-auth-example']
});

// TODO(NODE-4575): unskip zstd and snappy on node 16
for (const variant of BUILD_VARIANTS.filter(
  variant =>
    variant.expansions &&
    [16, 18, 'latest'].includes(variant.expansions.NODE_LTS_VERSION)
)) {
  variant.tasks = variant.tasks.filter(
    name => !['test-zstd-compression', 'test-snappy-compression'].includes(name)
  );
}

// TODO(NODE-4894): fix kerberos tests on Node18
for (const variant of BUILD_VARIANTS.filter(
  variant => variant.expansions && [18, 20, 'latest'].includes(variant.expansions.NODE_LTS_VERSION)
)) {
  variant.tasks = variant.tasks.filter(name => !['test-auth-kerberos'].includes(name));
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
  .concat(AUTH_DISABLED_TASKS)
  .concat(AWS_LAMBDA_HANDLER_TASKS)
  .concat(mongoshTasks);

fileData.buildvariants = (fileData.buildvariants || []).concat(BUILD_VARIANTS);

fs.writeFileSync(
  `${__dirname}/config.yml`,
  yaml.dump(fileData, { lineWidth: 120, noRefs: true, flowLevel: 7, condenseFlow: false }),
  'utf8'
);
