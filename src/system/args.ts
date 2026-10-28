// CLI argument handling: reads `process.argv` and exposes the provided paths
// as an Effect. Fails with `NoArgsError` when no paths were given.

import { Array as Arr, Data, Effect } from 'effect'

// Tagged error raised when Curator is invoked without any path arguments.
// Carries no payload; its `message` is always "No arguments provided".
export class NoArgsError extends Data.TaggedError('NoArgsError')<{}> {
	get message() {
		return 'No arguments provided'
	}
}

// Read the user-supplied path arguments from `process.argv`, skipping the
// node executable and script name. Requires at least one argument, otherwise
// fails with `NoArgsError`.
export const getArgs = () =>
	Effect.sync(() => process.argv.slice(2)).pipe(
		Effect.filterOrFail(Arr.isArrayNonEmpty, () => new NoArgsError()),
	)
