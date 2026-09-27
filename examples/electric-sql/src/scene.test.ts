import {
  Command,
  click,
  expect,
  given,
  label,
  role,
  scene,
  submit,
  text,
  type,
} from 'foldkit/scene'
import { describe, test } from 'vitest'

import { CommitItemsMutation, PrepareItem } from './command'
import { CommitItemsMutationResult, Items, ItemsMutation } from './domain'
import {
  addItemFailureModel,
  buyMilk,
  doneTask,
  modelWithConfirmedItems,
  walkDog,
} from './main.fixture'
import { Message } from './message'
import { update } from './update'
import { view } from './view'

const writeDocs = Items.Item.make({
  id: 'write-docs',
  text: 'Write docs',
  isCompleted: false,
  createdAt: 4000,
})

describe('rendered task states', () => {
  test('tasks show their active and completed counts', () => {
    scene(
      { update, view },
      given(modelWithConfirmedItems([buyMilk, walkDog, doneTask])),
      expect(text('Buy milk')).toExist(),
      expect(text('Walk the dog')).toExist(),
      expect(text('Done task')).toExist(),
      expect(role('status')).toContainText('2 active, 1 completed'),
      expect(role('banner')).toExist(),
      expect(role('main')).toExist(),
      expect(role('contentinfo')).toExist(),
    )
  })

  test('an empty task list shows a placeholder', () => {
    scene(
      { update, view },
      given(modelWithConfirmedItems([])),
      expect(text('No tasks yet. Add one above!')).toExist(),
    )
  })

  test('an add failure shows its error without hiding tasks', () => {
    scene(
      { update, view },
      given(addItemFailureModel([buyMilk], 'Crypto unavailable')),
      expect(text('Buy milk')).toExist(),
      expect(role('alert')).toContainText('Could not add task'),
      expect(role('alert')).toContainText('Crypto unavailable'),
    )
  })
})

describe('task interactions', () => {
  test('submitting a task clears the input and starts adding it', () => {
    scene(
      { update, view },
      given(modelWithConfirmedItems([])),
      type(label('New task'), 'Write docs'),
      submit(role('form')),
      Command.expectExact(PrepareItem({ text: 'Write docs' })),
      Command.resolve(
        PrepareItem,
        Message.CompletedPrepareItem({ item: writeDocs }),
      ),
      Command.expectExact(
        CommitItemsMutation({
          mutationId: 0,
          mutation: ItemsMutation.AddItems({ items: [writeDocs] }),
          failureKind: 'AddItem',
        }),
      ),
      expect(text('Write docs')).toExist(),
      Command.resolve(
        CommitItemsMutation,
        Message.CompletedCommitItemsMutation({
          mutationId: 0,
          result: CommitItemsMutationResult.Committed({ transactionId: 1 }),
        }),
      ),
      expect(label('New task')).toHaveValue(''),
    )
  })

  test('clicking a task checkbox starts toggling that task', () => {
    scene(
      { update, view },
      given(modelWithConfirmedItems([buyMilk])),
      click(label('Buy milk')),
      Command.expectExact(
        CommitItemsMutation({
          mutationId: 0,
          mutation: ItemsMutation.ToggleItems({ ids: ['a'] }),
          failureKind: 'PersistItems',
        }),
      ),
      expect(label('Buy milk')).toBeChecked(),
      Command.resolve(
        CommitItemsMutation,
        Message.CompletedCommitItemsMutation({
          mutationId: 0,
          result: CommitItemsMutationResult.Unchanged(),
        }),
      ),
    )
  })

  test('clicking a task delete button starts deleting that task', () => {
    scene(
      { update, view },
      given(modelWithConfirmedItems([buyMilk])),
      click(role('button', { name: 'Delete Buy milk' })),
      Command.expectExact(
        CommitItemsMutation({
          mutationId: 0,
          mutation: ItemsMutation.DeleteItems({ ids: ['a'] }),
          failureKind: 'PersistItems',
        }),
      ),
      expect(text('Buy milk')).toBeAbsent(),
      Command.resolve(
        CommitItemsMutation,
        Message.CompletedCommitItemsMutation({
          mutationId: 0,
          result: CommitItemsMutationResult.Unchanged(),
        }),
      ),
    )
  })

  test('clearing completed tasks starts their removal', () => {
    scene(
      { update, view },
      given(modelWithConfirmedItems([buyMilk, doneTask])),
      click(role('button', { name: 'Clear 1 completed' })),
      Command.expectExact(
        CommitItemsMutation({
          mutationId: 0,
          mutation: ItemsMutation.ClearCompletedItems(),
          failureKind: 'PersistItems',
        }),
      ),
      expect(text('Done task')).toBeAbsent(),
      Command.resolve(
        CommitItemsMutation,
        Message.CompletedCommitItemsMutation({
          mutationId: 0,
          result: CommitItemsMutationResult.Unchanged(),
        }),
      ),
    )
  })

  test('selecting the Completed filter shows only completed tasks', () => {
    scene(
      { update, view },
      given(modelWithConfirmedItems([buyMilk, doneTask])),
      expect(role('button', { name: 'All', pressed: true })).toExist(),
      expect(role('button', { name: 'Completed', pressed: false })).toExist(),
      click(role('button', { name: 'Completed' })),
      Command.expectNone(),
      expect(role('button', { name: 'All', pressed: false })).toExist(),
      expect(role('button', { name: 'Completed', pressed: true })).toExist(),
      expect(text('Done task')).toExist(),
      expect(text('Buy milk')).toBeAbsent(),
    )
  })

  test('selecting the Active filter shows only active tasks', () => {
    scene(
      { update, view },
      given(modelWithConfirmedItems([buyMilk, doneTask])),
      click(role('button', { name: 'Active' })),
      Command.expectNone(),
      expect(text('Buy milk')).toExist(),
      expect(text('Done task')).toBeAbsent(),
    )
  })

  test('an empty Active filter shows its placeholder', () => {
    scene(
      { update, view },
      given(modelWithConfirmedItems([doneTask])),
      click(role('button', { name: 'Active' })),
      expect(text('No active tasks')).toExist(),
    )
  })

  test('an empty Completed filter shows its placeholder', () => {
    scene(
      { update, view },
      given(modelWithConfirmedItems([buyMilk])),
      click(role('button', { name: 'Completed' })),
      expect(text('No completed tasks')).toExist(),
    )
  })
})
