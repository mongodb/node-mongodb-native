'use strict';

const semver = require('semver');
const fs = require('fs');
const yaml = require('js-yaml');

const LATEST_EFFECTIVE_VERSION = '5.0';
const MONGODB_VERSIONS = ['latest', '4.4', '4.2', '4.0', '3.6', '3.4', '3.2', '3.0', '2.6'];
const AWS_AUTH_VERSIONS = ['latest', '4.4'];
const OCSP_VERSIONS = ['latest', '4.4'];
const TLS_VERSIONS = ['latest', '4.2']; // also test on 4.2 because 4.4+ currently skipped on windows
const NODE_VERSIONS = ['fermium', 'erbium', 'dubnium', 'carbon', 'boron', 'argon'];
const TOPOLOGIES = ['server', 'replica_set', 'sharded_cluster'].concat([
  'server-unified',
  'replica_set-unified',
  'sharded_cluster-unified'
]);

const OPERATING_SYSTEMS = [
  {
    name: 'macos-1014',
    display_name: 'macOS 10.14',
    run_on: 'macos-1014',
    auth: false
  },
  {
    name: 'rhel70',
    display_name: 'RHEL 7.0',
    run_on: 'rhel70-small'
  },
  {
    name: 'ubuntu-14.04',
    display_name: 'Ubuntu 14.04',
    run_on: 'ubuntu1404-test',
    mongoVersion: '<4.2'
  },
  {
    name: 'ubuntu-18.04',
    display_name: 'Ubuntu 18.04',
    run_on: 'ubuntu1804-test',
    mongoVersion: '>=3.2',
    clientEncryption: true
  },
  {
    name: 'windows-64-vs2013',
    display_name: 'Windows (VS2013)',
    run_on: 'windows-64-vs2013-large',
    msvsVersion: 2013,
    mongoVersion: '<4.4',
    nodeVersions: ['carbon', 'boron', 'argon']
  },
  {
    name: 'windows-64-vs2015',
    display_name: 'Windows (VS2015)',
    run_on: 'windows-64-vs2015-large',
    msvsVersion: 2015,
    mongoVersion: '<4.4'
  },
  {
    name: 'windows-64-vs2017',
    display_name: 'Windows (VS2017)',
    run_on: 'windows-64-vs2017-large',
    msvsVersion: 2017,
    mongoVersion: '<4.4'
  }
].map(osConfig =>
  Object.assign(
    {
      mongoVersion: '>=2.6',
      nodeVersion: 'argon',
      auth: false
    },
    osConfig
  )
);

const WINDOWS_SKIP_TAGS = new Set([
  'atlas-connect',
  'auth'
]);

const BASE_TASKS = [];
const TASKS = [];
const SINGLETON_TASKS = [];

function makeTask({ mongoVersion, topology }) {
  let topologyForTest = topology;
  let runTestsCommand = { func: 'run tests' };
  if (topology.indexOf('-unified') !== -1) {
    topologyForTest = topology.split('-unified')[0];
    runTestsCommand = { func: 'run tests', vars: { UNIFIED: 1 } };
  }

  return {
    name: `test-${mongoVersion}-${topology}`,
    tags: [mongoVersion, topology],
    commands: [
      { func: 'install dependencies' },
      {
        func: 'bootstrap mongo-orchestration',
        vars: {
          VERSION: mongoVersion,
          TOPOLOGY: topologyForTest
        }
      },
      runTestsCommand
    ]
  };
}

MONGODB_VERSIONS.forEach(mongoVersion => {
  TOPOLOGIES.forEach(topology =>
    BASE_TASKS.push(makeTask({ mongoVersion, topology }))
  );
});

TASKS.push(
  {
    name: 'test-atlas-connectivity',
    tags: ['atlas-connect'],
    commands: [{ func: 'install dependencies' }, { func: 'run atlas tests' }]
  },
  {
    name: 'test-auth-kerberos-legacy',
    tags: ['auth', 'kerberos', 'legacy'],
    commands: [
      { func: 'install dependencies' },
      { func: 'run kerberos tests',
        vars: {
          UNIFIED: 0
        }
      }
    ]
  },
  {
    name: 'test-auth-kerberos-unified',
    tags: ['auth', 'kerberos', 'unified'],
    commands: [
      { func: 'install dependencies' },
      { func: 'run kerberos tests',
        vars: {
          UNIFIED: 1
        }
      }
    ]
  },
  {
    name: 'test-auth-ldap',
    tags: ['auth', 'ldap'],
    commands: [{ func: 'install dependencies' }, { func: 'run ldap tests' }]
  }
);

TLS_VERSIONS.forEach(VERSION => {
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
        }
      },
      { func: 'run tls tests' }
    ]
  });
});

