const fs = require('fs');
const yaml = require('js-yaml');

const { DEFAULT_OS, LOWEST_LTS } = require('./ci_matrix_constants');

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

const csfleTasks = [];

const FLE_PINNED_COMMIT = '38f1be60e3f8d24b066642f742c90d0ffdd0cdc0';

for (const version of ['5.0', '6.0', /* TODO: RangePreview question '7.0' */]) {
  for (const ref of [FLE_PINNED_COMMIT, 'main']) {
    csfleTasks.push({
      name: `run-custom-csfle-tests-${version}-${ref === 'main' ? ref : 'pinned-commit'}`,
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

const fileData = yaml.load(fs.readFileSync(`${__dirname}/config.in.yml`, 'utf8'));
fileData.tasks = (fileData.tasks || []).concat(csfleTasks);

fileData.buildvariants = (fileData.buildvariants || []).concat([
  {
    name: 'rhel8-custom-dependency-tests',
    display_name: 'Custom Dependency Version Test',
    run_on: DEFAULT_OS,
    tags: ['csfle'],
    tasks: csfleTasks.map(({ name }) => name)
  }
]);

fs.writeFileSync(
  `${__dirname}/config.yml`,
  yaml.dump(fileData, { lineWidth: 120, noRefs: true, flowLevel: 7, condenseFlow: false }),
  'utf8'
);
