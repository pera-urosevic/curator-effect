// Metadata writing: invokes `exiftool` to store a description and tags into a
// JPEG's IPTC fields. Uses `execFile` (no shell) and retries transient failures.

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { Data, Effect, Schedule } from 'effect'

// Tagged error raised when an `exiftool` invocation fails. Preserves the
// underlying cause (for example the process error or timeout).
export class IptcError extends Data.TaggedError('IptcError')<{ readonly cause?: unknown }> {
	constructor(props?: { readonly cause?: unknown }) {
		super(props ?? {})
	}

	get message() {
		return 'IPTC write failed'
	}
}

// Promisified version of `execFile` used for async/await inside the Effect.
const execFileAsync = promisify(execFile)

// Write `description` and `tags` into the IPTC metadata of `filePath`.
// When `tags` is empty, the Keywords field is explicitly cleared.
// Retries up to two times with exponential backoff on failure.
export const writeIPTC = (
	filePath: string,
	description: string,
	tags: string[],
): Effect.Effect<void, IptcError> =>
	Effect.tryPromise({
		try: async () => {
			// Echo the planned write to stdout for user feedback.
			console.log(`\n${filePath}\ndescription: ${description}\ntags: ${tags}`)

			// `-overwrite_original` avoids leaving `_original` backup files behind.
			const args = ['-overwrite_original']

			if (tags.length === 0) {
				// An empty value clears the Keywords field entirely.
				args.push('-IPTC:Keywords=')
			} else {
				// One `-IPTC:Keywords=...` argument per tag.
				for (const tag of tags) {
					args.push(`-IPTC:Keywords=${tag}`)
				}
			}

			args.push(`-IPTC:Caption-Abstract=${description}`)
			args.push(filePath)

			// 30-second timeout guards against hung exiftool processes.
			await execFileAsync('exiftool', args, { timeout: 30000 })
		},
		catch: cause => new IptcError({ cause }),
	}).pipe(
		Effect.retry({
			times: 2,
			schedule: Schedule.exponential('250 millis'),
		}),
	)
