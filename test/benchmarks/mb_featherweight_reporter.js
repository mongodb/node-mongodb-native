"use strict"

var colors = require('colors'),
  f = require('util').format,
  Table = require('cli-table'),
  Stats = require('betterbenchmarks').Stats;

var tables = [];
var table = null;

class MBSimpleReporter {
  constructor() {
  }

  suiteSetup(suite) {
    console.log(f('Starting suite [%s]', suite.title.bold.white));
  }

  benchmarkSetup(suite, benchmark) {
    console.log("  starting benchmark : " + benchmark.title)
    table = new Table({
      head: ['Suite'.white.bold, 'Benchmark'.white.bold, 'Measure'.white.bold, 'Value'.white.bold],
      colWidth: [100, 200, 200, 300]
    })
  }

  benchmarkCycle(cycle, suite, benchmark) {
    console.log("    execute cycle " + cycle);
  }

  benchmarkTeardown(suite, benchmark) {
    // Aggregate up all timings
    var finalStats = new Stats();

    // All the values
    var durations = [];

    // We don't have a custom method
    if(!benchmark.metadata || !benchmark.metadata.custom) {
      // For each of the recorded stats add the timings together
      for(var i = 0; i < benchmark.stats.length; i++) {
        // For each of the runs add up all the values
        var duration = [0, 0];

        // Add up all the values
        benchmark.stats[i].timings.map(function(x) {
          duration[0] = duration[0] + x[0];
          duration[1] = duration[1] + x[1];
        });

        // Push the duration to the array
        durations.push((duration[0] * 1e9 + duration[1]) / (1000));
      }
    } else {
      // For each of the recorded stats add the timings together
      for(var i = 0; i < benchmark.stats.length; i++) {
        // Add up all the values
        benchmark.stats[i].timings.map(function(x) {
          durations.push((x[0] * 1e9 + x[1]) / (1000));
        });
      }
    }

    // Convert duration to seconds
    durations = durations.map(function(x) {
      return (x/1000)/1000;
    })

    // console.log("--------------------------------------------------- metadata")
    // console.dir(benchmark.metadata)

    console.log("--------------------------------------------------- durations")
    console.dir(durations)

    // Get the size of the context
    var size = benchmark.context.size;

    console.log("--------------------------------------------------- size")
    console.dir(size)

    // Calculate MB/s
    var mbs = durations.map(function(x) {
      // console.log("--------------------------------------- " + size + " :: " + x)
      return ((size/x) / 1024) / 1024;
    });

    // console.log("--------------------------------------------------- MB/s")
    // console.dir(mbs)

    // Add the bytes per second to the finalStats
    finalStats.push(mbs);

    // Convert to MB/s
    var convert = function(x) {
      return Math.round((x * 100) / 100);
    }

    // Push the sute and benchmark title as well as Median value
    table.push([suite.title, benchmark.title, 'Median'.green, f('%s MB/s', convert(finalStats.median()))]);

    // Get the different values
    table.push(['', '', 'stdDev'.green, f('%s MB/s', convert(finalStats.stdDev()))]);
    table.push(['', '', '[Min, Max]'.green,
      f('[%s, %s] MB/s'
        , convert(finalStats.range()[0])
        , convert(finalStats.range()[1])
      )]);
    table.push(['', '', '10 percentile'.green, f('%s MB/s', convert(finalStats.percentile(10)))]);
    table.push(['', '', '25 percentile'.green, f('%s MB/s', convert(finalStats.percentile(25)))]);
    table.push(['', '', '75 percentile'.green, f('%s MB/s', convert(finalStats.percentile(75)))]);
    table.push(['', '', '95 percentile'.green, f('%s MB/s', convert(finalStats.percentile(95)))]);
    table.push(['', '', '98 percentile'.green, f('%s MB/s', convert(finalStats.percentile(98)))]);
    table.push(['', '', '99 percentile'.green, f('%s MB/s', convert(finalStats.percentile(99)))]);

    // Turn table into string and print to console
    console.log(table.toString());
  }
}

module.exports = MBSimpleReporter;
