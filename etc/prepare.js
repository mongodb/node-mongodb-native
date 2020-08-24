#! /usr/bin/env node
var cp = require('child_process');
var fs = require('fs');

if (fs.existsSync('src')) {
  cp.spawn('npm', ['run', 'build:dts'], { stdio: 'inherit' });
} else {
  if (!fs.existsSync('lib')) {
    console.warn('MongoDB: No compiled javascript present, the driver is not installed correctly.');
  }
}
