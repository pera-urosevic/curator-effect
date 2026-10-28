# AGENTS.md

## Project overview

- Name: `curator`, a CLI that scans paths for JPEG images, classifies each image with a local Ollama model, and writes the resulting description and tags into IPTC metadata via `exiftool`.
- Runtime: Node.js, ESM. Package manager: `pnpm` 12.15.0 (see `devEngines`).
- Dependencies: `effect`, `ollama`. Dev: `typescript`, `vitest`, `vite`.
- Prerequisites: `exiftool` on PATH, a running Ollama daemon, and the chosen model available.

## Directory layout

```
src/
	entry point and module wiring
	system/     CLI argument handling
	filesystem/ file scanning and metadata helpers
	ai/         Ollama client and classification orchestration
	meta/       exiftool/IPTC writing
	*.test.ts   co-located tests
```

## Dev workflow

- Install: `pnpm install`
- Tests: `pnpm test` (watch: `pnpm test:watch`)
- Type check: `pnpm exec tsc --noEmit`
- Format: `pnpm exec prettier --check .` / `pnpm exec prettier --write .`
- Run: node entry point with paths; requires `exiftool` and Ollama.
- Always add and check tests for any change.
- Always check TypeScript before finishing.

## Code conventions

- Formatting follows `.prettierrc` (tabs, 100 cols, no semicolons, single quotes, trailing commas, LF).
- ESM with NodeNext resolution and explicit TypeScript extensions in relative imports.
- Strict TypeScript (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`).
- Errors are tagged and carry a message.
- Services follow the Effect pattern with context services and layers.
- Async work is wrapped and failures normalized to domain errors.
- Logging at boundaries.

## Architecture

- Entry wires CLI args -> scan -> classify each photo, provisioned with the Ollama client; progress and classification results are printed to stdout, errors are reported (with their cause chain) to stderr.
- Args module reads process arguments and fails when none given.
- Scan module is stat-based and recursive, collecting supported JPEG extensions case-insensitively; missing paths return empty.
- AI module reads images, base64-encodes them, calls Ollama with a JSON schema, decodes/normalizes results, then triggers IPTC writing.
- Metadata module builds exiftool arguments and invokes it, clearing keywords when none.

## Testing

- Vitest in node environment; tests co-located with source.
- Effect code tested via run helpers.
- External side effects are mocked; filesystem tests use temp dirs and clean up.
- Service tests provide test layers.
- Tests stay deterministic and hermetic; no dependency on Ollama/exiftool/network.
