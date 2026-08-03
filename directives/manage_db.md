# Directive: Manage Database Maintenance

## Goal
Perform routine maintenance on the system databases, including running Alembic migrations, clearing stale in-memory sessions, and removing orphaned SQLite files.

## Inputs
- None required (runs on schedule or manually triggered).

## Tools / Scripts to Use
- `execution/db_cleanup.py`: Run this script to identify and delete stale sessions and dangling `.db` files.
- `alembic upgrade head`: Run this command from the `backend/` directory to apply any pending database schema migrations.

## Outputs
- Clean `backend/db/` directory.
- Updated schema matching models.

## Edge Cases
- **Active Interviews:** The cleanup script must ensure it does not delete sessions that have been active within the last 30 minutes.
- **Migration Conflicts:** If Alembic reports a conflict or downgrade error, halt maintenance and notify the admin.
