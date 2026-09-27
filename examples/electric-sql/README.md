# ElectricSQL

The same task list as the [LiveStore example](../livestore), with Postgres as its source of truth and [ElectricSQL](https://electric-sql.com) synchronizing changes into the Foldkit Model. Tasks survive reloads and stay reactive across browser tabs.

## What it shows

The example keeps ElectricSQL behind Foldkit's Elm Architecture boundaries:

- **The Shape is an application resource.** `itemsShape.ts` materializes the Electric Shape in memory, exposes its initial value and snapshots, and closes the stream with the application runtime.
- **Writes go through Commands.** `PrepareItem` creates new item identity, and `CommitItemsMutation` sends explicit `ItemsMutation` values to the application backend.
- **Optimism is application state.** `optimisticItemsMutations` live in the Model and are projected over `confirmedItems`, the latest Electric Shape snapshot. A failed Command removes its optimistic mutation, so rollback is an ordinary state transition.
- **One Subscription is the reactive feed.** Electric Shape snapshots and their Postgres transaction IDs become `ReceivedElectricSnapshot`, so update remains the only place that changes the Model. Independent Shape streams make the same changes appear in other tabs.
- **The Model owns the rendered projection.** Postgres is the source of truth for persisted data. The Foldkit Model is the source of truth for what the view renders, including optimistic mutations, the task filter, draft text, and write-failure state.
- **The server boundary is explicit.** The Vite-side backend decodes the shared mutation Schema, commits it through Effect SQL, and returns the Postgres transaction ID used to settle the optimistic mutation. Electric is exposed through a separate Shape proxy that fixes the Shape to the `items` table and forwards only protocol parameters.

Unlike the LiveStore example, this example needs the Postgres and Electric services while it runs and does not provide offline writes. Foldkit owns optimistic state directly rather than delegating it to a second client store. Its persistence and cross-tab reactivity are otherwise the same.

## Run it

[Docker](https://docs.docker.com/get-docker/) must be running. Start the example with:

```bash
pnpm --filter electric-sql-example dev
```

The command starts Postgres and Electric through `docker-compose.yaml`, applies `server/migration.sql`, and starts Vite. Open the URL Vite prints, then open it in a second tab to see changes synchronize.

Stop the backend services without deleting the database:

```bash
pnpm --filter electric-sql-example backend:down
```

Delete the local database volume as well:

```bash
pnpm --filter electric-sql-example backend:clear
```

`DATABASE_URL` and `ELECTRIC_URL` can point the Vite-side backend at another Postgres and Electric deployment. Their local defaults match `docker-compose.yaml`.
