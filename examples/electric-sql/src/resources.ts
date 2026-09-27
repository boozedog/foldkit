import type { Layer } from 'effect'

import { ItemsShapeLayer, type ItemsShapeRequirements } from './itemsShape'

export const resources: Layer.Layer<ItemsShapeRequirements> = ItemsShapeLayer
