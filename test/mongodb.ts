/* eslint-disable @typescript-eslint/no-restricted-imports */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as process from 'node:process';
import * as vm from 'node:vm';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function printExports() {
  function* walk(root: string): Generator<string> {
    const directoryContents = fs.readdirSync(root);
    for (const filepath of directoryContents) {
      const fullPath = path.join(root, filepath);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        yield* walk(fullPath);
      } else if (stat.isFile()) {
        yield fullPath;
      }
    }
  }
  const driverSourceFiles = Array.from(walk(path.resolve(__dirname, '..', 'src')));

  for (const srcFile of driverSourceFiles) {
    console.log(`export * from '${path.relative(__dirname, srcFile)}';`);
  }
}

/**
 * Using node's require resolution logic this function will locate the entrypoint for the `'mongodb-legacy'` module,
 * then execute the `mongodb-legacy` module in a `vm` context that replaces the global require function with a custom
 * implementation. The custom version of `require` will return the local instance of the driver import (magically compiled by ts-node) when
 * the module specifier is 'mongodb' and otherwise defer to the normal require behavior to import relative files and stdlib modules.
 * Each of the legacy module's patched classes are placed on the input object.
 *
 * @param exportsToOverride - An object that is an import of the MongoDB driver to be modified by this function
 */
function importMongoDBLegacy(exportsToOverride: Record<string, unknown>) {
  const mongodbLegacyEntryPoint = require.resolve('mongodb-legacy');
  const mongodbLegacyLocation = path.dirname(mongodbLegacyEntryPoint);
  const mongodbLegacyIndex = fs.readFileSync(mongodbLegacyEntryPoint, {
    encoding: 'utf8'
  });

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const localMongoDB = require('../src/index');
  const ctx = vm.createContext({
    module: { exports: null },
    require: (mod: string) => {
      if (mod === 'mongodb') {
        return localMongoDB;
      } else if (mod.startsWith('.')) {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        return require(path.join(mongodbLegacyLocation, mod));
      }
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require(mod);
    }
  });
  vm.runInContext(mongodbLegacyIndex, ctx);

  const mongodbLegacy = ctx.module.exports;

  Object.defineProperty(exportsToOverride, 'Admin', { get: () => mongodbLegacy.Admin });
  Object.defineProperty(exportsToOverride, 'FindCursor', { get: () => mongodbLegacy.FindCursor });
  Object.defineProperty(exportsToOverride, 'ListCollectionsCursor', {
    get: () => mongodbLegacy.ListCollectionsCursor
  });
  Object.defineProperty(exportsToOverride, 'ListIndexesCursor', {
    get: () => mongodbLegacy.ListIndexesCursor
  });
  Object.defineProperty(exportsToOverride, 'AggregationCursor', {
    get: () => mongodbLegacy.AggregationCursor
  });
  Object.defineProperty(exportsToOverride, 'ChangeStream', {
    get: () => mongodbLegacy.ChangeStream
  });
  Object.defineProperty(exportsToOverride, 'Collection', { get: () => mongodbLegacy.Collection });
  Object.defineProperty(exportsToOverride, 'Db', { get: () => mongodbLegacy.Db });
  Object.defineProperty(exportsToOverride, 'GridFSBucket', {
    get: () => mongodbLegacy.GridFSBucket
  });
  Object.defineProperty(exportsToOverride, 'ClientSession', {
    get: () => mongodbLegacy.ClientSession
  });
  Object.defineProperty(exportsToOverride, 'MongoClient', { get: () => mongodbLegacy.MongoClient });
  Object.defineProperty(exportsToOverride, 'ClientSession', {
    get: () => mongodbLegacy.ClientSession
  });
  Object.defineProperty(exportsToOverride, 'GridFSBucketWriteStream', {
    get: () => mongodbLegacy.GridFSBucketWriteStream
  });
  Object.defineProperty(exportsToOverride, 'OrderedBulkOperation', {
    get: () => mongodbLegacy.OrderedBulkOperation
  });
  Object.defineProperty(exportsToOverride, 'UnorderedBulkOperation', {
    get: () => mongodbLegacy.UnorderedBulkOperation
  });
}

