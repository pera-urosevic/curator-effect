# Curator

Curator scans one or more paths for JPEG images, classifies each image with a local
Ollama model, and writes the resulting description and tags into the image's IPTC
metadata with `exiftool`.

## Technical details

- Built with Effect, using tagged errors (`NoArgsError`, `OllamaError`, `IptcError`),
  services (`OllamaClient`), and layers (`OllamaClientLive`).
- JPEG collection is recursive and returns sorted paths.
- Symlinked directories are skipped to avoid infinite traversal.
- Ollama classification uses model `gemma4:e4b`, `think: false`, and a JSON schema for
  `tags` and `description`.
- Tags are trimmed, lowercased, de-duplicated, and empty values are removed;
  descriptions are trimmed.
- Transient Ollama and `exiftool` failures are retried with bounded exponential backoff.
- `exiftool` is invoked with `execFile`, so exiftool arguments are not passed through a
  shell.
- Errors are logged to `errors.log` without masking the original failure.

## Prerequisites

- Node.js with ESM support
- `tsx` (installed with `pnpm add -D tsx`)
- `pnpm` 12.15.0 or compatible
- `exiftool` available on `PATH`
- A running Ollama daemon with the `gemma4:e4b` model available

## Installation

```bash
pnpm install
```

## Usage

Run Curator with one or more files or directories:

```bash
tsx src/index.ts <path...>
```

Or via the package script:

```bash
pnpm dev -- <path...>
```

Examples:

```bash
tsx src/index.ts ./Photos
tsx src/index.ts ./a.jpg ./b.jpeg ./Photos
```

If `tsx` is not installed globally, install it as a development dependency:

```bash
pnpm add -D tsx
```

Supported image extensions are `.jpg` and `.jpeg` (case-insensitive). Directories are
scanned recursively.

## Configuration

Concurrency and error logging can be adjusted with environment variables:

- `CURATOR_SCAN_CONCURRENCY` — maximum number of directories scanned concurrently.
  Default: `1`.
- `CURATOR_CLASSIFICATION_CONCURRENCY` — maximum number of images classified
  concurrently. Default: `1`.
- `CURATOR_ERROR_LOG` — path to the error log file. Default: `errors.log`.

## Example output

```
Found 58 photo(s).

Photos/Baristas/20251030_151719.jpg
description: Two men are engaged in a discussion over professional coffee-making equipment, suggesting a training or demonstration session in a coffee preparation setting.
tags: coffee,barista,coffee machine,roasting,cafe,learning,equipment
Completed 1/58

Photos/Baristas/20251030_152157.jpg
description: A man is actively preparing espresso using professional coffee equipment while standing in what appears to be a cafe setting.
tags: coffee,espresso machine,barista,cafe,espresso,coffee preparation,bar equipment
Completed 2/58

Photos/Baristas/20251030_152158.jpg
description: Three men are gathered around a professional espresso machine in what appears to be a cafe or equipment showroom.
tags: coffee equipment,espresso machine,cafe,barista,people,workshop
Completed 3/58

...
```

## Error handling

Non-fatal scan problems (such as a missing or unreadable path) and processing failures
are appended to `errors.log` using a timestamped format. The error log path can be
overridden with `CURATOR_ERROR_LOG`.

On failure, Curator prints a concise error, including a cause chain when available, sets
the process exit code to `1`.

## Development

```bash
pnpm test              # run tests
pnpm test:watch        # run tests in watch mode
pnpm typecheck         # run tsc --noEmit
pnpm dev -- <paths>    # run the CLI
```

Tests are hermetic and do not require Ollama, `exiftool`, or network access.
