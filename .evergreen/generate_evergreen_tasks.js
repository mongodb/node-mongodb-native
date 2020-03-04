'use strict';

const semver = require('semver');
const fs = require('fs');
const yaml = require('js-yaml');

const LATEST_EFFECTIVE_VERSION = '5.0';
const MONGODB_VERSIONS = ['latest', '4.2', '4.0', '3.6', '3.4', '3.2', '3.0', '2.6'];
const NODE_VERSIONS = ['carbon', 'dubnium', 'erbium'];
const TOPOLOGIES = ['server', 'replica_set', 'sharded_cluster'];
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

  // Windows. reenable this when nvm supports windows, or we settle on an alternative tool
  // {
  //   name: 'windows-64-vs2010-test',
  //   display_name: 'Windows (VS2010)',
  //   run_on: 'windows-64-vs2010-test'
  // },
  // {
  //   name: 'windows-64-vs2013-test',
  //   display_name: 'Windows (VS2013)',
  //   run_on: 'windows-64-vs2013-test'
  // },
  // {
  //   name: 'windows-64-vs2015-test',
  //   display_name: 'Windows (VS2015)',
  //   run_on: 'windows-64-vs2015-test'
  // }
].map(osConfig =>
  Object.assign(
    {
      mongoVersion: '>=2.6',
      nodeVersion: 'carbon',
      auth: false
    },
    osConfig
  )
);

const TASKS = [];

function makeTask({ mongoVersion, topology }) {
  let topologyForTest = topology;
  let runTestsCommand = { func: 'run tests' };

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
  TOPOLOGIES.forEach(topology => {
    TASKS.push(makeTask({ mongoVersion, topology }));
  });
});

// manually added tasks
Array.prototype.push.apply(TASKS, [
  {
    name: 'test-atlas-connectivity',
    tags: ['atlas-connect'],
    commands: [
      { func: 'install dependencies' },
      {
        func: 'run atlas tests',
        vars: {
          VERSION: 'latest'
        }
      }
    ]
  },
  {
    name: 'test-ocsp-valid-cert-server-staples',
    tags: ['ocsp'],
    commands: [
      { func: 'run-valid-ocsp-server' },
      { func: 'install dependencies' },
      {
        func: 'bootstrap mongo-orchestration',
        vars: {
          ORCHESTRATION_FILE: 'rsa-basic-tls-ocsp-mustStaple.json',
          VERSION: 'latest',
          TOPOLOGY: 'server'
        }
      },
      { func: 'run-ocsp-test', vars: { OCSP_TLS_SHOULD_SUCCEED: 1 } }
    ]
  },
  {
    name: 'test-ocsp-invalid-cert-server-staples',
    tags: ['ocsp'],
    commands: [
      { func: 'run-revoked-ocsp-server' },
      { func: 'install dependencies' },
      {
        func: 'bootstrap mongo-orchestration',
        vars: {
          ORCHESTRATION_FILE: 'rsa-basic-tls-ocsp-mustStaple.json',
          VERSION: 'latest',
          TOPOLOGY: 'server'
        }
      },
      { func: 'run-ocsp-test', vars: { OCSP_TLS_SHOULD_SUCCEED: 0 } }
    ]
  },
  {
    name: 'test-ocsp-valid-cert-server-does-not-staple',
    tags: ['ocsp'],
    commands: [
      { func: 'run-valid-ocsp-server' },
      { func: 'install dependencies' },
      {
        func: 'bootstrap mongo-orchestration',
        vars: {
          ORCHESTRATION_FILE: 'rsa-basic-tls-ocsp-disableStapling.json',
          VERSION: 'latest',
          TOPOLOGY: 'server'
        }
      },
      { func: 'run-ocsp-test', vars: { OCSP_TLS_SHOULD_SUCCEED: 1 } }
    ]
  },
  {
    name: 'test-ocsp-invalid-cert-server-does-not-staple',
    tags: ['ocsp'],
    commands: [
      { func: 'run-revoked-ocsp-server' },
      { func: 'install dependencies' },
      {
        func: 'bootstrap mongo-orchestration',
        vars: {
          ORCHESTRATION_FILE: 'rsa-basic-tls-ocsp-disableStapling.json',
          VERSION: 'latest',
          TOPOLOGY: 'server'
        }
      },
      { func: 'run-ocsp-test', vars: { OCSP_TLS_SHOULD_SUCCEED: 0 } }
    ]
  },
  {
    name: 'test-ocsp-soft-fail',
    tags: ['ocsp'],
    commands: [
      { func: 'install dependencies' },
      {
        func: 'bootstrap mongo-orchestration',
        vars: {
          ORCHESTRATION_FILE: 'rsa-basic-tls-ocsp-disableStapling.json',
          VERSION: 'latest',
          TOPOLOGY: 'server'
        }
      },
      { func: 'run-ocsp-test', vars: { OCSP_TLS_SHOULD_SUCCEED: 1 } }
    ]
  },
  {
    name: 'test-ocsp-malicious-invalid-cert-mustStaple-server-does-not-staple',
    tags: ['ocsp'],
    commands: [
      { func: 'run-revoked-ocsp-server' },
      { func: 'install dependencies' },
      {
        func: 'bootstrap mongo-orchestration',
        vars: {
          ORCHESTRATION_FILE: 'rsa-basic-tls-ocsp-mustStaple-disableStapling.json',
          VERSION: 'latest',
          TOPOLOGY: 'server'
        }
      },
      { func: 'run-ocsp-test', vars: { OCSP_TLS_SHOULD_SUCCEED: 0 } }
    ]
  },
  {
    name: 'test-ocsp-malicious-no-responder-mustStaple-server-does-not-staple',
    tags: ['ocsp'],
    commands: [
      { func: 'install dependencies' },
      {
        func: 'bootstrap mongo-orchestration',
        vars: {
          ORCHESTRATION_FILE: 'rsa-basic-tls-ocsp-mustStaple-disableStapling.json',
          VERSION: 'latest',
          TOPOLOGY: 'server'
        }
      },
      { func: 'run-ocsp-test', vars: { OCSP_TLS_SHOULD_SUCCEED: 0 } }
    ]
  }
]);

