# AGENTS.md

This file provides guidance to AI coding agents (Claude Code, Codex, Copilot, Cursor, Aider, etc.) when working with code in this repository.

## Project Overview

This is the official MongoDB Node.js driver (`mongodb` npm package). It provides a TypeScript/JavaScript interface for applications to interact with MongoDB deployments. The driver implements the cross-driver MongoDB specifications.

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

Integration tests require a running MongoDB instance (unit tests do not). To start one locally:

```bash
git submodule update --init
export DRIVERS_TOOLS=$(pwd)/drivers-evergreen-tools
VERSION='latest' TOPOLOGY='replica_set' bash .evergreen/run-orchestration.sh
source mo-expansion.sh
```

```bash
npm run check:unit        # Unit tests (no database required)
npm run check:test        # Integration tests (requires database)
npm test                  # Full check (lint + d.ts/tsd) + unit + integration

# Run a single test by name pattern
npm run check:unit -- -g "pattern"
npm run check:test -- -g "pattern"
```

Tests use Mocha with 60-second timeout. Integration tests use a custom metadata UI that supports test filtering by topology, MongoDB version, auth, etc. via metadata:

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

### How Operations Execute

1. User calls a method (e.g., `collection.insertOne()`)
2. An operation object is created (e.g., `InsertOperation`)
3. `executeOperation()` handles: implicit session creation → server selection → connection checkout → command building → wire protocol send → response handling → retry on transient errors
4. Connection returned to pool, session cleaned up

### Test Structure

- **`test/unit/`** — Mirrors `src/` structure. No database interaction, uses mocks.
- **`test/integration/`** — Real database tests organized by feature area.
- **`test/spec/`** — YAML/JSON test specifications from the cross-driver specs. Implemented by spec runners in integration tests. Files named `*.spec.test.ts` use standardized runners; `*.prose.test.ts` are hand-written prose test implementations.
- **`test/mongodb.ts`** — Central re-export of all `src/` internals for test access. Tests import from `../../mongodb` (or appropriate depth), never directly from `src/`.

## Code Conventions

- **No `export default`** — All exports must be named.
- **No TypeScript enums** — Use string unions or `as const` objects instead.
- **No `node:` import prefix** — Use bare module names (e.g., `import { setTimeout } from 'timers'`).
- **Timer/process imports** — Must import `setTimeout`, `setInterval`, `clearTimeout`, `process`, etc. from their modules, not use globals.
- **No `Buffer`** — Use `Uint8Array` in source code.
- **BSON imports** — Source code must import from `src/bson.ts`, not from the `bson` package directly.
- **Null/undefined checks** — Use loose equality (`== null`) not strict (`=== null` or `=== undefined`).
- **Type imports** — Use `import { type Foo }` (inline type imports).
- **`return await`** — Required in `src/` (enforced by `@typescript-eslint/return-await: always`).
- **Error messages** — Sentence case, no trailing period. Use driver-specific error types extending `MongoError`.
- **Formatting** — Prettier with single quotes, 2-space indentation, 100-char width, no trailing commas.

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/): `<type>(NODE-XXXX): <subject>`

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`

Breaking changes use `!`: `feat(NODE-XXXX)!: description`
