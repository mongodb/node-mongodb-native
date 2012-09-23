
var gleak = require('gleak')();
gleak.ignore('AssertionError');
gleak.ignore('testFullSpec_param_found');
gleak.ignore('events');
gleak.ignore('TAP_Global_Harness');
gleak.ignore('Uint8ClampedArray');
gleak.ignore('_$jscoverage');

module.exports = gleak;
