import { expect } from 'chai';

import { makeFunctionParametersUnique } from '../src/core';
import { formatSource, parseSource } from '../src/utils';

describe('makeFunctionParametersUnique()', function () {
  describe('function declarations', function () {
    it('renames no parameters', async function () {
      const source = parseSource(`function foo() {
          foo();
        }`);
      const renamed = makeFunctionParametersUnique(source);
      expect(await formatSource(renamed)).to.deep.equal(
        await formatSource(`function foo() { foo(); }`)
      );
    });

    it('one parameter, no usage', async function () {
      const source = parseSource(`function foo(error) {
          foo();
        }`);
      const renamed = makeFunctionParametersUnique(source);
      expect(await formatSource(renamed)).to.deep.equal(
        await formatSource(`function foo(error_0) { foo(); }`)
      );
    });

    it('one parameter, with usage', async function () {
      const source = parseSource(`function foo(error) {
          foo(error);
        }`);
      const renamed = makeFunctionParametersUnique(source);
      expect(await formatSource(renamed)).to.deep.equal(
        await formatSource(`function foo(error_0) { foo(error_0); }`)
      );
    });

    it('two parameters, usage', async function () {
      const source = parseSource(`function foo(error, result) {
          foo(error, result);
        }`);
      const renamed = makeFunctionParametersUnique(source);
      expect(await formatSource(renamed)).to.deep.equal(
        await formatSource(`function foo(error_0, result_1) { foo(error_0, result_1); }`)
      );
    });

    it('two parameters, nested functions', async function () {
      const source = parseSource(`function foo(error, result) {
          foo(error, result);
          function bar(a, b) {
            console.log(a, b);
          }
        }`);
      const renamed = makeFunctionParametersUnique(source);
      expect(await formatSource(renamed)).to.deep.equal(
        await formatSource(`function foo(error_0, result_1) {
            foo(error_0, result_1);
            function bar(a_2, b_3) {
              console.log(a_2, b_3);
            }
          }`)
      );
    });

    it('only renames inside the active scope', async function () {
      const source = parseSource(`
        const error = null;
        function foo(error, result) {
          foo(error, result);
        }`);
      const renamed = makeFunctionParametersUnique(source);
      expect(await formatSource(renamed)).to.deep.equal(
        await formatSource(`
          const error = null;
          function foo(error_0, result_1) {
            foo(error_0, result_1);
          }`)
      );
    });

    it('handles shadowed variables properly', async function () {
      const source = parseSource(`function foo(error) {
          foo(error);
          function bar(error) {
            console.log(error);
          }
          bar(error);
        }`);
      const renamed = makeFunctionParametersUnique(source);
      expect(await formatSource(renamed)).to.deep.equal(
        await formatSource(`function foo(error_0) {
            foo(error_0);
            function bar(error_1) {
              console.log(error_1);
            }
            bar(error_0);
          }`)
      );
    });
  });

  describe('function expressions', function () {
    it('renames no parameters', async function () {
      const source = parseSource(`const foo = function () {
          foo();
        }`);
      const renamed = makeFunctionParametersUnique(source);
      expect(await formatSource(renamed)).to.deep.equal(
        await formatSource(`const foo = function () { foo(); }`)
      );
    });

    it('one parameter, no usage', async function () {
      const source = parseSource(`const foo = function (error) {
          foo();
        }`);
      const renamed = makeFunctionParametersUnique(source);
      expect(await formatSource(renamed)).to.deep.equal(
        await formatSource(`const foo = function (error_0) { foo(); }`)
      );
    });

    it('one parameter, with usage', async function () {
      const source = parseSource(`const foo = function (error) {
          foo(error);
        }`);
      const renamed = makeFunctionParametersUnique(source);
      expect(await formatSource(renamed)).to.deep.equal(
        await formatSource(`const foo = function (error_0) { foo(error_0); }`)
      );
    });

    it('two parameters, usage', async function () {
      const source = parseSource(`const foo = function (error, result) {
          foo(error, result);
        }`);
      const renamed = makeFunctionParametersUnique(source);
      expect(await formatSource(renamed)).to.deep.equal(
        await formatSource(`const foo = function (error_0, result_1) { foo(error_0, result_1); }`)
      );
    });

    it('two parameters, nested functions', async function () {
      const source = parseSource(`const foo = function (error, result) {
          foo(error, result);
          const bar = function (a, b) {
            console.log(a, b);
          }
        }`);
      const renamed = makeFunctionParametersUnique(source);
      expect(await formatSource(renamed)).to.deep.equal(
        await formatSource(`const foo = function (error_0, result_1) {
            foo(error_0, result_1);
            const bar = function (a_2, b_3) {
              console.log(a_2, b_3);
            }
          }`)
      );
    });

    it('only renames inside the active scope', async function () {
      const source = parseSource(`
        const error = null;
        const foo = function (error, result) {
          foo(error, result);
        }`);
      const renamed = makeFunctionParametersUnique(source);
      expect(await formatSource(renamed)).to.deep.equal(
        await formatSource(`
          const error = null;
          const foo = function (error_0, result_1) {
            foo(error_0, result_1);
          }`)
      );
    });

    it('handles shadowed variables properly', async function () {
      const source = parseSource(`const foo = function (error) {
          foo(error);
          const bar = function (error) {
            console.log(error);
          }
          bar(error);
        }`);
      const renamed = makeFunctionParametersUnique(source);
      expect(await formatSource(renamed)).to.deep.equal(
        await formatSource(`const foo = function (error_0) {
            foo(error_0);
            const bar = function (error_1) {
              console.log(error_1);
            }
            bar(error_0);
          }`)
      );
    });
  });

  describe('arrow functions with expression bodies', function () {
    it('renames no parameters', async function () {
      const source = parseSource(`const foo = () => foo()`);
      const renamed = makeFunctionParametersUnique(source);
      expect(await formatSource(renamed)).to.deep.equal(
        await formatSource(`const foo = () => foo()`)
      );
    });

    it('one parameter, no usage', async function () {
      const source = parseSource(`const foo = (error) => foo()`);
      const renamed = makeFunctionParametersUnique(source);
      expect(await formatSource(renamed)).to.deep.equal(
        await formatSource(`const foo = (error_0) => foo()`)
      );
    });

    it('one parameter, with usage', async function () {
      const source = parseSource(`const foo = (error) => foo(error)`);
      const renamed = makeFunctionParametersUnique(source);
      expect(await formatSource(renamed)).to.deep.equal(
        await formatSource(`const foo = (error_0) => foo(error_0)`)
      );
    });

    it('two parameters, usage', async function () {
      const source = parseSource(`const foo = (error, result) => foo(error, result)`);
      const renamed = makeFunctionParametersUnique(source);
      expect(await formatSource(renamed)).to.deep.equal(
        await formatSource(`const foo = (error_0, result_1) => foo(error_0, result_1)`)
      );
    });

    it('two parameters, nested functions', async function () {
      const source = parseSource(
        `const foo = (error, result) => (baz) => foo(error, result) && baz;`
      );
      const renamed = makeFunctionParametersUnique(source);
      expect(await formatSource(renamed)).to.deep.equal(
        await formatSource(
          `const foo = (error_0, result_1) => (baz_2) => foo(error_0, result_1) && baz_2;`
        )
      );
    });

    it('only renames inside the active scope', async function () {
      const source = parseSource(`
        const error = null;
        const foo = error => foo(error);`);
      const renamed = makeFunctionParametersUnique(source);
      expect(await formatSource(renamed)).to.deep.equal(
        await formatSource(`
          const error = null;
          const foo = error_0 => foo(error_0);`)
      );
    });

    it('handles shadowed variables properly', async function () {
      const source = parseSource(`const foo = error => error => error => console.log(error)`);
      const renamed = makeFunctionParametersUnique(source);
      expect(await formatSource(renamed)).to.deep.equal(
        await formatSource(`const foo = error_0 => error_1 => error_2 => console.log(error_2)`)
      );
    });
  });

  describe('arrow functions with statement bodies', function () {
    it('renames no parameters', async function () {
      const source = parseSource(`const foo = () => {
          foo();
        }`);
      const renamed = makeFunctionParametersUnique(source);
      expect(await formatSource(renamed)).to.deep.equal(
        await formatSource(`const foo = () => { foo(); }`)
      );
    });

    it('one parameter, no usage', async function () {
      const source = parseSource(`const foo = (error) => {
          foo();
        }`);
      const renamed = makeFunctionParametersUnique(source);
      expect(await formatSource(renamed)).to.deep.equal(
        await formatSource(`const foo = (error_0) => { foo(); }`)
      );
    });

    it('one parameter, with usage', async function () {
      const source = parseSource(`const foo = (error) => {
          foo(error);
        }`);
      const renamed = makeFunctionParametersUnique(source);
      expect(await formatSource(renamed)).to.deep.equal(
        await formatSource(`const foo = (error_0) => { foo(error_0); }`)
      );
    });

    it('two parameters, usage', async function () {
      const source = parseSource(`const foo = (error, result) => {
          foo(error, result);
        }`);
      const renamed = makeFunctionParametersUnique(source);
      expect(await formatSource(renamed)).to.deep.equal(
        await formatSource(`const foo = (error_0, result_1) => { foo(error_0, result_1); }`)
      );
    });

    it('two parameters, nested functions', async function () {
      const source = parseSource(`const foo = (error, result) => {
          foo(error, result);
          const bar = (a, b) =>  {
            console.log(a, b);
          }
        }`);
      const renamed = makeFunctionParametersUnique(source);
      expect(await formatSource(renamed)).to.deep.equal(
        await formatSource(`const foo = (error_0, result_1) => {
            foo(error_0, result_1);
            const bar = (a_2, b_3) => {
              console.log(a_2, b_3);
            }
          }`)
      );
    });

    it('only renames inside the active scope', async function () {
      const source = parseSource(`
        const error = null;
        const foo = (error, result) => {
          foo(error, result);
        }`);
      const renamed = makeFunctionParametersUnique(source);
      expect(await formatSource(renamed)).to.deep.equal(
        await formatSource(`
          const error = null;
          const foo = (error_0, result_1) => {
            foo(error_0, result_1);
          }`)
      );
    });

    it('handles shadowed variables properly', async function () {
      const source = parseSource(`const foo = (error) => {
          foo(error);
          const bar = (error) => {
            console.log(error);
          }
          bar(error);
        }`);
      const renamed = makeFunctionParametersUnique(source);
      expect(await formatSource(renamed)).to.deep.equal(
        await formatSource(`const foo = (error_0) => {
            foo(error_0);
            const bar = (error_1) => {
              console.log(error_1);
            }
            bar(error_0);
          }`)
      );
    });
  });
});
