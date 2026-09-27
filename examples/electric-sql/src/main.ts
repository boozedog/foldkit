import { Effect, Option, Schema } from 'effect'
import { Runtime } from 'foldkit'

import { Items } from './domain'
import { ItemsShape, type ItemsShapeRequirements } from './itemsShape'
import { Message } from './message'
import { Model } from './model'

export const Flags = Schema.Struct({
  items: Items.Items,
})
export type Flags = typeof Flags.Type

export const flags: Effect.Effect<Flags, never, ItemsShapeRequirements> =
  Effect.gen(function* () {
    const shape = yield* ItemsShape
    const items = yield* shape.initialItems

    return Flags.make({ items })
  })

export const init: Runtime.ApplicationInit<Model, Message, Flags> = flags => ({
  model: {
    confirmedItems: flags.items,
    optimisticItemsMutations: [],
    unmatchedElectricTransactionIds: [],
    nextMutationId: 0,
    maybeWriteError: Option.none(),
    newItemText: '',
    filter: 'All',
  },
})

export { Message, Model }
export { subscriptions } from './subscription'
export { update } from './update'
export { view } from './view'
