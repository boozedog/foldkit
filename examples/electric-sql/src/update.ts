import { Array, Match, Number, Option, String, pipe } from 'effect'
import { type Update } from 'foldkit'
import { modifyFields } from 'foldkit/struct'

import { CommitItemsMutation, PrepareItem } from './command'
import {
  CommitItemsMutationResult,
  type CommitItemsMutationResult as CommitItemsMutationResultType,
  ItemsMutation,
  type ItemsMutation as ItemsMutationType,
} from './domain'
import { Message } from './message'
import {
  type Model,
  OptimisticItemsMutation,
  OptimisticItemsMutationState,
  WriteError,
  type WriteFailureKind,
} from './model'

const UNMATCHED_ELECTRIC_TRANSACTION_LIMIT = 100

const withoutOptimisticMutation = (
  optimisticItemsMutations: ReadonlyArray<OptimisticItemsMutation>,
  mutationId: number,
): ReadonlyArray<OptimisticItemsMutation> =>
  Array.filter(
    optimisticItemsMutations,
    optimisticMutation => optimisticMutation.mutationId !== mutationId,
  )

const beginOptimisticItemsMutation = (
  model: Model,
  mutation: ItemsMutationType,
  failureKind: WriteFailureKind,
): Update.Return<Model, Message> => {
  const mutationId = model.nextMutationId

  return {
    model: modifyFields(model, {
      optimisticItemsMutations: Array.append(
        OptimisticItemsMutation.make({
          mutationId,
          mutation,
          state: OptimisticItemsMutationState.AwaitingCommit(),
        }),
      ),
      nextMutationId: Number.increment,
      maybeWriteError: () => Option.none(),
    }),
    commands: [CommitItemsMutation({ mutationId, mutation, failureKind })],
  }
}

const recordItemsMutationCommitResult = (
  model: Model,
  mutationId: number,
  result: CommitItemsMutationResultType,
): Update.Return<Model, Message> =>
  CommitItemsMutationResult.match<Update.Return<Model, Message>>(result, {
    Unchanged: () => ({
      model: modifyFields(model, {
        optimisticItemsMutations: optimisticItemsMutations =>
          withoutOptimisticMutation(optimisticItemsMutations, mutationId),
      }),
    }),
    Committed: ({ transactionId }) => {
      if (
        Array.contains(model.unmatchedElectricTransactionIds, transactionId)
      ) {
        return {
          model: modifyFields(model, {
            optimisticItemsMutations: optimisticItemsMutations =>
              withoutOptimisticMutation(optimisticItemsMutations, mutationId),
            unmatchedElectricTransactionIds: Array.filter(
              unmatchedTransactionId =>
                unmatchedTransactionId !== transactionId,
            ),
          }),
        }
      }

      return {
        model: modifyFields(model, {
          optimisticItemsMutations: Array.map(optimisticMutation =>
            optimisticMutation.mutationId === mutationId
              ? OptimisticItemsMutation.make({
                  ...optimisticMutation,
                  state: OptimisticItemsMutationState.AwaitingElectric({
                    transactionId,
                  }),
                })
              : optimisticMutation,
          ),
        }),
      }
    },
  })

const isConfirmedByElectricSnapshot = (
  transactionIds: ReadonlyArray<number>,
  optimisticMutation: OptimisticItemsMutation,
): boolean =>
  OptimisticItemsMutationState.match<boolean>(optimisticMutation.state, {
    AwaitingCommit: () => false,
    AwaitingElectric: ({ transactionId }) =>
      Array.contains(transactionIds, transactionId),
  })

