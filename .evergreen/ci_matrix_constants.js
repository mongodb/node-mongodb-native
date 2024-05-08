const MONGODB_VERSIONS = ['latest', 'rapid', '8.0', '7.0', '6.0', '5.0', '4.4', '4.2', '4.0', '3.6'];
const versions = [
  { codeName: 'fermium', versionNumber: 14, npmVersion: 9 },
  { codeName: 'gallium', versionNumber: 16, npmVersion: 9 },
  { codeName: 'hydrogen', versionNumber: 18, npmVersion: 'latest' },
  { codeName: 'iron', versionNumber: 20, npmVersion: 'latest' }
];
const NODE_VERSIONS = versions.map(({ versionNumber }) => versionNumber).sort((a, b) => a - b);
const LOWEST_LTS = NODE_VERSIONS[0];
const LATEST_LTS = NODE_VERSIONS[NODE_VERSIONS.length - 1];

const TOPOLOGIES = ['server', 'replica_set', 'sharded_cluster'];
const AWS_AUTH_VERSIONS = ['latest', '8.0', '7.0', '6.0', '5.0', '4.4'];
const TLS_VERSIONS = ['latest', '8.0', '7.0', '6.0', '5.0', '4.4', '4.2'];

const DEFAULT_OS = 'rhel80-large';
const WINDOWS_OS = 'windows-vsCurrent-large';
const MACOS_OS = 'macos-1100';
const UBUNTU_OS = 'ubuntu1804-large';
const UBUNTU_20_OS = 'ubuntu2004-small';
const UBUNTU_22_OS = 'ubuntu2204-large';
const DEBIAN_OS = 'debian11-small';

module.exports = {
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
  UBUNTU_20_OS,
  UBUNTU_22_OS,
  DEBIAN_OS
};