OCSP_VERSIONS.forEach(VERSION => {
  // manually added tasks
  Array.prototype.push.apply(TASKS, [
    {
      name: `test-${VERSION}-ocsp-valid-cert-server-staples`,
      tags: ['ocsp'],
      commands: [
        { func: `run-valid-ocsp-server` },
        { func: 'install dependencies' },
        {
          func: 'bootstrap mongo-orchestration',
          vars: {
            ORCHESTRATION_FILE: 'rsa-basic-tls-ocsp-mustStaple.json',
            VERSION: VERSION,
            TOPOLOGY: 'server'
          }
        },
        { func: 'run-ocsp-test', vars: { OCSP_TLS_SHOULD_SUCCEED: 1 } }
      ]
    },
    {
      name: `test-${VERSION}-ocsp-invalid-cert-server-staples`,
      tags: ['ocsp'],
      commands: [
        { func: 'run-revoked-ocsp-server' },
        { func: 'install dependencies' },
        {
          func: 'bootstrap mongo-orchestration',
          vars: {
            ORCHESTRATION_FILE: 'rsa-basic-tls-ocsp-mustStaple.json',
            VERSION: VERSION,
            TOPOLOGY: 'server'
          }
        },
        { func: 'run-ocsp-test', vars: { OCSP_TLS_SHOULD_SUCCEED: 0 } }
      ]
    },
    {
      name: `test-${VERSION}-ocsp-valid-cert-server-does-not-staple`,
      tags: ['ocsp'],
      commands: [
        { func: 'run-valid-ocsp-server' },
        { func: 'install dependencies' },
        {
          func: 'bootstrap mongo-orchestration',
          vars: {
            ORCHESTRATION_FILE: 'rsa-basic-tls-ocsp-disableStapling.json',
            VERSION: VERSION,
            TOPOLOGY: 'server'
          }
        },
        { func: 'run-ocsp-test', vars: { OCSP_TLS_SHOULD_SUCCEED: 1 } }
      ]
    },
    {
      name: `test-${VERSION}-ocsp-invalid-cert-server-does-not-staple`,
      tags: ['ocsp'],
      commands: [
        { func: 'run-revoked-ocsp-server' },
        { func: 'install dependencies' },
        {
          func: 'bootstrap mongo-orchestration',
          vars: {
            ORCHESTRATION_FILE: 'rsa-basic-tls-ocsp-disableStapling.json',
            VERSION: VERSION,
            TOPOLOGY: 'server'
          }
        },
        { func: 'run-ocsp-test', vars: { OCSP_TLS_SHOULD_SUCCEED: 0 } }
      ]
    },
    {
      name: `test-${VERSION}-ocsp-soft-fail`,
      tags: ['ocsp'],
      commands: [
        { func: 'install dependencies' },
        {
          func: 'bootstrap mongo-orchestration',
          vars: {
            ORCHESTRATION_FILE: 'rsa-basic-tls-ocsp-disableStapling.json',
            VERSION: VERSION,
            TOPOLOGY: 'server'
          }
        },
        { func: 'run-ocsp-test', vars: { OCSP_TLS_SHOULD_SUCCEED: 1 } }
      ]
    },
    {
      name: `test-${VERSION}-ocsp-malicious-invalid-cert-mustStaple-server-does-not-staple`,
      tags: ['ocsp'],
      commands: [
        { func: 'run-revoked-ocsp-server' },
        { func: 'install dependencies' },
        {
          func: 'bootstrap mongo-orchestration',
          vars: {
            ORCHESTRATION_FILE: 'rsa-basic-tls-ocsp-mustStaple-disableStapling.json',
            VERSION: VERSION,
            TOPOLOGY: 'server'
          }
        },
        { func: 'run-ocsp-test', vars: { OCSP_TLS_SHOULD_SUCCEED: 0 } }
      ]
    },
    {
      name: `test-${VERSION}-ocsp-malicious-no-responder-mustStaple-server-does-not-staple`,
      tags: ['ocsp'],
      commands: [
        { func: 'install dependencies' },
        {
          func: 'bootstrap mongo-orchestration',
          vars: {
            ORCHESTRATION_FILE: 'rsa-basic-tls-ocsp-mustStaple-disableStapling.json',
            VERSION: VERSION,
            TOPOLOGY: 'server'
          }
        },
        { func: 'run-ocsp-test', vars: { OCSP_TLS_SHOULD_SUCCEED: 0 } }
      ]
    }
  ]);
});

const AWS_AUTH_TASKS = [];

AWS_AUTH_VERSIONS.forEach(VERSION => {
  const name = (ex) => `aws-${VERSION}-auth-test-${ex.split(' ').join('-')}`;
  // AWS_AUTH_TASKS.push(name);

  const aws_funcs = [
    { func: 'run aws auth test with regular aws credentials' },
    { func: 'run aws auth test with assume role credentials' },
    { func: 'run aws auth test with aws EC2 credentials' },
    { func: 'run aws auth test with aws credentials as environment variables' },
    { func: 'run aws auth test with aws credentials and session token as environment variables' },
    { func: 'run aws ECS auth test' }
  ];

  const aws_tasks = aws_funcs.map(fn => ({
    name: name(fn.func),
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
      fn
    ]
  }))

  TASKS.push(...aws_tasks);
  AWS_AUTH_TASKS.push(...aws_tasks.map(t => t.name))
});

