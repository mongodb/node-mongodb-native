import { unlinkSync, writeFileSync } from 'fs';

import { loadSpecTests } from '../../spec';
import { executeUriValidationTest } from '../../tools/uri_spec_runner';

describe('URI option spec tests', function () {
  const suites = loadSpecTests('uri-options');

  const skipTests = [
    // Skipped because this does not apply to Node
    'Valid options specific to single-threaded drivers are parsed correctly',

    // These options are specific to OCSP which the driver does not implement
    // and will not be implemented in the future.
    'tlsDisableCertificateRevocationCheck can be set to true',
    'tlsDisableCertificateRevocationCheck can be set to false',
    'tlsDisableOCSPEndpointCheck can be set to true',
    'tlsDisableOCSPEndpointCheck can be set to false',

    // NOTE(NODE-3989): Skipped because we now only accept true/false for boolean options. The spec expects us to
    // warn on other accepted but deprecated values, but as of NODE-3989, we now throw on these
    // values
    'Invalid loadBalanced value'
  ];

  const testsThatDoNotThrowOnWarn = [
    // TODO(NODE-3923): compression option validation
    'Too high zlibCompressionLevel causes a warning',
    'Too low zlibCompressionLevel causes a warning'
  ];

  for (const suite of suites) {
    describe(suite.name, function () {
      // set up files for tlsCAfile and tlsCertificateKeyFile
      // until we implement NODE-3924, the contents of the files is what is stored
      // in the corresponding properties, so we make the contents equal the file names
      // for the sake of the test expectations
      before(() => {
        writeFileSync('ca.pem', 'ca.pem');
        writeFileSync('cert.pem', 'cert.pem');
      });

      after(() => {
        unlinkSync('ca.pem');
        unlinkSync('cert.pem');
      });

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