export * from '../src/admin';
export * from '../src/bson';
export * from '../src/bulk/common';
export * from '../src/bulk/ordered';
export * from '../src/bulk/unordered';
export * from '../src/change_stream';
export * from '../src/cmap/auth/auth_provider';
export * from '../src/cmap/auth/aws_temporary_credentials';
export * from '../src/cmap/auth/gssapi';
export * from '../src/cmap/auth/mongo_credentials';
export * from '../src/cmap/auth/mongocr';
export * from '../src/cmap/auth/mongodb_aws';
export * from '../src/cmap/auth/mongodb_oidc';
export * from '../src/cmap/auth/mongodb_oidc/azure_machine_workflow';
export * from '../src/cmap/auth/mongodb_oidc/callback_workflow';
export * from '../src/cmap/auth/mongodb_oidc/gcp_machine_workflow';
export * from '../src/cmap/auth/mongodb_oidc/machine_workflow';
export * from '../src/cmap/auth/mongodb_oidc/token_machine_workflow';
export * from '../src/cmap/auth/plain';
export * from '../src/cmap/auth/providers';
export * from '../src/cmap/auth/scram';
export * from '../src/cmap/auth/x509';
export * from '../src/cmap/command_monitoring_events';
export * from '../src/cmap/commands';
export * from '../src/cmap/connect';
export * from '../src/cmap/connection';
export * from '../src/cmap/connection_pool';
export * from '../src/cmap/connection_pool_events';
export * from '../src/cmap/errors';
export * from '../src/cmap/handshake/client_metadata';
export * from '../src/cmap/metrics';
export * from '../src/cmap/stream_description';
export * from '../src/cmap/wire_protocol/compression';
export * from '../src/cmap/wire_protocol/constants';
export * from '../src/cmap/wire_protocol/on_demand/document';
export * from '../src/cmap/wire_protocol/responses';
export * from '../src/cmap/wire_protocol/shared';
export * from '../src/collection';
export * from '../src/connection_string';
export * from '../src/constants';
export * from '../src/cursor/abstract_cursor';
export * from '../src/cursor/aggregation_cursor';
export * from '../src/cursor/change_stream_cursor';
export * from '../src/cursor/find_cursor';
export * from '../src/cursor/list_collections_cursor';
export * from '../src/cursor/list_indexes_cursor';
export * from '../src/cursor/run_command_cursor';
export * from '../src/db';
export * from '../src/deps';
export * from '../src/encrypter';
export * from '../src/error';
export * from '../src/explain';
export * from '../src/gridfs/download';
export * from '../src/gridfs/index';
export * from '../src/gridfs/upload';
export * from '../src/mongo_client';
export * from '../src/mongo_logger';
export * from '../src/mongo_types';
export * from '../src/operations/aggregate';
export * from '../src/operations/bulk_write';
export * from '../src/operations/client_bulk_write/command_builder';
export * from '../src/operations/client_bulk_write/common';
export * from '../src/operations/collections';
export * from '../src/operations/command';
export * from '../src/operations/count';
export * from '../src/operations/create_collection';
export * from '../src/operations/delete';
export * from '../src/operations/distinct';
export * from '../src/operations/drop';
export * from '../src/operations/estimated_document_count';
export * from '../src/operations/execute_operation';
export * from '../src/operations/find';
export * from '../src/operations/find_and_modify';
export * from '../src/operations/get_more';
export * from '../src/operations/indexes';
export * from '../src/operations/insert';
export * from '../src/operations/is_capped';
export * from '../src/operations/kill_cursors';
export * from '../src/operations/list_collections';
export * from '../src/operations/list_databases';
export * from '../src/operations/operation';
export * from '../src/operations/options_operation';
export * from '../src/operations/profiling_level';
export * from '../src/operations/remove_user';
export * from '../src/operations/rename';
export * from '../src/operations/run_command';
export * from '../src/operations/search_indexes/create';
export * from '../src/operations/search_indexes/drop';
export * from '../src/operations/search_indexes/update';
export * from '../src/operations/set_profiling_level';
export * from '../src/operations/stats';
export * from '../src/operations/update';
export * from '../src/operations/validate_collection';
export * from '../src/read_concern';
export * from '../src/read_preference';
export * from '../src/resource_management';
export * from '../src/sdam/common';
export * from '../src/sdam/events';
export * from '../src/sdam/monitor';
export * from '../src/sdam/server';
export * from '../src/sdam/server_description';
export * from '../src/sdam/server_selection';
export * from '../src/sdam/srv_polling';
export * from '../src/sdam/topology';
export * from '../src/sdam/topology_description';
export * from '../src/sessions';
export * from '../src/sort';
export * from '../src/timeout';
export * from '../src/transactions';
export * from '../src/utils';
export * from '../src/write_concern';

// Must be last for precedence
export * from '../src/index';

/**
 * TODO(NODE-4979): ENABLE_MONGODB_LEGACY is 'true' by default for now
 */
const ENABLE_MONGODB_LEGACY =
  typeof process.env.ENABLE_MONGODB_LEGACY === 'string' && process.env.ENABLE_MONGODB_LEGACY !== ''
    ? process.env.ENABLE_MONGODB_LEGACY
    : 'true';

if (ENABLE_MONGODB_LEGACY === 'true') {
  // Override our own exports with the legacy patched ones
  importMongoDBLegacy(module.exports);
}
