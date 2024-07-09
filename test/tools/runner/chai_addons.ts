/* eslint-disable @typescript-eslint/no-var-requires */

import chai = require('chai');

chai.use(require('sinon-chai'));
chai.use(require('chai-subset'));
chai.use(require('../spec-runner/matcher').default);

chai.config.truncateThreshold = 0;
