import { Stream } from 'effect'
import { Subscription } from 'foldkit'

import { ItemsShape, type ItemsShapeRequirements } from './itemsShape'
import { Message } from './message'
import type { Model } from './model'

const electricSnapshotMessageStream: Stream.Stream<
  typeof Message.ReceivedElectricSnapshot.Type,
  never,
  ItemsShapeRequirements
> = ItemsShape.pipe(
  Stream.fromEffect,
  Stream.flatMap(shape => shape.snapshots),
  Stream.map(({ items, transactionIds }) =>
    Message.ReceivedElectricSnapshot({ items, transactionIds }),
  ),
)

export const subscriptions = Subscription.make<
  Model,
  Message,
  ItemsShapeRequirements
>()(() => ({
  electricSnapshots: Subscription.persistent(electricSnapshotMessageStream),
}))
