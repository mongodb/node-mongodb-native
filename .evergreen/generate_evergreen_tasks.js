'use strict';

const semver = require('semver');
const fs = require('fs');
const yaml = require('js-yaml');

const LATEST_EFFECTIVE_VERSION = '5.0';
const MONGODB_VERSIONS = ['latest', '4.4', '4.2', '4.0', '3.6', '3.4', '3.2', '3.0', '2.6'];
const AWS_AUTH_VERSIONS = ['latest', '4.4'];
const OCSP_VERSIONS = ['latest', '4.4'];
const NODE_VERSIONS = ['erbium', 'dubnium', 'carbon', 'boron', 'argon'];
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
  }

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
      nodeVersion: 'argon',
      auth: false
    },
    osConfig
  )
);

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
    TASKS.push(makeTask({ mongoVersion, topology }))
  );
});

TASKS.push(
  {
    name: 'test-atlas-connectivity',
    tags: ['atlas-connect'],
    commands: [{ func: 'install dependencies' }, { func: 'run atlas tests' }]
  },
  {
    name: 'test-auth-kerberos',
    tags: ['auth', 'kerberos'],
    commands: [
      { func: 'install dependencies' },
      { func: 'run kerberos tests' }
    ]
  },
  {
    name: 'test-auth-ldap',
    tags: ['auth', 'ldap'],
    commands: [{ func: 'install dependencies' }, { func: 'run ldap tests' }]
  },
  {
    name: 'test-tls-support',
    tags: ['tls-support'],
    commands: [
      { func: 'install dependencies' },
      {
        func: 'bootstrap mongo-orchestration',
        vars: {
          SSL: 'ssl',
          VERSION: 'latest',
          TOPOLOGY: 'server'
        }
      },
      { func: 'run tls tests' }
    ]
  }
);

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
})

const AWS_AUTH_TASKS = [];

AWS_AUTH_VERSIONS.forEach(VERSION => {
  const name = `aws-${VERSION}-auth-test`;
  AWS_AUTH_TASKS.push(name);
  TASKS.push({
    name: name,
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
      { func: 'run aws auth test with regular aws credentials' },
      { func: 'run aws auth test with assume role credentials' },
      { func: 'run aws auth test with aws EC2 credentials' },
      { func: 'run aws auth test with aws credentials as environment variables' },
      { func: 'run aws auth test with aws credentials and session token as environment variables' },
      { func: 'run aws ECS auth test' }
    ]
  });
})


const BUILD_VARIANTS = [];

const getTaskList = (() => {
  const memo = {};
  return function(mongoVersion) {
    const key = mongoVersion;

    if (memo[key]) {
      return memo[key];
    }

    const ret = TASKS.filter(task => {
      const tasksWithVars = task.commands.filter(task => !!task.vars);
      if (task.name.match(/^aws/)) return false;

      if (!tasksWithVars.length) {
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

BUILD_VARIANTS.push({
  name: 'lint',
  display_name: 'lint',
  run_on: 'rhel70',
  tasks: ['run-checks']
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
fileData.tasks = (fileData.tasks || []).concat(TASKS).concat(SINGLETON_TASKS);
fileData.buildvariants = (fileData.buildvariants || []).concat(BUILD_VARIANTS);

fs.writeFileSync(`${__dirname}/config.yml`, yaml.safeDump(fileData, { lineWidth: 120 }), 'utf8');
