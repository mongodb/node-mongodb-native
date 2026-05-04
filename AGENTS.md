# AGENTS.md

Guidance for AI coding agents working in this repository.

## Project Overview

This is the official MongoDB Node.js driver (`mongodb` npm package). It provides a TypeScript/JavaScript interface for applications to interact with MongoDB deployments. The driver implements the cross-driver MongoDB specifications.

## Related Repositories

- **[mongodb/specifications](https://github.com/mongodb/specifications)** — Cross-driver MongoDB specifications. **This is the source of truth** for behavior the driver must implement (CRUD, SDAM, CMAP, retryable reads/writes, sessions, transactions, change streams, CSFLE, etc.). Spec test fixtures (YAML/JSON) under `test/spec/` are copied from this repo and must not be hand-edited. When behavior is ambiguous, the spec wins; do not change behavior away from the spec without raising it there first.
- **[mongodb/js-bson](https://github.com/mongodb/js-bson)** — BSON serialization (`bson` npm package). Bug reports and changes that touch BSON encoding/decoding belong there.
- **Team-owned native/optional packages**: [`kerberos`](https://github.com/mongodb-js/kerberos) (GSSAPI), [`mongodb-client-encryption`](https://github.com/mongodb-js/mongodb-client-encryption) (libmongocrypt/CSFLE), [`zstd`](https://github.com/mongodb-js/zstd), [`saslprep`](https://github.com/mongodb-js/saslprep). Auth, encryption, and compression bugs are usually fixed in these repos, not the driver.

## Pointers

- **[CONTRIBUTING.md](./CONTRIBUTING.md)** — developer setup, VS Code config, PR process.
- **[test/readme.md](./test/readme.md)** — full testing guide (this file only covers the basics).
- **Jira: `NODE-XXXX`** — tickets live at [jira.mongodb.org/browse/NODE](https://jira.mongodb.org/browse/NODE). Used as the commit scope.
- **Node.js**: minimum supported version is in `package.json` `engines.node` (currently `>=20.19.0`).
- **Do not hand-edit**: `lib/` (build output), `mongodb.d.ts` (generated), `HISTORY.md` (release-please managed), `test/spec/` (vendored from specifications repo).

**Do not hand-edit**: `lib/` (build output), `mongodb.d.ts` (generated), `HISTORY.md` (release-please managed), `test/spec/` (vendored from specifications repo).

## Common Commands

### Building

```bash
npm run build:ts          # Compile TypeScript to lib/
npm run check:ts          # Type-check without emitting
```

### Linting

```bash
npm run check:eslint      # Run ESLint
npm run fix:eslint        # Auto-fix ESLint issues
```

### Testing

See [test/readme.md](./test/readme.md) for the full guide. Quick reference:

```bash
npm run check:unit                      # Unit tests (no database)
npm run check:test                      # Integration tests (requires running MongoDB)
npm run check:unit -- -g "pattern"      # Filter by name pattern
```

Integration tests need a local MongoDB; spin one up via `git submodule update --init` followed by `.evergreen/run-orchestration.sh` (see test README for env vars).

Mocha runs with a 60-second timeout. Integration tests use a custom metadata UI for filtering by topology, MongoDB version, auth, etc.:

```js
describe(
  'my test',
  { metadata: { requires: { topology: ['replicaset'], mongodb: '>=6.0' } } },
  function () {}
);
```

## Architecture

### Layered Design

```
Public API (MongoClient, Db, Collection, Cursors)
  → Operations (CRUD, Aggregation, Indexes, Bulk writes)
    → Sessions & Transactions
      → SDAM – Server Discovery And Monitoring (src/sdam/)
        → CMAP – Connection Management And Pooling (src/cmap/)
          → Wire Protocol & BSON serialization
```

### Key Source Directories

- **`src/operations/`** — Each database command is an `AbstractOperation` subclass. Operations declare aspects (retryable, read/write, explainable) via Symbols. `execute_operation.ts` is the central execution engine handling retries, sessions, server selection.
- **`src/sdam/`** — Topology discovery and monitoring. `topology.ts` manages servers, `server_selection.ts` picks the best server based on read preference and latency, `monitor.ts` sends periodic heartbeats.
- **`src/cmap/`** — Connection pooling per server, wire protocol encoding/decoding, authentication handshakes. `auth/` contains implementations for each auth mechanism (SCRAM, X.509, AWS, OIDC, Kerberos, PLAIN).
- **`src/cursor/`** — `AbstractCursor` base with lazy evaluation, async iteration, and streaming. Specialized cursors: `FindCursor`, `AggregationCursor`, `ChangeStreamCursor`, etc.
- **`src/bulk/`** — Ordered and unordered bulk write operations.
- **`src/client-side-encryption/`** — Auto-encryption and explicit encryption (CSFLE/Queryable Encryption).
- **`src/gridfs/`** — GridFS file storage using upload/download streams.

### Test Structure

- **`test/unit/`** — Mirrors `src/` structure. No database interaction, uses mocks.
- **`test/integration/`** — Real database tests organized by feature area.
- **`test/spec/`** — YAML/JSON test specifications from the cross-driver specs. Implemented by spec runners in integration tests. Files named `*.spec.test.ts` use standardized runners; `*.prose.test.ts` are hand-written prose test implementations.
- **`test/mongodb.ts`** — Central re-export of all `src/` internals for test access. Tests import from `../../mongodb` (or appropriate depth), never directly from `src/`.

## Code Conventions

- **Public API stability** — Anything exported from `src/index.ts` flows into the published `mongodb.d.ts` via api-extractor. Renaming, removing, or narrowing exported types/signatures is a breaking change; confirm with a maintainer before doing so.
- **No `export default`** — All exports must be named.
- **No TypeScript enums** — Use string unions or `as const` objects instead.
- **`src/`: no `node:` import prefix** — In source files, use bare module names (e.g., `import { setTimeout } from 'timers'`). Tests may use `node:` imports where allowed by the repo config.
- **`src/`: timer/process imports** — In source files, import `setTimeout`, `setInterval`, `clearTimeout`, `process`, etc. from their modules instead of using globals.
- **No `Buffer`** — Use `Uint8Array` in source code.
- **BSON imports** — Source code must import from `src/bson.ts`, not from the `bson` package directly.
- **Null/undefined checks** — Use loose equality (`== null`) not strict (`=== null` or `=== undefined`).
- **Type imports** — Use `import { type Foo }` (inline type imports).
- **`return await`** — Required in `src/` (enforced by `@typescript-eslint/return-await: always`).
- **Error messages** — Sentence case, no trailing period. Use driver-specific error types extending `MongoError`.
- **Formatting** — Prettier with single quotes, 2-space indentation, 100-char width, no trailing commas.

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/): `<type>(NODE-XXXX): <subject>`, where `NODE-XXXX` is the Jira ticket.

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`. Breaking changes use `!`: `feat(NODE-XXXX)!: description`.
