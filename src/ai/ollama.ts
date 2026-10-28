// AI classification: wraps the local Ollama daemon behind an `OllamaClient`
// Effect service. Reads each image, base64-encodes it, asks the model for tags
// and a description using a JSON schema, normalises the result, and persists
// it via `writeIPTC`.

import { readFile } from 'node:fs/promises'
import { Context, Data, Effect, Layer, Schedule, Schema } from 'effect'
import ollama from 'ollama'
import { type IptcError, writeIPTC } from '../meta/iptc.ts'

// Tagged error raised when an Ollama request (or its response parsing) fails.
// Preserves the underlying cause for diagnostics.
export class OllamaError extends Data.TaggedError('OllamaError')<{ readonly cause?: unknown }> {
	constructor(props?: { readonly cause?: unknown }) {
		super(props ?? {})
	}

	get message() {
		return 'Ollama request failed'
	}
}

// The validated, normalised shape returned for an image classification.
export interface ClassificationResult {
	tags: string[]
	description: string
}

// Effect Schema used to decode and validate the model's JSON response.
const ClassificationResultSchema = Schema.Struct({
	tags: Schema.Array(Schema.String),
	description: Schema.String,
})

// Context service describing the ability to classify a photo. Decoupling the
// interface from its Ollama implementation lets tests supply a fake client.
export class OllamaClient extends Context.Service<
	OllamaClient,
	{
		readonly classify: (photo: string) => Effect.Effect<ClassificationResult, OllamaError>
	}
>()('OllamaClient') {}

// Normalise a raw classification: trim and lowercase tags, drop empty ones, de-
// duplicate (via a Set), and trim the description.
export const normalizeClassification = (result: ClassificationResult): ClassificationResult => ({
	tags: [
		...new Set(result.tags.map(tag => tag.trim().toLowerCase()).filter(tag => tag.length > 0)),
	],
	description: result.description.trim(),
})

// Persist a classification by writing it to the image's IPTC metadata.
// Returns the (unchanged) result so it can be chained in an Effect pipeline.
export const persistClassification = (
	photo: string,
	result: ClassificationResult,
): Effect.Effect<ClassificationResult, IptcError> =>
	writeIPTC(photo, result.description, result.tags).pipe(Effect.as(result))

// High-level classification flow for a single photo: classify through the
// OllamaClient service, normalise, then persist. Requires an OllamaClient in
// context. Errors are `OllamaError` (from classification) or `IptcError`
// (from persistence).
export const classifyPhoto = (
	photo: string,
): Effect.Effect<ClassificationResult, OllamaError | IptcError, OllamaClient> =>
	Effect.flatMap(OllamaClient, client =>
		client.classify(photo).pipe(
			Effect.map(normalizeClassification),
			Effect.flatMap(result => persistClassification(photo, result)),
		),
	)

// Live implementation of `OllamaClient` backed by the real `ollama` package.
// Classifies a single photo with bounded retries on transient failures.
export const OllamaClientLive: Layer.Layer<OllamaClient> = Layer.succeed(OllamaClient, {
	classify: (photo: string) =>
		Effect.tryPromise({
			try: async () => {
				// Read the image bytes and base64-encode them for the model.
				const imageBuffer = await readFile(photo)
				const base64Image = imageBuffer.toString('base64')

				// Ask the local model for tags + a one-sentence description.
				// `think: false` disables chain-of-thought; `format` enforces JSON.
				const response = await ollama.generate({
					model: 'gemma4:e4b',
					prompt:
						'Analyze this image and output relevant tags and a brief description in one sentence',
					images: [base64Image],
					think: false,
					format: {
						type: 'object',
						properties: {
							tags: {
								type: 'array',
								items: { type: 'string' },
							},
							description: {
								type: 'string',
							},
						},
						required: ['tags', 'description'],
					},
				})

				// Decode and validate the model's JSON response against the schema.
				const parsed = Schema.decodeUnknownSync(ClassificationResultSchema)(
					JSON.parse(response.response ?? '{}'),
				)

				// Return a plain (non-schema) copy of the parsed values.
				return {
					tags: [...parsed.tags],
					description: parsed.description,
				}
			},
			catch: cause => new OllamaError({ cause }),
		}).pipe(
			// Retry transient failures a couple of times with exponential backoff.
			Effect.retry({
				times: 2,
				schedule: Schedule.exponential('250 millis'),
			}),
		),
})
