// System-level helpers for recording failures that occur while Curator runs.
// Failures are appended to a log file so the original error is never masked by
// logging itself.

import { appendFileSync } from 'node:fs'
import { NoArgsError } from './args.ts'

// Resolve the destination of the error log. Callers can override the default
// `errors.log` location by setting the `CURATOR_ERROR_LOG` environment variable.
const getErrorLogPath = (): string => process.env.CURATOR_ERROR_LOG || 'errors.log'

// Append a single timestamped failure message to the error log.
// Logging is best-effort: any failure while writing is swallowed so that the
// original error reported to the user is never replaced by a logging error.
export const appendErrorLog = (message: string): void => {
	try {
		appendFileSync(getErrorLogPath(), `${new Date().toISOString()} ${message}\n`)
	} catch {
		// Logging must never mask the original failure.
	}
}

// Print an error (plus any cause chain) to stderr and append it to the error
// log. Sets the process exit code separately, outside this function.
const reportError = (error: unknown): void => {
	const message = error instanceof Error ? error.message : String(error)
	const logLines = [`Error: ${message}`]
	console.error(`Error: ${message}`)

	// NoArgsError gets an extra usage hint.
	if (error instanceof NoArgsError) {
		logLines.push('Usage: curator <path...>')
		console.error('Usage: curator <path...>')
	}

	// Walk the causal chain (up to 10 levels) for nested failures.
	const seen = new Set<unknown>()
	let cause = (error as { cause?: unknown } | null | undefined)?.cause
	let depth = 0
	while (cause !== undefined && cause !== null && depth < 10 && !seen.has(cause)) {
		seen.add(cause)
		const causeMessage = cause instanceof Error ? cause.message : String(cause)
		logLines.push(`Caused by: ${causeMessage}`)
		console.error(`Caused by: ${causeMessage}`)
		cause = (cause as { cause?: unknown } | null | undefined)?.cause
		depth++
	}

	// Best-effort persistence of the full message to the error log.
	appendErrorLog(logLines.join(' | '))
}