const reconcileElectricSnapshot = (
  model: Model,
  confirmedItems: Model['confirmedItems'],
  transactionIds: ReadonlyArray<number>,
): Update.Return<Model, Message> => {
  const snapshotConfirmedMutations = Array.filter(
    model.optimisticItemsMutations,
    mutation => isConfirmedByElectricSnapshot(transactionIds, mutation),
  )
  const matchedTransactionIds = Array.flatMap(
    snapshotConfirmedMutations,
    ({ state }) =>
      OptimisticItemsMutationState.match<ReadonlyArray<number>>(state, {
        AwaitingCommit: () => Array.empty<number>(),
        AwaitingElectric: ({ transactionId }) => [transactionId],
      }),
  )
  const unmatchedTransactionIds = Array.filter(
    transactionIds,
    transactionId => !Array.contains(matchedTransactionIds, transactionId),
  )
  const nextUnmatchedElectricTransactionIds = pipe(
    model.unmatchedElectricTransactionIds,
    Array.filter(
      transactionId => !Array.contains(matchedTransactionIds, transactionId),
    ),
    Array.appendAll(unmatchedTransactionIds),
    Array.dedupe,
    Array.takeRight(UNMATCHED_ELECTRIC_TRANSACTION_LIMIT),
  )

  return {
    model: modifyFields(model, {
      confirmedItems: () => confirmedItems,
      optimisticItemsMutations: Array.filter(
        mutation => !isConfirmedByElectricSnapshot(transactionIds, mutation),
      ),
      unmatchedElectricTransactionIds: () =>
        nextUnmatchedElectricTransactionIds,
    }),
  }
}

const toWriteError = (
  failureKind: WriteFailureKind,
  error: string,
): WriteError =>
  Match.value(failureKind).pipe(
    Match.when('AddItem', () => WriteError.AddItem({ error })),
    Match.when('PersistItems', () => WriteError.PersistItems({ error })),
    Match.exhaustive,
  )

export const update = (model: Model, message: Message) =>
  Message.match<Update.Return<Model, Message>>(message, {
    UpdatedNewItemText: ({ text }) => ({
      model: modifyFields(model, {
        newItemText: () => text,
      }),
    }),

    SubmittedNewItem: () => {
      const trimmed = String.trim(model.newItemText)

      if (String.isEmpty(trimmed)) {
        return { model }
      }

      return {
        model: modifyFields(model, {
          maybeWriteError: () => Option.none(),
          newItemText: () => '',
        }),
        commands: [PrepareItem({ text: trimmed })],
      }
    },

    SelectedFilter: ({ filter }) => ({
      model: modifyFields(model, {
        filter: () => filter,
      }),
    }),

    ToggledItem: ({ id }) =>
      beginOptimisticItemsMutation(
        model,
        ItemsMutation.ToggleItems({ ids: [id] }),
        'PersistItems',
      ),

    ClickedDeleteItem: ({ id }) =>
      beginOptimisticItemsMutation(
        model,
        ItemsMutation.DeleteItems({ ids: [id] }),
        'PersistItems',
      ),

    ClickedClearCompleted: () =>
      beginOptimisticItemsMutation(
        model,
        ItemsMutation.ClearCompletedItems(),
        'PersistItems',
      ),

    CompletedPrepareItem: ({ item }) =>
      beginOptimisticItemsMutation(
        model,
        ItemsMutation.AddItems({ items: [item] }),
        'AddItem',
      ),

    FailedPrepareItem: ({ error }) => ({
      model: modifyFields(model, {
        maybeWriteError: () => Option.some(WriteError.AddItem({ error })),
      }),
    }),

    CompletedCommitItemsMutation: ({ mutationId, result }) =>
      recordItemsMutationCommitResult(model, mutationId, result),

    FailedCommitItemsMutation: ({ mutationId, failureKind, error }) => ({
      model: modifyFields(model, {
        optimisticItemsMutations: optimisticItemsMutations =>
          withoutOptimisticMutation(optimisticItemsMutations, mutationId),
        maybeWriteError: () => Option.some(toWriteError(failureKind, error)),
      }),
    }),

    ReceivedElectricSnapshot: ({ items, transactionIds }) =>
      reconcileElectricSnapshot(model, items, transactionIds),
  })
