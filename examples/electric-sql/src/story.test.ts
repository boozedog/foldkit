import { Option } from 'effect'
import { Command, given, message, model, story } from 'foldkit/story'
import { modifyFields } from 'foldkit/struct'
import { describe, expect, test } from 'vitest'

import { CommitItemsMutation, PrepareItem } from './command'
import { CommitItemsMutationResult, Items, ItemsMutation } from './domain'
import { Flags, init } from './main'
import {
  addItemFailureModel,
  buyMilk,
  doneTask,
  modelWithConfirmedItems,
} from './main.fixture'
import { Message } from './message'
import {
  OptimisticItemsMutation,
  OptimisticItemsMutationState,
  WriteError,
  projectedItems,
} from './model'
import { update } from './update'

const completedBuyMilk = Items.Item.make({
  ...buyMilk,
  isCompleted: true,
})

describe('task state', () => {
  test('initializes with the provided task snapshot', () => {
    const init_ = init(Flags.make({ items: [buyMilk, doneTask] }))

    expect(init_.model.confirmedItems).toStrictEqual([buyMilk, doneTask])
  })

  describe('adding a task', () => {
    test('editing the new task updates its draft text', () => {
      story(
        update,
        given(modelWithConfirmedItems([])),
        message(Message.UpdatedNewItemText({ text: 'Buy milk' })),
        model(model => {
          expect(model.newItemText).toBe('Buy milk')
        }),
      )
    })

    test('submitting a task prepares and optimistically adds it', () => {
      story(
        update,
        given(
          modifyFields(modelWithConfirmedItems([]), {
            newItemText: () => 'Buy milk',
          }),
        ),
        message(Message.SubmittedNewItem()),
        Command.expectExact(PrepareItem({ text: 'Buy milk' })),
        Command.resolve(
          PrepareItem,
          Message.CompletedPrepareItem({ item: buyMilk }),
        ),
        Command.expectExact(
          CommitItemsMutation({
            mutationId: 0,
            mutation: ItemsMutation.AddItems({ items: [buyMilk] }),
            failureKind: 'AddItem',
          }),
        ),
        model(model => {
          expect(model.newItemText).toBe('')
          expect(projectedItems(model)).toStrictEqual([buyMilk])
        }),
        Command.resolve(
          CommitItemsMutation,
          Message.CompletedCommitItemsMutation({
            mutationId: 0,
            result: CommitItemsMutationResult.Unchanged(),
          }),
        ),
      )
    })

    test('submitting whitespace without a task is ignored', () => {
      story(
        update,
        given(
          modifyFields(modelWithConfirmedItems([]), {
            newItemText: () => '   ',
          }),
        ),
        message(Message.SubmittedNewItem()),
        Command.expectNone(),
      )
    })

    test('an add failure reports the error', () => {
      story(
        update,
        given(modelWithConfirmedItems([buyMilk])),
        message(Message.FailedPrepareItem({ error: 'crypto unavailable' })),
        model(model => {
          expect(model.confirmedItems).toStrictEqual([buyMilk])
          expect(model.maybeWriteError).toStrictEqual(
            Option.some(WriteError.AddItem({ error: 'crypto unavailable' })),
          )
        }),
      )
    })

    test('submitting another task clears the previous add error', () => {
      story(
        update,
        given(
          modifyFields(addItemFailureModel([], 'crypto unavailable'), {
            newItemText: () => 'Try again',
          }),
        ),
        message(Message.SubmittedNewItem()),
        Command.expectExact(PrepareItem({ text: 'Try again' })),
        model(model => {
          expect(model.maybeWriteError).toStrictEqual(Option.none())
        }),
        Command.resolve(
          PrepareItem,
          Message.FailedPrepareItem({ error: 'stopped after assertion' }),
        ),
      )
    })
  })

  describe('changing tasks', () => {
    test('a persistence failure rolls back the optimistic change', () => {
      story(
        update,
        given(modelWithConfirmedItems([buyMilk])),
        message(Message.ToggledItem({ id: 'a' })),
        model(model => {
          expect(projectedItems(model)).toStrictEqual([completedBuyMilk])
        }),
        Command.resolve(
          CommitItemsMutation,
          Message.FailedCommitItemsMutation({
            mutationId: 0,
            failureKind: 'PersistItems',
            error: 'database unavailable',
          }),
        ),
        model(model => {
          expect(projectedItems(model)).toStrictEqual([buyMilk])
          expect(model.maybeWriteError).toStrictEqual(
            Option.some(
              WriteError.PersistItems({ error: 'database unavailable' }),
            ),
          )
        }),
      )
    })

    test('toggling a task starts an optimistic mutation', () => {
      story(
        update,
        given(modelWithConfirmedItems([buyMilk])),
        message(Message.ToggledItem({ id: 'a' })),
        Command.expectExact(
          CommitItemsMutation({
            mutationId: 0,
            mutation: ItemsMutation.ToggleItems({ ids: ['a'] }),
            failureKind: 'PersistItems',
          }),
        ),
        model(model => {
          expect(model.optimisticItemsMutations).toStrictEqual([
            OptimisticItemsMutation.make({
              mutationId: 0,
              mutation: ItemsMutation.ToggleItems({ ids: ['a'] }),
              state: OptimisticItemsMutationState.AwaitingCommit(),
            }),
          ])
          expect(projectedItems(model)).toStrictEqual([completedBuyMilk])
        }),
        Command.resolve(
          CommitItemsMutation,
          Message.CompletedCommitItemsMutation({
            mutationId: 0,
            result: CommitItemsMutationResult.Unchanged(),
          }),
        ),
      )
    })

    test('deleting a task starts an optimistic mutation', () => {
      story(
        update,
        given(modelWithConfirmedItems([buyMilk])),
        message(Message.ClickedDeleteItem({ id: 'a' })),
        Command.expectExact(
          CommitItemsMutation({
            mutationId: 0,
            mutation: ItemsMutation.DeleteItems({ ids: ['a'] }),
            failureKind: 'PersistItems',
          }),
        ),
        model(model => {
          expect(projectedItems(model)).toStrictEqual([])
        }),
        Command.resolve(
          CommitItemsMutation,
          Message.CompletedCommitItemsMutation({
            mutationId: 0,
            result: CommitItemsMutationResult.Unchanged(),
          }),
        ),
      )
    })

    test('clearing completed tasks starts an optimistic mutation', () => {
      story(
        update,
        given(modelWithConfirmedItems([buyMilk, doneTask])),
        message(Message.ClickedClearCompleted()),
        Command.expectExact(
          CommitItemsMutation({
            mutationId: 0,
            mutation: ItemsMutation.ClearCompletedItems(),
            failureKind: 'PersistItems',
          }),
        ),
        model(model => {
          expect(projectedItems(model)).toStrictEqual([buyMilk])
        }),
        Command.resolve(
          CommitItemsMutation,
          Message.CompletedCommitItemsMutation({
            mutationId: 0,
            result: CommitItemsMutationResult.Unchanged(),
          }),
        ),
      )
    })
  })

  describe('task snapshots', () => {
    test('an incoming task snapshot replaces the confirmed tasks', () => {
      story(
        update,
        given(modelWithConfirmedItems([buyMilk])),
        message(
          Message.ReceivedElectricSnapshot({
            items: [buyMilk, doneTask],
            transactionIds: [],
          }),
        ),
        model(model => {
          expect(model.confirmedItems).toStrictEqual([buyMilk, doneTask])
        }),
      )
    })

    test('an Electric transaction settles its optimistic mutation', () => {
      story(
        update,
        given(modelWithConfirmedItems([buyMilk])),
        message(Message.ToggledItem({ id: 'a' })),
        Command.resolve(
          CommitItemsMutation,
          Message.CompletedCommitItemsMutation({
            mutationId: 0,
            result: CommitItemsMutationResult.Committed({ transactionId: 7 }),
          }),
        ),
        model(model => {
          expect(model.optimisticItemsMutations).toStrictEqual([
            OptimisticItemsMutation.make({
              mutationId: 0,
              mutation: ItemsMutation.ToggleItems({ ids: ['a'] }),
              state: OptimisticItemsMutationState.AwaitingElectric({
                transactionId: 7,
              }),
            }),
          ])
        }),
        message(
          Message.ReceivedElectricSnapshot({
            items: [completedBuyMilk],
            transactionIds: [7],
          }),
        ),
        model(model => {
          expect(model.confirmedItems).toStrictEqual([completedBuyMilk])
          expect(model.optimisticItemsMutations).toStrictEqual([])
          expect(projectedItems(model)).toStrictEqual([completedBuyMilk])
        }),
      )
    })

    test('a commit result settles a snapshot that Electric delivered first', () => {
      const toggleItem = update(
        modelWithConfirmedItems([buyMilk]),
        Message.ToggledItem({ id: 'a' }),
      )
      const receiveElectricSnapshot = update(
        toggleItem.model,
        Message.ReceivedElectricSnapshot({
          items: [completedBuyMilk],
          transactionIds: [7],
        }),
      )

      expect(
        receiveElectricSnapshot.model.unmatchedElectricTransactionIds,
      ).toStrictEqual([7])

      const commitItemsMutation = update(
        receiveElectricSnapshot.model,
        Message.CompletedCommitItemsMutation({
          mutationId: 0,
          result: CommitItemsMutationResult.Committed({ transactionId: 7 }),
        }),
      )

      expect(commitItemsMutation.model.confirmedItems).toStrictEqual([
        completedBuyMilk,
      ])
      expect(commitItemsMutation.model.optimisticItemsMutations).toStrictEqual(
        [],
      )
      expect(
        commitItemsMutation.model.unmatchedElectricTransactionIds,
      ).toStrictEqual([])
      expect(projectedItems(commitItemsMutation.model)).toStrictEqual([
        completedBuyMilk,
      ])
    })
  })

  describe('filtering', () => {
    test('choosing a filter makes it active', () => {
      story(
        update,
        given(modelWithConfirmedItems([buyMilk, doneTask])),
        message(Message.SelectedFilter({ filter: 'Completed' })),
        Command.expectNone(),
        model(model => {
          expect(model.filter).toBe('Completed')
        }),
      )
    })
  })
})
