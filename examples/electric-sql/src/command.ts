import { Clock, Crypto, Effect, Schema } from 'effect'
import { Command } from 'foldkit'

import { BrowserCrypto } from '@effect/platform-browser'

import { Items, ItemsMutation } from './domain'
import { commitItemsMutation } from './itemsApi'
import { Message } from './message'
import { WriteFailureKind } from './model'

const describeError = (error: unknown): string =>
  error instanceof Error ? error.message : 'Something went wrong'

export const PrepareItem = Command.define('PrepareItem', {
  args: { text: Schema.String },
  messages: [Message.CompletedPrepareItem, Message.FailedPrepareItem],
  execute: ({ text }) =>
    Effect.gen(function* () {
      const crypto = yield* Crypto.Crypto
      const id = yield* crypto.randomUUIDv4
      const createdAt = yield* Clock.currentTimeMillis

      return Message.CompletedPrepareItem({
        item: Items.Item.make({
          id,
          text,
          isCompleted: false,
          createdAt,
        }),
      })
    }).pipe(
      Effect.provide(BrowserCrypto.layer),
      Effect.catch(error =>
        Effect.succeed(
          Message.FailedPrepareItem({ error: describeError(error) }),
        ),
      ),
    ),
})

export const CommitItemsMutation = Command.define('CommitItemsMutation', {
  args: {
    mutationId: Schema.Number,
    mutation: ItemsMutation,
    failureKind: WriteFailureKind,
  },
  messages: [
    Message.CompletedCommitItemsMutation,
    Message.FailedCommitItemsMutation,
  ],
  execute: ({ mutationId, mutation, failureKind }) =>
    commitItemsMutation(mutation).pipe(
      Effect.map(result =>
        Message.CompletedCommitItemsMutation({ mutationId, result }),
      ),
      Effect.catch(error =>
        Effect.succeed(
          Message.FailedCommitItemsMutation({
            mutationId,
            failureKind,
            error: describeError(error),
          }),
        ),
      ),
    ),
})
