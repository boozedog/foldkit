import { Array, Schema, pipe } from 'effect'
import { defineTaggedUnion } from 'foldkit/schema'

import { Items, ItemsMutation, applyItemsMutations } from './domain'

export const WriteError = defineTaggedUnion({
  AddItem: { error: Schema.String },
  PersistItems: { error: Schema.String },
})
export type WriteError = typeof WriteError.Type

export const WriteFailureKind = Schema.Literals(['AddItem', 'PersistItems'])
export type WriteFailureKind = typeof WriteFailureKind.Type

export const OptimisticItemsMutationState = defineTaggedUnion({
  AwaitingCommit: {},
  AwaitingElectric: { transactionId: Schema.Number },
})
export type OptimisticItemsMutationState =
  typeof OptimisticItemsMutationState.Type

export const OptimisticItemsMutation = Schema.Struct({
  mutationId: Schema.Number,
  mutation: ItemsMutation,
  state: OptimisticItemsMutationState,
})
export type OptimisticItemsMutation = typeof OptimisticItemsMutation.Type

export const Model = Schema.Struct({
  confirmedItems: Items.Items,
  optimisticItemsMutations: Schema.Array(OptimisticItemsMutation),
  unmatchedElectricTransactionIds: Schema.Array(Schema.Number),
  nextMutationId: Schema.Number,
  maybeWriteError: Schema.Option(WriteError),
  newItemText: Schema.String,
  filter: Items.Filter,
})
export type Model = typeof Model.Type

export const projectedItems = (model: Model): Items.Items =>
  pipe(
    model.optimisticItemsMutations,
    Array.map(({ mutation }) => mutation),
    mutations => applyItemsMutations(model.confirmedItems, mutations),
  )
