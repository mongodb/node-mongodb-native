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
  DEFAULT_OS
} = require('./ci_matrix_constants');

const OPERATING_SYSTEMS = [
  {
    name: 'rhel80-large',
    display_name: 'rhel8',
    run_on: DEFAULT_OS
  },
  {
    name: 'windows-64-vs2019',
    display_name: 'Windows (VS2019)',
    run_on: 'windows-64-vs2019-large',
    clientEncryption: false // TODO(NODE-3401): Unskip when Windows no longer fails to launch mongocryptd occasionally
  }
].map(osConfig => ({
  nodeVersion: LOWEST_LTS,
  auth: 'auth',
  clientEncryption: true,
  ...osConfig
}));

// TODO: NODE-3060: enable skipped tests on windows except oidc (not supported)
const WINDOWS_SKIP_TAGS = new Set(['atlas-connect', 'auth', 'load_balancer', 'socks5-csfle', 'oidc']);

const TASKS = [];
const SINGLETON_TASKS = [];

function makeTask({ mongoVersion, topology, tags = [], auth = 'auth' }) {
  return {
    name: `test-${mongoVersion}-${topology}${auth === 'noauth' ? '-noauth' : ''}`,
    tags: [mongoVersion, topology, ...tags],
    commands: [
      { func: 'install dependencies' },
      {
        func: 'bootstrap mongo-orchestration',
        vars: {
          VERSION: mongoVersion,
          TOPOLOGY: topology,
          AUTH: auth
        }
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
    { func: 'install dependencies' },
    {
      func: 'bootstrap mongo-orchestration',
      vars: {
        VERSION: 'latest',
        TOPOLOGY: 'server',
        REQUIRE_API_VERSION: '1',
        AUTH: 'auth'
      }
    },
    { func: 'bootstrap kms servers' },
    {
      func: 'run tests',
      vars: {
        MONGODB_API_VERSION: '1'
      }
    }
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
        { func: 'install dependencies' },
        {
          func: 'bootstrap mongo-orchestration',
          vars: {
            VERSION: '5.0',
            TOPOLOGY: 'sharded_cluster',
            AUTH: 'auth',
            LOAD_BALANCER: 'true'
          }
        },
        { func: 'start-load-balancer' },
        { func: 'run-lb-tests' },
        { func: 'stop-load-balancer' }
      ]
    },
    {
      name: 'test-6.0-load-balanced',
      tags: ['latest', 'sharded_cluster', 'load_balancer'],
      commands: [
        { func: 'install dependencies' },
        {
          func: 'bootstrap mongo-orchestration',
          vars: {
            VERSION: '6.0',
            TOPOLOGY: 'sharded_cluster',
            AUTH: 'auth',
            LOAD_BALANCER: 'true'
          }
        },
        { func: 'start-load-balancer' },
        { func: 'run-lb-tests' },
        { func: 'stop-load-balancer' }
      ]
    },
    {
      name: 'test-latest-load-balanced',
      tags: ['latest', 'sharded_cluster', 'load_balancer'],
      commands: [
        { func: 'install dependencies' },
        {
          func: 'bootstrap mongo-orchestration',
          vars: {
            VERSION: 'latest',
            TOPOLOGY: 'sharded_cluster',
            AUTH: 'auth',
            LOAD_BALANCER: 'true'
          }
        },
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
      name: 'test-auth-oidc',
      tags: ['latest', 'replica_set', 'oidc'],
      commands: [
        { func: 'install dependencies' },
        { func: 'bootstrap oidc' },
        {
          func: 'bootstrap mongo-orchestration',
          vars: {
            VERSION: 'latest',
            TOPOLOGY: 'replica_set',
            AUTH: 'auth',
            ORCHESTRATION_FILE: 'auth-oidc.json'
          }
        },
        { func: 'setup oidc roles' },
        { func: 'run oidc tests aws' }
      ]
    },
    {
      name: 'test-socks5',
      tags: [],
      commands: [
        { func: 'install dependencies' },
        {
          func: 'bootstrap mongo-orchestration',
          vars: {
            VERSION: 'latest',
            TOPOLOGY: 'replica_set'
          }
        },
        { func: 'bootstrap kms servers' },
        { func: 'run socks5 tests' }
      ]
    },
    {
      name: 'test-socks5-csfle',
      tags: ['socks5-csfle'],
      commands: [
        { func: 'install dependencies' },
        {
          func: 'bootstrap mongo-orchestration',
          vars: {
            VERSION: 'latest',
            TOPOLOGY: 'replica_set'
          }
        },
        { func: 'bootstrap kms servers' },
        {
          func: 'run socks5 tests',
          vars: {
            TEST_SOCKS5_CSFLE: 'true'
          }
        }
      ]
    },
    {
      name: 'test-socks5-tls',
      tags: [],
      commands: [
        { func: 'install dependencies' },
        {
          func: 'bootstrap mongo-orchestration',
          vars: {
            SSL: 'ssl',
            VERSION: 'latest',
            TOPOLOGY: 'replica_set'
          }
        },
        { func: 'run socks5 tests', vars: { SSL: 'ssl' } }
      ]
    }
  ]
);

for (const compressor of ['zstd', 'snappy']) {
  TASKS.push({
    name: `test-${compressor}-compression`,
    tags: ['latest', compressor],
    commands: [
      { func: 'install dependencies' },
      {
        func: 'bootstrap mongo-orchestration',
        vars: {
          VERSION: 'latest',
          TOPOLOGY: 'replica_set',
          AUTH: 'auth',
          COMPRESSOR: compressor
        }
      },
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
    { func: 'install dependencies' },
    {
      func: 'bootstrap mongo-orchestration',
      vars: {
        VERSION: 'rapid',
        TOPOLOGY: 'server'
      }
    },
    { func: 'run lambda handler example tests' }
  ]
});

// Add task for testing lambda example with aws auth.
AWS_LAMBDA_HANDLER_TASKS.push({
  name: 'test-lambda-aws-auth-example',
  tags: ['latest', 'lambda'],
  commands: [
    { func: 'install dependencies' },
    {
      func: 'bootstrap mongo-orchestration',
      vars: {
        VERSION: 'rapid',
        AUTH: 'auth',
        ORCHESTRATION_FILE: 'auth-aws.json',
        TOPOLOGY: 'server'
      }
    },
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
      { func: 'install dependencies' },
      {
        func: 'bootstrap mongo-orchestration',
        vars: {
          VERSION,
          SSL: 'ssl',
          TOPOLOGY: 'server'
          // TODO: NODE-3891 - fix tests broken when AUTH enabled
          // AUTH: 'auth'
        }
      },
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
      { func: 'install dependencies' },
      { func: 'install aws-credential-providers' },
      {
        func: 'bootstrap mongo-orchestration',
        vars: {
          VERSION: VERSION,
          AUTH: 'auth',
          ORCHESTRATION_FILE: 'auth-aws.json',
          TOPOLOGY: 'server'
        }
      },
      { func: 'add aws auth variables to file' },
      { func: 'setup aws env' },
      { ...fn }
    ]
  }));

  const awsNoPeerDependenciesTasks = awsFuncs.map(fn => ({
    name: `${name(fn.func)}-no-peer-dependencies`,
    commands: [
      { func: 'install dependencies' },
      {
        func: 'bootstrap mongo-orchestration',
        vars: {
          VERSION: VERSION,
          AUTH: 'auth',
          ORCHESTRATION_FILE: 'auth-aws.json',
          TOPOLOGY: 'server'
        }
      },
      { func: 'add aws auth variables to file' },
      { func: 'setup aws env' },
      { ...fn }
    ]
  }));

  const allAwsTasks = awsTasks.concat(awsNoPeerDependenciesTasks);

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

  for (const NODE_LTS_NAME of testedNodeVersions) {
    const nodeVersionNumber = versions.find(
      ({ codeName }) => codeName === NODE_LTS_NAME
    ).versionNumber;
    const nodeLtsDisplayName =
      nodeVersionNumber === undefined ? `Node Latest` : `Node${nodeVersionNumber}`;
    const name = `${osName}-${NODE_LTS_NAME}`;
    const display_name = `${osDisplayName} ${nodeLtsDisplayName}`;
    const expansions = { NODE_LTS_NAME };
    const taskNames = tasks.map(({ name }) => name);

    if (clientEncryption) {
      expansions.CLIENT_ENCRYPTION = true;
    }

    BUILD_VARIANTS.push({ name, display_name, run_on, expansions, tasks: taskNames });
  }

  const configureLatestNodeSmokeTest = os.match(/^rhel/);
  if (configureLatestNodeSmokeTest) {
    const buildVariantData = {
      name: `${osName}-node-latest`,
      display_name: `${osDisplayName} Node Latest`,
      run_on,
      expansions: { NODE_LTS_NAME: 'latest' },
      tasks: tasks.map(({ name }) => name)
    };
    if (clientEncryption) {
      buildVariantData.expansions.CLIENT_ENCRYPTION = true;
    }

    BUILD_VARIANTS.push(buildVariantData);
  }
}

