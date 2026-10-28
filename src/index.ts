// Entry point: wire CLI args -> scan -> classify each photo. Successes are quiet
// (except progress logging); errors are reported via `reportError`.

import { Effect, Result } from 'effect'
import { OllamaClientLive, classifyPhoto } from './ai/ollama.ts'
import { collectPhotos } from './filesystem/scan.ts'
import { getArgs } from './system/args.ts'

// Read an integer-valued concurrency setting from an environment variable.
// Empty, non-numeric, or non-positive values fall back to `fallback`.
const readConcurrency = (environmentVariable: string, fallback: number): number => {
	const rawValue = process.env[environmentVariable]
	if (!rawValue) {
		return fallback
	}
	const parsed = Number.parseInt(rawValue, 10)
	return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

const main = async () => {
	// Concurrency is configurable via environment variables.
	const scanConcurrency = readConcurrency('CURATOR_SCAN_CONCURRENCY', 1)
	const classificationConcurrency = readConcurrency('CURATOR_CLASSIFICATION_CONCURRENCY', 1)

	await Effect.runPromise(
		Effect.provide(
			getArgs().pipe(
				// Step 1: collect JPEG paths for each user-supplied path.
				Effect.flatMap(scanPaths =>
					Effect.forEach(scanPaths, scanPath => collectPhotos(scanPath, scanConcurrency)).pipe(
						Effect.map(photoLists => photoLists.flat()),
					),
				),
				// Step 2: classify and persist every collected photo.
				Effect.flatMap(photos => {
					console.log(`Found ${photos.length} photo(s).`)

					const total = photos.length
					let completed = 0
					const failures: unknown[] = []

					return Effect.forEach(
						photos,
						photo =>
							// `Effect.result` turns failures into values so one bad photo
							// does not abort the whole batch; failures are collected.
							Effect.flatMap(Effect.result(classifyPhoto(photo)), outcome => {
								if (Result.isFailure(outcome)) {
									failures.push(outcome.failure)
									return Effect.void
								}
								return Effect.sync(() => {
									completed += 1
									console.log(`Completed ${completed}/${total}`)
								})
							}),
						{ concurrency: classificationConcurrency },
					).pipe(
						// After all photos, fail if any classification failed.
						Effect.flatMap(() =>
							failures.length > 0 ? Effect.fail(failures[0] as Error) : Effect.void,
						),
					)
				}),
				// Translate success/failure into side effects and exit code.
				Effect.match({
					onFailure: error => {
						reportError(error)
						process.exitCode = 1
					},
					onSuccess: () => {},
				}),
			),
			// Provide the live Ollama client implementation.
			OllamaClientLive,
		),
	)
}

main()
