'use strict';
const shell = require('shelljs');
if (!shell.which('mongo-orchestration')) {
  //shell.echo('Warning: please install mongo-orchestration.');
  shell.echo('Mongo-orchestration not found. Installing mongo-orchestration.');
  shell.exec('pip install mongo-orchestration');
} else {
  shell.echo('Path to Mongo-Orchestration:');
  shell.echo(shell.which('mongo-orchestration'));
}
