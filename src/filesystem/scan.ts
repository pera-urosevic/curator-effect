// Recursive JPEG discovery. Stat-based: a missing/unreadable path returns an
// empty list instead of failing the whole run. Symlinked directories are
// skipped (they are not reported as directories by `Dirent.isDirectory`).

import { Effect } from 'effect'
import { readdir, stat } from 'node:fs/promises'
import type { Dirent, Stats } from 'node:fs'
import { extname, join } from 'node:path'
import { appendErrorLog } from '../system/errors.ts'

// Recognised JPEG extensions, matched case-insensitively via `extname`.
const isJpegPath = (path: string): boolean => {
	const extension = extname(path).toLowerCase()
	return extension === '.jpg' || extension === '.jpeg'
}

// Run many async tasks with a bounded number of concurrent workers.
// A non-finite or too-small concurrency value is clamped to at least one
// worker; the worker count never exceeds the number of items.
export const runWithConcurrency = async <T>(
	items: readonly T[],
	worker: (item: T) => Promise<void>,
	concurrency: number,
): Promise<void> => {
	// Nothing to do for an empty input list.
	if (items.length === 0) {
		return
	}

	// Normalise and clamp concurrency to a sane, in-range worker count.
	const normalizedConcurrency = Number.isFinite(concurrency) ? Math.floor(concurrency) : 1
	const workerCount = Math.min(Math.max(1, normalizedConcurrency), items.length)
	let nextIndex = 0

	// Spawn `workerCount` independent async loops that pull the next index
	// atomically (single-threaded JS, so the read/increment is safe).
	await Promise.all(
		Array.from({ length: workerCount }, async () => {
			while (true) {
				const index = nextIndex
				nextIndex += 1
				// No more items: this worker exits.
				if (index >= items.length) {
					return
				}
				const item = items[index]
				// Guard against holes in the input array.
				if (item === undefined) {
					continue
				}
				await worker(item)
			}
		}),
	)
}

// Internal recursive collection implementation. Returns sorted JPEG paths
// found under `inputPath`, or `[]` when the path cannot be accessed.
const collectAsync = async (inputPath: string, concurrency: number): Promise<string[]> => {
	let inputStats: Stats
	try {
		inputStats = await stat(inputPath)
	} catch (error) {
		// Record the access failure but do not propagate it.
		appendErrorLog(
			`Failed to access path "${inputPath}": ${error instanceof Error ? error.message : String(error)}`,
		)
		return []
	}
	// A single JPEG file is returned as the sole result.
	if (inputStats.isFile()) {
		return isJpegPath(inputPath) ? [inputPath] : []
	}
	// Anything that is not a file or directory (sockets, devices, etc.) is ignored.
	if (!inputStats.isDirectory()) {
		return []
	}

	const collected: string[] = []
	const visit = async (directory: string): Promise<void> => {
		let entries: Dirent[]
		try {
			entries = await readdir(directory, { withFileTypes: true })
		} catch (error) {
			// Unreadable directories are logged and skipped.
			appendErrorLog(
				`Failed to read directory "${directory}": ${error instanceof Error ? error.message : String(error)}`,
			)
			return
		}
		const childDirectories: string[] = []
		// Partition the directory entries into JPEG files and subdirectories.
		for (const entry of entries) {
			const childPath = join(directory, entry.name)
			if (entry.isDirectory()) {
				childDirectories.push(childPath)
			} else if (entry.isFile() && isJpegPath(childPath)) {
				collected.push(childPath)
			}
		}

		// Recurse into subdirectories with bounded concurrency.
		await runWithConcurrency(childDirectories, visit, concurrency)
	}
	await visit(inputPath)

	// Deterministic, sorted output for stable reporting and testing.
	collected.sort()
	return collected
}

// Public Effect wrapper around the async collection logic.
// `concurrency` defaults to `1` when omitted.
export const collectPhotos = (scanPath: string, concurrency = 1): Effect.Effect<string[]> =>
	Effect.promise(() => collectAsync(scanPath, concurrency))
