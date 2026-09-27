import { Array, Schema } from 'effect'
import { defineTaggedUnion } from 'foldkit/schema'

import * as Items from './items.ts'

export const ItemsMutation = defineTaggedUnion({
  AddItems: { items: Items.Items },
  ToggleItems: { ids: Schema.Array(Schema.String) },
  DeleteItems: { ids: Schema.Array(Schema.String) },
  ClearCompletedItems: {},
})
export type ItemsMutation = typeof ItemsMutation.Type

export const CommitItemsMutationResult = defineTaggedUnion({
  Committed: { transactionId: Schema.Number },
  Unchanged: {},
})
export type CommitItemsMutationResult = typeof CommitItemsMutationResult.Type

const applyItemsMutation = (
  items: Items.Items,
  mutation: ItemsMutation,
): Items.Items =>
  ItemsMutation.match<Items.Items>(mutation, {
    AddItems: ({ items: addedItems }) => Array.appendAll(items, addedItems),
    ToggleItems: ({ ids }) =>
      Array.map(items, item =>
        Array.contains(ids, item.id)
          ? Items.Item.make({
              ...item,
              isCompleted: !item.isCompleted,
            })
          : item,
      ),
    DeleteItems: ({ ids }) =>
      Array.filter(items, item => !Array.contains(ids, item.id)),
    ClearCompletedItems: () =>
      Array.filter(items, ({ isCompleted }) => !isCompleted),
  })

export const applyItemsMutations = (
  confirmedItems: Items.Items,
  optimisticMutations: ReadonlyArray<ItemsMutation>,
): Items.Items =>
  Array.reduce(optimisticMutations, confirmedItems, applyItemsMutation)
