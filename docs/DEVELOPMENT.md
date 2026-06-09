# Development

## Database: local vs. production

Production is a managed **AWS RDS** Postgres, reached **only** via
`prisma migrate deploy` at deploy time. **Never run `prisma migrate dev` against
it** — on schema drift it can prompt to reset (wipe) the database.

Develop against a **local** Postgres instead. Your schema reaches production
through the committed migration files in `prisma/migrations/` — not by copying a
database. You write a change once locally; `migrate deploy` replays the identical
SQL on the RDS. The two databases are the same schema in two environments, kept in
lockstep by the migrations. That's why running both isn't "double work."

### One-time local setup

1. Start the local database:
   ```bash
   docker compose -f docker-compose.dev.yml up -d   # or: npm run db:up
   ```
2. Point your **local** `.env` at it. The prod RDS connection string belongs in
   the server's deploy environment, **not** your local `.env`:
   ```dotenv
   DATABASE_URL="postgresql://dev:dev@localhost:5434/msfg_web?schema=public"
   DIRECT_URL="postgresql://dev:dev@localhost:5434/msfg_web?schema=public"
   ```
3. Apply the migrations and seed:
   ```bash
   npx prisma migrate deploy
   npm run db:seed
   ```
4. Run the app: `npm run dev`.

`npm run db:down` stops the database (data persists in the `msfg_web_pgdata`
volume); `docker compose -f docker-compose.dev.yml down -v` wipes it.

> Prisma's CLI reads `DIRECT_URL ?? DATABASE_URL` via `prisma.config.ts`
> (`import "dotenv/config"`, which does **not** override shell-set vars). So a
> one-off command can target any database inline, e.g.
> `DATABASE_URL='…' DIRECT_URL='…' npm run db:seed`.

## Making a schema change

1. Edit `prisma/schema.prisma`.
2. Create + apply the migration **against local**:
   ```bash
   npx prisma migrate dev --name <change>
   ```
3. Commit the generated `prisma/migrations/<timestamp>_<change>/` folder.
4. It ships to production when someone runs this **against the RDS** at deploy time:
   ```bash
   npx prisma migrate deploy
   ```
   `migrate deploy` applies pending committed migrations in order and never resets.

## Optional: a shared staging database

A second (staging) RDS is only worth it if you want a shared environment for
teammates or CI to hit before prod. It does not reduce duplicate work — local +
`migrate deploy` already covers that — it just adds an environment. Skip it for
solo development.
