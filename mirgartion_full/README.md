# Full Access to PostgreSQL Migration

This tool migrates data from Microsoft Access (.accdb) to PostgreSQL in two phases:
1. **Phase 1**: Stream data from Access to a temporary PostgreSQL database (port 5433)
2. **Phase 2**: Transform and migrate data to the production database using Prisma

## Prerequisites

- Docker Desktop installed and running
- Node.js 18+ installed
- Microsoft Access Driver installed (`Microsoft.ACE.OLEDB.12.0`)
- Access database file (place as `DatabaseBig.accdb` in this folder)

## Quick Start

```bash
# 1. Start temporary PostgreSQL
docker-compose up -d

# 2. Install dependencies
npm install

# 3. Generate Prisma client
npx prisma generate

# 4. Push schema to production database
npx prisma db push

# 5. Run migration
npm run migrate
```

## Configuration (.env)

| Variable | Default | Description |
|----------|---------|-------------|
| `ACCESS_DB_PATH` | `./DatabaseBig.accdb` | Path to Access file |
| `PG_HOST` | `localhost` | Temporary PostgreSQL host |
| `PG_PORT` | `5433` | Temporary PostgreSQL port |
| `DATABASE_URL` | `postgresql://...5432/mbdatabase` | Production database URL |

## Cleanup

```bash
# Stop and remove temporary containers
docker-compose down

# Remove all data (including volumes)
docker-compose down -v
```
