import { loadSpecTests } from '../../spec';
import { executeUriValidationTest } from '../../tools/uri_spec_runner';

describe('URI option spec tests', function () {
  const suites = loadSpecTests('uri-options');

  const skipTests = [
    // TODO: fix?
    'directConnection=true with multiple seeds',
    'loadBalanced=true with directConnection=false causes an error',

    // TODO:? serverSelectionTryOnce is not implemented, should it be?
    'Valid options specific to single-threaded drivers are parsed correctly',

    // TODO?: need to implement test to have the files in the correct place in order to make sure it doesn't throw
    'Valid required tls options are parsed correctly',

    // TODO?: need to implement tls validation
    'tlsInsecure and tlsAllowInvalidCertificates both present (and true) raises an error',
    'tlsInsecure and tlsAllowInvalidCertificates both present (and false) raises an error',
    'tlsAllowInvalidCertificates and tlsInsecure both present (and true) raises an error',
    'tlsAllowInvalidCertificates and tlsInsecure both present (and false) raises an error',
    'tlsAllowInvalidHostnames and tlsInsecure both present (and true) raises an error',
    'tlsAllowInvalidHostnames and tlsInsecure both present (and false) raises an error',
    'tlsInsecure and tlsAllowInvalidHostnames both present (and true) raises an error',
    'tlsInsecure and tlsAllowInvalidHostnames both present (and false) raises an error',

    // TODO?: have not implemented option support
    'tlsDisableCertificateRevocationCheck can be set to true',
    'tlsDisableCertificateRevocationCheck can be set to false',
    'tlsDisableOCSPEndpointCheck can be set to true',
    'tlsDisableOCSPEndpointCheck can be set to false',

    // TODO?: read preference tag issue: parsing rack:1 as rack:true
    'Valid read preference options are parsed correctly'
  ];

  // TODO: make these throw
  const testsThatDoNotThrowOnWarn = [
    'Too high zlibCompressionLevel causes a warning',
    'Too low zlibCompressionLevel causes a warning',
    'Invalid loadBalanced value'
  ];

  for (const suite of suites) {
    describe(suite.name, function () {
      for (const test of suite.tests) {
        it(`${test.description}`, function () {
          if (skipTests.includes(test.description)) {
            return this.skip();
          }

          executeUriValidationTest(
            test,
            testsThatDoNotThrowOnWarn.some(t => t === test.description)
          );
        });
      }
    });
  }
});
