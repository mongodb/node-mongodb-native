#! /usr/bin/env node
var cp = require('child_process');
var fs = require('fs');

if (fs.existsSync('src')) {
  cp.spawn('npx', ['gulp', 'compile'], { stdio: 'inherit' });
} else {
  if (!fs.existsSync('lib')) {
    console.warn('MongoDB: No compiled javascript present, the driver is not installed correctly.');
  }
}