BUILD_VARIANTS.push({
  name: 'macos-1100',
  display_name: `MacOS 11 Node${versions.find(version => version.codeName === LATEST_LTS).versionNumber
    }`,
  run_on: 'macos-1100',
  expansions: {
    NODE_LTS_NAME: LATEST_LTS,
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
        {
          func: 'install dependencies',
          vars: {
            NODE_LTS_NAME: LOWEST_LTS
          }
        },
        { func: 'run unit tests' }
      ]
    },
    {
      name: 'run-lint-checks',
      tags: ['run-lint-checks'],
      commands: [
        {
          func: 'install dependencies',
          vars: {
            NODE_LTS_NAME: LOWEST_LTS
          }
        },
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
          {
            func: 'install dependencies',
            vars: {
              NODE_LTS_NAME: LOWEST_LTS
            }
          },
          {
            func: 'compile driver',
            vars: {
              TS_VERSION
            }
          }
        ]
      };
    }

    yield {
      name: `check-types-typescript-${TS_VERSION}`,
      tags: [`check-types-typescript-${TS_VERSION}`],
      commands: [
        {
          func: 'install dependencies',
          vars: {
            NODE_LTS_NAME: LOWEST_LTS
          }
        },
        {
          func: 'check types',
          vars: {
            TS_VERSION
          }
        }
      ]
    };
  }
  return {
    name: 'run-typescript-next',
    tags: ['run-typescript-next'],
    commands: [
      {
        func: 'install dependencies',
        vars: {
          NODE_LTS_NAME: LOWEST_LTS
        }
      },
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
  run_on: 'ubuntu1804-large',
  tasks: mongoshTasks.map(({ name }) => name)
});

