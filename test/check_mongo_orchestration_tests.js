'use strict';
const shell = require('shelljs');
if (!shell.which('mongo-orchestration')) {
  //shell.echo('Warning: please install mongo-orchestration.');
  // shell.echo('Mongo-orchestration not found. Installing mongo-orchestration.');
  // shell.exec('pip install mongo-orchestration');
  shell.exec('git clone https://github.com/10gen/mongo-orchestration.git');
  shell.cd('mongo-orchestration');
  shell.exec('pip install . --user')
  //shell.exec('pip install git+https://github.com/10gen/mongo-orchestration.git --user')
}
shell.echo('Path to Mongo-Orchestration:');
shell.echo(shell.which('mongo-orchestration'));
shell.cd(shell.which('mongo-orchestration'));
