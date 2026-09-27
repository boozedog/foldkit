import { Option } from 'effect'
import { modifyFields } from 'foldkit/struct'

import { Items } from './domain'
import { Model, WriteError } from './model'

export const buyMilk = Items.Item.make({
  id: 'a',
  text: 'Buy milk',
  isCompleted: false,
  createdAt: 1000,
})

export const walkDog = Items.Item.make({
  id: 'b',
  text: 'Walk the dog',
  isCompleted: false,
  createdAt: 2000,
})

export const doneTask = Items.Item.make({
  id: 'c',
  text: 'Done task',
  isCompleted: true,
  createdAt: 3000,
})

export const modelWithConfirmedItems = (
  confirmedItems: ReadonlyArray<Items.Item>,
) =>
  Model.make({
    confirmedItems,
    optimisticItemsMutations: [],
    unmatchedElectricTransactionIds: [],
    nextMutationId: 0,
    maybeWriteError: Option.none(),
    newItemText: '',
    filter: 'All',
  })

export const addItemFailureModel = (
  confirmedItems: ReadonlyArray<Items.Item>,
  error: string,
) =>
  modifyFields(modelWithConfirmedItems(confirmedItems), {
    maybeWriteError: () => Option.some(WriteError.AddItem({ error })),
  })
