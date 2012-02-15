
var gleak = require('gleak')();
gleak.ignore('AssertionError');
gleak.ignore('testFullSpec_param_found');
gleak.ignore('events');

module.exports = gleak;
