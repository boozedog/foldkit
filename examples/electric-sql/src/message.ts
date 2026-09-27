import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'

import { CommitItemsMutationResult, Items } from './domain'
import { WriteFailureKind } from './model'

export const Message = defineMessageUnion({
  UpdatedNewItemText: { text: Schema.String },
  SubmittedNewItem: {},

  SelectedFilter: { filter: Items.Filter },

  ToggledItem: { id: Schema.String },
  ClickedDeleteItem: { id: Schema.String },
  ClickedClearCompleted: {},

  CompletedPrepareItem: { item: Items.Item },
  FailedPrepareItem: { error: Schema.String },
  CompletedCommitItemsMutation: {
    mutationId: Schema.Number,
    result: CommitItemsMutationResult,
  },
  FailedCommitItemsMutation: {
    mutationId: Schema.Number,
    failureKind: WriteFailureKind,
    error: Schema.String,
  },

  ReceivedElectricSnapshot: {
    items: Items.Items,
    transactionIds: Schema.Array(Schema.Number),
  },
})
export type Message = typeof Message.Type
