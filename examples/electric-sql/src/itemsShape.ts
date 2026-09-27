import {
  Array,
  Context,
  Effect,
  Layer,
  Order,
  Queue,
  Stream,
  pipe,
} from 'effect'

import {
  Shape,
  ShapeStream,
  isChangeMessage,
  snakeCamelMapper,
} from '@electric-sql/client'

import { Items } from './domain'

type ItemsSnapshot = Readonly<{
  items: Items.Items
  transactionIds: ReadonlyArray<number>
}>

const byCreatedAtThenId = Order.combine(
  Order.mapInput(Order.Number, ({ createdAt }: Items.Item) => createdAt),
  Order.mapInput(Order.String, ({ id }: Items.Item) => id),
)

const orderedItems = (rows: ReadonlyArray<Items.Item>): Items.Items =>
  pipe(
    rows,
    Array.map(({ id, text, isCompleted, createdAt }) =>
      Items.Item.make({ id, text, isCompleted, createdAt }),
    ),
    Array.sort(byCreatedAtThenId),
  )

// NOTE: ShapeStream's optional shapeHandle getter is incompatible with
// exactOptionalPropertyTypes even though it implements ShapeStreamInterface.
class ItemsShapeStream extends ShapeStream<Items.Item> {
  override get shapeHandle(): string {
    return super.shapeHandle ?? ''
  }
}

type ItemsShapeService = Readonly<{
  initialItems: Effect.Effect<Items.Items>
  snapshots: Stream.Stream<ItemsSnapshot>
}>

export class ItemsShape extends Context.Service<
  ItemsShape,
  ItemsShapeService
>()('ItemsShape') {}

export type ItemsShapeRequirements = ItemsShape

const makeItemsShape = Effect.acquireRelease(
  Effect.sync(() => {
    const abortController = new AbortController()
    const shapeStream = new ItemsShapeStream({
      url: new URL('/api/items/shape', window.location.origin).toString(),
      columnMapper: snakeCamelMapper(),
      signal: abortController.signal,
    })
    const unpublishedTransactionIds = new Set<number>()
    const unsubscribeTransactionIds = shapeStream.subscribe(messages => {
      for (const message of messages) {
        if (!isChangeMessage(message)) {
          continue
        }

        const transactionIds = message.headers.txids
        if (transactionIds === undefined) {
          continue
        }

        for (const transactionId of transactionIds) {
          unpublishedTransactionIds.add(transactionId)
        }
      }
    })
    const shape = new Shape(shapeStream)

    const service: ItemsShapeService = {
      initialItems: Effect.tryPromise({
        try: () => shape.rows.then(orderedItems),
        catch: error => error,
      }).pipe(Effect.orDie),
      snapshots: Stream.callback<ItemsSnapshot>(queue =>
        Effect.acquireRelease(
          Effect.sync(() => {
            const publishSnapshot = ({
              rows,
            }: Readonly<{ rows: ReadonlyArray<Items.Item> }>) => {
              const transactionIds = globalThis.Array.from(
                unpublishedTransactionIds,
              )
              unpublishedTransactionIds.clear()
              Queue.offerUnsafe(queue, {
                items: orderedItems(rows),
                transactionIds,
              })
            }
            const unsubscribe = shape.subscribe(publishSnapshot)

            publishSnapshot({ rows: shape.currentRows })

            return unsubscribe
          }),
          unsubscribe => Effect.sync(unsubscribe),
        ).pipe(Effect.flatMap(() => Effect.never)),
      ),
    }

    return { abortController, shape, service, unsubscribeTransactionIds }
  }),
  ({ abortController, shape, unsubscribeTransactionIds }) =>
    Effect.sync(() => {
      unsubscribeTransactionIds()
      shape.unsubscribeAll()
      abortController.abort()
    }),
)

export const ItemsShapeLayer: Layer.Layer<ItemsShape> = Layer.effect(
  ItemsShape,
  makeItemsShape.pipe(Effect.map(({ service }) => service)),
)
