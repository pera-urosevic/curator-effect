import { Effect } from 'effect'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getArgs, NoArgsError } from './args.ts'

describe('NoArgsError', () => {
	it('has the expected tag and message', () => {
		const error = new NoArgsError()

		expect(error._tag).toBe('NoArgsError')
		expect(error.message).toBe('No arguments provided')
	})
})

describe('getArgs', () => {
	let originalArgv: string[]

	beforeEach(() => {
		originalArgv = process.argv
	})

	afterEach(() => {
		process.argv = originalArgv
	})

	it('returns the provided arguments', () => {
		process.argv = ['node', 'script', '--foo', 'bar', 'baz']

		const result = Effect.runSync(getArgs())

		expect(result).toEqual(['--foo', 'bar', 'baz'])
	})

	it('fails when no arguments are provided', async () => {
		process.argv = ['node', 'script']

		await expect(Effect.runPromise(getArgs())).rejects.toThrow('No arguments provided')
	})
})
