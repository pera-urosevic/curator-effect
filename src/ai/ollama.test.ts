import { Effect, Layer } from 'effect'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../meta/iptc', async () => {
	const { Effect: EffectModule } = await import('effect')
	return {
		writeIPTC: () => EffectModule.succeed(undefined),
	}
})
import type { ClassificationResult } from './ollama.ts'
import { OllamaClient, OllamaError, classifyPhoto } from './ollama.ts'

describe('classifyPhoto', () => {
	it('delegates the photo path to the Ollama client', async () => {
		const seen: string[] = []
		const layer = Layer.succeed(OllamaClient, {
			classify: (photo: string) =>
				Effect.sync(() => {
					seen.push(photo)
					return { tags: [], description: '' } satisfies ClassificationResult
				}),
		})

		await Effect.runPromise(Effect.provide(classifyPhoto('/tmp/photo.jpg'), layer))

		expect(seen).toEqual(['/tmp/photo.jpg'])
	})

	it('propagates client failures', async () => {
		const layer = Layer.succeed(OllamaClient, {
			classify: () => Effect.fail(new OllamaError()),
		})

		await expect(Effect.runPromise(Effect.provide(classifyPhoto('x'), layer))).rejects.toThrow(
			'Ollama request failed',
		)
	})

	it('normalizes tags and description from the client result', async () => {
		const layer = Layer.succeed(OllamaClient, {
			classify: () =>
				Effect.sync(() => ({
					tags: [' Sunset ', 'BEACH', 'sunset', ''],
					description: ' A sunset over the beach ',
				})),
		})

		const result = await Effect.runPromise(Effect.provide(classifyPhoto('/tmp/photo.jpg'), layer))

		expect(result).toEqual({
			tags: ['sunset', 'beach'],
			description: 'A sunset over the beach',
		})
	})

	it('preserves a cause on OllamaError', () => {
		const cause = new Error('underlying failure')
		const error = new OllamaError({ cause })

		expect(error.cause).toBe(cause)
	})
})
