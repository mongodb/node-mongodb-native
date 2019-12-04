'use strict';

const util = require('./util');

class Benchmark {
  constructor() {
    // The Task itself
    this._task = null;

    // Lifecycle Hooks
    this._setup = [];
    this._beforeTask = [];
    this._afterTask = [];
    this._teardown = [];

    // Meta information
    this._taskSize = null;
    this._description = null;
  }

  /**
   * Set the task to benchmark
   * @param {Function} fn The task to benchmark
   * @return {this} this
   */
  task(fn) {
    if (typeof fn !== 'function') {
      throw new TypeError(`Argument fn (${fn}) must be a function`);
    }

    if (this._task !== null) {
      throw new Error('You cannot have more than one task per benchmark');
    }

    this._task = fn;

    return this;
  }

  /**
   * Add a setup lifecycle hook
   * @param {Function|Function[]} fn The lifecycle hook
   * @return {this} this
   */
  setup(fn) {
    return this._pushLifecycleHook(this._setup, fn);
  }

  /**
   * Add a beforeTask lifecycle hook
   * @param {Function|Function[]} fn The lifecycle hook
   * @return {this} this
   */
  beforeTask(fn) {
    return this._pushLifecycleHook(this._beforeTask, fn);
  }

  /**
   * Add an afterTask lifecycle hook
   * @param {Function|Function[]} fn The lifecycle hook
   * @return {this} this
   */
  afterTask(fn) {
    return this._pushLifecycleHook(this._afterTask, fn);
  }

  /**
   * Add a teardown lifecycle hook
   * @param {Function|Function[]} fn The lifecycle hook
   * @return {this} this
   */
  teardown(fn) {
    return this._pushLifecycleHook(this._teardown, fn);
  }

  /**
   * Set the Task Size
   * @param {Number} size The Task Size in MB
   * @return {this} this
   */
  taskSize(size) {
    if (!(Number.isFinite(size) && size > 0)) {
      throw new TypeError(`size (${size}) must be a finite number greater than zero`);
    }

    if (this._taskSize != null) {
      throw new Error(`taskSize has already been set`);
    }

    this._taskSize = size;

    return this;
  }

  /**
   * Set the Description
   * @param {String} description The description of the benchmark
   * @return {this} this
   */
  description(description) {
    if (typeof description !== 'string' || !description) {
      throw new TypeError(`description (${description}) must be a non-zero length string`);
    }

    if (this._description != null) {
      throw new Error(`description has already been set`);
    }

    this._description = description;

    return this;
  }

  /**
   * Validates that the benchmark has all the fields necessary
   * @throws Error
   */
  validate() {
    ['_task', '_taskSize'].forEach(key => {
      if (!this[key]) {
        throw new Error(`Benchmark is missing required field ${key}`);
      }
    });
  }

  toObj() {
    return {
      // Required Fields
      task: this._task,
      taskSize: this._taskSize,

      // Optional Fields
      description: this._description || `Performance test`,
      setup: this._convertArrayToAsyncPipeFn(this._setup),
      beforeTask: this._convertArrayToAsyncPipeFn(this._beforeTask),
      afterTask: this._convertArrayToAsyncPipeFn(this._afterTask),
      teardown: this._convertArrayToAsyncPipeFn(this._teardown)
    };
  }

  /**
   * @ignore
   */
  _pushLifecycleHook(hookList, fn) {
    if (Array.isArray(fn)) {
      fn.forEach(f => this._pushLifecycleHook(hookList, f));
      return this;
    }

    if (typeof fn !== 'function') {
      throw new TypeError(`Parameter ${fn} must be a function`);
    }

    hookList.push(fn);
    return this;
  }

  /**
   * @ignore
   */
  _convertArrayToAsyncPipeFn(arr) {
    return arr.length ? util.asyncChain(arr) : util.noop;
  }
}

module.exports = Benchmark;
