import { execFile } from 'node:child_process'
import { Effect } from 'effect'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IptcError, writeIPTC } from './iptc.ts'

vi.mock('node:child_process', () => ({
	execFile: vi.fn(),
}))

describe('writeIPTC', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		vi.mocked(execFile as any).mockImplementation(
			(
				_command: string,
				_args: string[],
				_options: unknown,
				callback: (error: Error | null, stdout: string, stderr: string) => void,
			) => {
				callback(null, '', '')
			},
		)
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	it('calls exiftool with the expected arguments', async () => {
		await Effect.runPromise(
			writeIPTC('/tmp/photo.jpg', 'A sunset over the beach', ['Sunset', 'Beach']),
		)

		expect(execFile).toHaveBeenCalledWith(
			'exiftool',
			[
				'-overwrite_original',
				'-IPTC:Keywords=Sunset',
				'-IPTC:Keywords=Beach',
				'-IPTC:Caption-Abstract=A sunset over the beach',
				'/tmp/photo.jpg',
			],
			{ timeout: 30000 },
			expect.any(Function),
		)
	})

	it('clears keywords when there are no tags', async () => {
		await Effect.runPromise(writeIPTC('/tmp/photo.jpg', 'desc', []))

		expect(execFile).toHaveBeenCalledWith(
			'exiftool',
			[
				'-overwrite_original',
				'-IPTC:Keywords=',
				'-IPTC:Caption-Abstract=desc',
				'/tmp/photo.jpg',
			],
			{ timeout: 30000 },
			expect.any(Function),
		)
	})

	it('fails when exiftool fails', async () => {
		vi.mocked(execFile as any).mockImplementation(
			(
				_command: string,
				_args: string[],
				_options: unknown,
				callback: (error: Error | null, stdout: string, stderr: string) => void,
			) => {
				callback(new Error('boom'), '', '')
			},
		)

		await expect(Effect.runPromise(writeIPTC('/tmp/photo.jpg', 'desc', []))).rejects.toThrow(
			'IPTC write failed',
		)
	})

	it('preserves the exiftool failure cause', async () => {
		const cause = new Error('boom')
		vi.mocked(execFile as any).mockImplementation(
			(
				_command: string,
				_args: string[],
				_options: unknown,
				callback: (error: Error | null, stdout: string, stderr: string) => void,
			) => {
				callback(cause, '', '')
			},
		)

		let thrown: unknown
		try {
			await Effect.runPromise(writeIPTC('/tmp/photo.jpg', 'desc', []))
		} catch (error) {
			thrown = error
		}

		expect((thrown as { _tag?: string } | undefined)?._tag).toBe('IptcError')
		expect((thrown as { cause?: unknown } | undefined)?.cause).toBe(cause)
	})
})