// special case for MONGODB-AWS authentication
BUILD_VARIANTS.push({
  name: 'ubuntu1804-test-mongodb-aws',
  display_name: 'MONGODB-AWS Auth test',
  run_on: 'ubuntu1804-large',
  expansions: {
    NODE_LTS_NAME: LOWEST_LTS
  },
  tasks: AWS_AUTH_TASKS
});

const oneOffFuncAsTasks = [];

const FLE_PINNED_COMMIT = 'cd7e938619aa52ce652d13690780df5f383bbef0';

for (const version of ['5.0', 'rapid', 'latest']) {
  for (const ref of [FLE_PINNED_COMMIT, 'master']) {
    oneOffFuncAsTasks.push({
      name: `run-custom-csfle-tests-${version}-${ref === 'master' ? ref : 'pinned-commit'}`,
      tags: ['run-custom-dependency-tests'],
      commands: [
        {
          func: 'install dependencies',
          vars: {
            NODE_LTS_NAME: LOWEST_LTS
          }
        },
        {
          func: 'bootstrap mongo-orchestration',
          vars: {
            VERSION: version,
            TOPOLOGY: 'replica_set'
          }
        },
        { func: 'bootstrap kms servers' },
        {
          func: 'run custom csfle tests',
          vars: {
            CSFLE_GIT_REF: ref
          }
        }
      ]
    });
  }
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
    NODE_LTS_NAME: LOWEST_LTS
  },
  tasks: ['serverless_task_group']
});

BUILD_VARIANTS.push({
  name: 'rhel8-test-gcp-kms',
  display_name: 'GCP KMS Test',
  run_on: 'debian11-small',
  tasks: ['test_gcpkms_task_group', 'test-gcpkms-fail-task']
});

BUILD_VARIANTS.push({
  name: 'debian11-test-azure-kms',
  display_name: 'Azure KMS Test',
  run_on: 'debian11-small',
  batchtime: 20160,
  tasks: ['test_azurekms_task_group', 'test-azurekms-fail-task']
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
    ['gallium', 'hydrogen', 'latest'].includes(variant.expansions.NODE_LTS_NAME)
)) {
  variant.tasks = variant.tasks.filter(
    name => !['test-zstd-compression', 'test-snappy-compression'].includes(name)
  );
}

// TODO(NODE-5021): Drop support for Kerberos 1.x on in 6.0.0
for (const variant of BUILD_VARIANTS.filter(
  variant => variant.expansions && ['latest'].includes(variant.expansions.NODE_LTS_NAME)
)) {
  variant.tasks = variant.tasks.filter(name => !['test-auth-kerberos'].includes(name));
}

// TODO(NODE-4897): Debug socks5 tests on node latest
for (const variant of BUILD_VARIANTS.filter(
  variant => variant.expansions && ['latest'].includes(variant.expansions.NODE_LTS_NAME)
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
  yaml.dump(fileData, { lineWidth: 120, noRefs: true }),
  'utf8'
);
