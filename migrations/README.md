## Migrations

- `0001_initial_schema.sql`: core schema, constraints, and indexes
- `0002_default_event_settings.sql`: inserts singleton default settings row
- `0003_remove_team_upper_cap.sql`: removes the database hard upper cap on `maximum_teams`
- `0004_registration_attempts.sql`: adds public registration rate-limiting storage

Apply locally:

```bash
npm run db:migrate
```

The migration flow is append-only. Do not modify applied migrations; create a new migration file for schema changes.
