
var gleak = require('gleak')();
gleak.ignore('AssertionError');
gleak.ignore('testFullSpec_param_found');
gleak.ignore('events');
gleak.ignore('TAP_Global_Harness');

module.exports = gleak;
