/* eslint-disable @typescript-eslint/no-require-imports */
import chai = require('chai');

chai.use(require('sinon-chai').default);
chai.use(require('chai-subset'));
chai.use(require('../spec-runner/matcher').default);

chai.config.truncateThreshold = 0;
