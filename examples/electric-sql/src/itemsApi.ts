import { Effect, Option, Schema } from 'effect'

import { CommitItemsMutationResult, type ItemsMutation } from './domain'

const ErrorResponse = Schema.Struct({ error: Schema.String })

const toError = (error: unknown): Error =>
  error instanceof Error ? error : new Error('Something went wrong')

export const commitItemsMutation = (
  mutation: ItemsMutation,
): Effect.Effect<CommitItemsMutationResult, Error> =>
  Effect.tryPromise({
    try: async () => {
      const response = await fetch('/api/items', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(mutation),
      })
      const responseBody: unknown = await response.json()

      if (!response.ok) {
        const maybeError =
          Schema.decodeUnknownOption(ErrorResponse)(responseBody)
        throw new Error(
          Option.match(maybeError, {
            onNone: () => `Request failed with status ${response.status}`,
            onSome: ({ error }) => error,
          }),
        )
      }

      return Schema.decodeUnknownPromise(CommitItemsMutationResult)(
        responseBody,
      )
    },
    catch: toError,
  })
