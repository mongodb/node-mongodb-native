import { execSync } from 'child_process';

export const mochaHooks = {
  beforeAll() {
    console.log(`Installed dependencies:\n${execSync('npm ls').toString()}`);
  }
};