TASKS.push({
  name: 'aws-auth-test',
  commands: [
    { func: 'install dependencies' },
    {
      func: 'bootstrap mongo-orchestration',
      vars: {
        AUTH: 'auth',
        ORCHESTRATION_FILE: 'auth-aws.json',
        TOPOLOGY: 'server'
      }
    },
    { func: 'add aws auth variables to file' },
    { func: 'run aws auth test with regular aws credentials' },
    { func: 'run aws auth test with assume role credentials' },
    { func: 'run aws auth test with aws EC2 credentials' },
    { func: 'run aws auth test with aws credentials as environment variables' },
    { func: 'run aws auth test with aws credentials and session token as environment variables' },
    { func: 'run aws ECS auth test' }
  ]
});

const BUILD_VARIANTS = [];

const getTaskList = (() => {
  const memo = {};
  return function(mongoVersion) {
    const key = mongoVersion;

    if (memo[key]) {
      return memo[key];
    }

    const ret = TASKS.filter(task => {
      const { VERSION } = task.commands.filter(task => !!task.vars)[0].vars;

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
    clientEncryption
  }) => {
    const testedNodeVersions = NODE_VERSIONS.filter(version => nodeVersions.includes(version));
    const tasks = getTaskList(mongoVersion);

    testedNodeVersions.forEach(NODE_LTS_NAME => {
      const nodeLtsDisplayName = `Node ${NODE_LTS_NAME[0].toUpperCase()}${NODE_LTS_NAME.substr(1)}`;
      const name = `${osName}-${NODE_LTS_NAME}`;
      const display_name = `${osDisplayName} ${nodeLtsDisplayName}`;
      const expansions = { NODE_LTS_NAME };

      if (clientEncryption) {
        expansions.CLIENT_ENCRYPTION = true;
      }

      BUILD_VARIANTS.push({ name, display_name, run_on, expansions, tasks });
    });
  }
);

// special case for MONGODB-AWS authentication
BUILD_VARIANTS.push({
  name: 'ubuntu1804-test-mongodb-aws',
  display_name: 'MONGODB-AWS Auth test',
  run_on: 'ubuntu1804-test',
  expansions: {
    NODE_LTS_NAME: 'carbon'
  },
  tasks: ['aws-auth-test']
});

const fileData = yaml.safeLoad(fs.readFileSync(`${__dirname}/config.yml.in`, 'utf8'));

fileData.tasks = (fileData.tasks || []).concat(TASKS);
fileData.buildvariants = (fileData.buildvariants || []).concat(BUILD_VARIANTS);

fs.writeFileSync(`${__dirname}/config.yml`, yaml.safeDump(fileData, { lineWidth: 120 }), 'utf8');
