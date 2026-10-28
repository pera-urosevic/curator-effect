import { Effect } from 'effect'
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { collectPhotos } from './scan.ts'

describe('collectPhotos', () => {
	let workDir: string

	beforeEach(async () => {
		workDir = await mkdtemp(join(tmpdir(), 'curator-'))
	})

	afterEach(async () => {
		await rm(workDir, { recursive: true, force: true })
	})

	it('returns an empty array for a missing path', async () => {
		const result = await Effect.runPromise(collectPhotos(join(workDir, 'missing')))

		expect(result).toEqual([])
	})

	it('returns an empty array for a non-image file', async () => {
		const filePath = join(workDir, 'notes.txt')
		await writeFile(filePath, 'hello')

		const result = await Effect.runPromise(collectPhotos(filePath))

		expect(result).toEqual([])
	})

	it('returns a single jpeg file', async () => {
		const filePath = join(workDir, 'photo.jpg')
		await writeFile(filePath, '')

		const result = await Effect.runPromise(collectPhotos(filePath))

		expect(result).toEqual([filePath])
	})

	it('returns an empty array for a directory without images', async () => {
		await mkdir(join(workDir, 'nested'))
		await writeFile(join(workDir, 'nested', 'notes.txt'), '')

		const result = await Effect.runPromise(collectPhotos(workDir))

		expect(result).toEqual([])
	})

	it('recursively collects jpeg files with supported extensions', async () => {
		const expected = [
			join(workDir, 'a.jpg'),
			join(workDir, 'b.jpeg'),
			join(workDir, 'nested', 'c.JPG'),
			join(workDir, 'nested', 'deep', 'd.Jpeg'),
		]

		await writeFile(expected[0]!, '')
		await writeFile(expected[1]!, '')
		await mkdir(join(workDir, 'nested', 'deep'), { recursive: true })
		await writeFile(expected[2]!, '')
		await writeFile(expected[3]!, '')
		await writeFile(join(workDir, 'nested', 'ignored.png'), '')

		const result = await Effect.runPromise(collectPhotos(workDir))

		expect(result.sort()).toEqual(expected.sort())
	})

	it('returns collected paths in sorted order', async () => {
		await writeFile(join(workDir, 'z.jpg'), '')
		await writeFile(join(workDir, 'a.jpg'), '')

		const result = await Effect.runPromise(collectPhotos(workDir))

		expect(result).toEqual([join(workDir, 'a.jpg'), join(workDir, 'z.jpg')])
	})

	it('does not recurse through symlinked directories', async () => {
		await writeFile(join(workDir, 'photo.jpg'), '')
		await symlink(workDir, join(workDir, 'loop'))

		const result = await Effect.runPromise(collectPhotos(workDir))

		expect(result).toEqual([join(workDir, 'photo.jpg')])
	})

	it('logs an entry for a missing path', async () => {
		const logFile = join(workDir, 'errors.log')
		process.env.CURATOR_ERROR_LOG = logFile
		await rm(logFile, { force: true })

		try {
			await Effect.runPromise(collectPhotos(join(workDir, 'missing')))

			const log = await readFile(logFile, 'utf8')
			expect(log).toContain('Failed to access path')
		} finally {
			delete process.env.CURATOR_ERROR_LOG
		}
	})

	it('collects images when traversal concurrency is zero or negative', async () => {
		await writeFile(join(workDir, 'b.jpg'), '')
		await writeFile(join(workDir, 'a.jpg'), '')

		const zeroResult = await Effect.runPromise(collectPhotos(workDir, 0))
		const negativeResult = await Effect.runPromise(collectPhotos(workDir, -2))

		expect(zeroResult).toEqual([join(workDir, 'a.jpg'), join(workDir, 'b.jpg')])
		expect(negativeResult).toEqual([join(workDir, 'a.jpg'), join(workDir, 'b.jpg')])
	})

	it('supports bounded traversal concurrency', async () => {
		await writeFile(join(workDir, 'b.jpg'), '')
		await writeFile(join(workDir, 'a.jpg'), '')

		const result = await Effect.runPromise(collectPhotos(workDir, 2))

		expect(result).toEqual([join(workDir, 'a.jpg'), join(workDir, 'b.jpg')])
	})
})