const BUILD_VARIANTS = [];

const getTaskList = (() => {
  const memo = {};
  return function(mongoVersion, os) {
    const key = mongoVersion + os;

    if (memo[key]) {
      return memo[key];
    }
    const taskList = BASE_TASKS.concat(TASKS);
    const ret = taskList.filter(task => {
      if (task.name.match(/^aws/)) return false;

      // skip unsupported tasks on windows
      if (os.match(/^windows/) && task.tags.filter(tag => WINDOWS_SKIP_TAGS.has(tag)).length) {
        return false;
      }

      const tasksWithVars = task.commands.filter(task => !!task.vars);
      if (!tasksWithVars.length) {
        return true;
      }

      // kerberos tests don't require mongo orchestration
      if (task.tags.filter(tag => tag === 'kerberos').length) {
        return true;
      }

      const { VERSION } = tasksWithVars[0].vars || {};
      if (VERSION === 'latest') {
        return semver.satisfies(semver.coerce(LATEST_EFFECTIVE_VERSION), mongoVersion);
      }

      return semver.satisfies(semver.coerce(VERSION), mongoVersion);
    }).map(x => x.name);

    memo[key] = ret;
    return ret;
  };
})();

OPERATING_SYSTEMS.forEach(
  ({
    name: osName,
    display_name: osDisplayName,
    run_on,
    mongoVersion = '>=2.6',
    nodeVersions = NODE_VERSIONS,
    clientEncryption,
    msvsVersion
  }) => {
    const testedNodeVersions = NODE_VERSIONS.filter(version => nodeVersions.includes(version));
    const tasks = getTaskList(mongoVersion, osName.split('-')[0]);

    testedNodeVersions.forEach(NODE_LTS_NAME => {
      const nodeLtsDisplayName = `Node ${NODE_LTS_NAME[0].toUpperCase()}${NODE_LTS_NAME.substr(1)}`;
      const name = `${osName}-${NODE_LTS_NAME}`;
      const display_name = `${osDisplayName} ${nodeLtsDisplayName}`;
      const expansions = { NODE_LTS_NAME };

      if (clientEncryption) {
        expansions.CLIENT_ENCRYPTION = true;
      }
      if (msvsVersion) {
        expansions.MSVS_VERSION = msvsVersion;
      }

      BUILD_VARIANTS.push({ name, display_name, run_on, expansions, tasks });
    });
  }
);

// singleton build variant for linting
SINGLETON_TASKS.push({
  name: 'run-checks',
  tags: ['run-checks'],
  commands: [
    {
      func: 'install dependencies',
      vars: {
        NODE_LTS_NAME: 'erbium'
      }
    },
    { func: 'run checks' }
  ]
});

SINGLETON_TASKS.push({
  name: 'run-custom-csfle-tests',
  tags: ['run-custom-csfle-tests'],
  commands: [
    {
      func: 'install dependencies',
      vars: {
        NODE_LTS_NAME: 'erbium',
      },
    },
    {
      func: 'bootstrap mongo-orchestration',
      vars: {
        VERSION: '4.4',
        TOPOLOGY: 'server'
      }
    },
    { func: 'run custom csfle tests' }
  ]
});

BUILD_VARIANTS.push({
  name: 'lint',
  display_name: 'lint',
  run_on: 'rhel70',
  tasks: ['run-checks']
}, {
  name: 'ubuntu1804-custom-csfle-tests',
  display_name: 'Custom FLE Version Test',
  run_on: 'ubuntu1804-test',
  tasks: ['run-custom-csfle-tests']
});

// special case for MONGODB-AWS authentication
BUILD_VARIANTS.push({
  name: 'ubuntu1804-test-mongodb-aws',
  display_name: 'MONGODB-AWS Auth test',
  run_on: 'ubuntu1804-test',
  expansions: {
    NODE_LTS_NAME: 'carbon'
  },
  tasks: AWS_AUTH_TASKS
});

const fileData = yaml.safeLoad(fs.readFileSync(`${__dirname}/config.yml.in`, 'utf8'));
fileData.tasks = (fileData.tasks || []).concat(BASE_TASKS).concat(TASKS).concat(SINGLETON_TASKS);
fileData.buildvariants = (fileData.buildvariants || []).concat(BUILD_VARIANTS);

fs.writeFileSync(`${__dirname}/config.yml`, yaml.safeDump(fileData, { lineWidth: 120 }), 'utf8');
