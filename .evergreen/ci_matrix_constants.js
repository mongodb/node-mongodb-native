const MONGODB_VERSIONS = ['latest', 'rapid', '6.0', '5.0', '4.4', '4.2', '4.0', '3.6'];
const versions = [
  { codeName: 'fermium', versionNumber: 14 },
  { codeName: 'gallium', versionNumber: 16 },
  { codeName: 'hydrogen', versionNumber: 18 }
];
const NODE_VERSIONS = versions.map(({ codeName }) => codeName);
NODE_VERSIONS.sort();
const LOWEST_LTS = NODE_VERSIONS[0];
const LATEST_LTS = NODE_VERSIONS[NODE_VERSIONS.length - 1];

const TOPOLOGIES = ['server', 'replica_set', 'sharded_cluster'];
const AWS_AUTH_VERSIONS = ['latest', '6.0', '5.0', '4.4'];
const TLS_VERSIONS = ['latest', '6.0', '5.0', '4.4', '4.2'];

const DEFAULT_OS = 'rhel80-large';

module.exports = {
  MONGODB_VERSIONS,
  versions,
  NODE_VERSIONS,
  LOWEST_LTS,
  LATEST_LTS,
  TOPOLOGIES,
  AWS_AUTH_VERSIONS,
  TLS_VERSIONS,
  DEFAULT_OS
};
