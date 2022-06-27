import { readFileSync } from 'fs';
import * as path from 'path';

export const printSyncAPI = () => {
  const api = JSON.parse(
    readFileSync(path.resolve(__dirname, '../../../etc/api.json'), { encoding: 'utf8' })
  );
  const packageMembers = api.members[0].members;
  const syncAPIs = new Map(
    packageMembers
      .filter(({ kind }) => kind === 'Class')
      .filter(({ releaseTag }) => releaseTag === 'Public')
      .map(({ name, members }) => [
        name,
        [
          ...members
            .filter(({ kind }) => kind === 'Method')
            .filter(({ releaseTag }) => releaseTag === 'Public')
            .reduce((map, method) => {
              if (map.has(method.name)) {
                const overloads = map.get(method.name);
                overloads.push(method);
              } else {
                map.set(method.name, [method]);
              }
              return map;
            }, new Map<string, { name: string; excerptTokens: any[] }[]>())
            .entries()
        ].filter(([, tokens]) => {
          const excerptTokens = tokens.flatMap(({ excerptTokens }) => excerptTokens);
          const asyncMethod = excerptTokens.filter(({ text }) => text === 'Promise').length > 0;
          return !asyncMethod;
        })
      ])
      .filter(([, methods]) => methods.length > 0)
  );

  const apis: Array<[string, string[]]> = Array.from(syncAPIs.entries()) as any;

  console.log('-------------sync api-------------\n');
  for (const [owner, methods] of apis) {
    console.log(owner);
    for (const [method] of methods) {
      console.log(`  .${method}()`);
    }
  }
};

export const printAsyncAPI = () => {
  const api = JSON.parse(
    readFileSync(path.resolve(__dirname, '../../../etc/api.json'), { encoding: 'utf8' })
  );
  const packageMembers = api.members[0].members;
  const asyncAPIs = new Map(
    packageMembers
      .filter(({ kind }) => kind === 'Class')
      .filter(({ releaseTag }) => releaseTag === 'Public')
      .map(({ name, members }) => [
        name,
        [
          ...new Set(
            members
              .filter(({ kind }) => kind === 'Method')
              .filter(({ releaseTag }) => releaseTag === 'Public')
              .filter(
                ({ excerptTokens }) =>
                  excerptTokens.filter(({ text }) => text === 'Promise').length > 0
              )
              .map(({ name }) => name)
          )
        ]
      ])
      .filter(([, methods]) => methods.length > 0)
  );

  const apis: Array<[string, string[]]> = Array.from(asyncAPIs.entries()) as any;

  console.log('-------------async api-------------\n');
  for (const [owner, methods] of apis) {
    console.log(owner);
    for (const method of methods) {
      console.log(`  async ${method}()`);
    }
  }
};

printAsyncAPI();
console.log();
printSyncAPI();
