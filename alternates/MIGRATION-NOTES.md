# Migration Notes: File Storage to PostgreSQL

This document summarizes the changes made to migrate from file-based storage to PostgreSQL database storage.

## Summary of Changes

### Backend Changes

1. **New Database Module** (`src/db/postgres.ts`)
   - PostgreSQL connection pooling
   - Batch insert functionality
   - Automatic table creation
   - Graceful connection management

2. **Updated Server** (`src/server.ts`)
   - Removed file writing logic
   - Removed download endpoint (`/download/:filename`)
   - Added database batch inserts
   - Added transaction handling
   - Removed `STORAGE_DIR` dependency
   - Added graceful shutdown for database pool

3. **Dependencies** (`package.json`)
   - Added `pg` (PostgreSQL client)
   - Added `@types/pg` (TypeScript types)

### Frontend Changes

1. **React Component** (`alternates/react/XmlParser.tsx`)
   - Removed `downloadUrl` from `ParseResult` interface
   - Removed download button and handler
   - Added success message indicating data saved to database
   - Updated UI to reflect database storage

2. **CSS** (`alternates/react/XmlParser.css`)
   - Removed download button styles

3. **Documentation**
   - Updated README files to reflect PostgreSQL usage
   - Added Kubernetes deployment guide
   - Updated examples and usage instructions

## Installation Steps

### 1. Install Dependencies

```bash
npm install
```

This will install the new `pg` package and its types.

### 2. Database Setup

Create a PostgreSQL database and configure connection:

```sql
CREATE DATABASE xmlparser;
CREATE USER xmlparser_user WITH PASSWORD 'your-password';
GRANT ALL PRIVILEGES ON DATABASE xmlparser TO xmlparser_user;
```

### 3. Environment Variables

Set the following environment variables:

```bash
DB_HOST=localhost
DB_PORT=5432
DB_NAME=xmlparser
DB_USER=xmlparser_user
DB_PASSWORD=your-password
DB_POOL_MAX=20
DB_BATCH_SIZE=1000
```

### 4. Build and Run

```bash
npm run build
npm start
```

The application will automatically create the `toys` table on first connection.

## Breaking Changes

1. **No Download Endpoint**: The `/download/:filename` endpoint has been removed
2. **No File Storage**: Files are no longer saved to disk
3. **API Response Change**: The final SSE message no longer includes `downloadUrl`
4. **Database Required**: PostgreSQL is now required (no longer optional)

## Migration Path

If you have existing file-based data:

1. Export existing JSON files from storage
2. Create a migration script to import into PostgreSQL:

```typescript
import { Pool } from 'pg';
import * as fs from 'fs';

const pool = new Pool({ /* config */ });
const files = fs.readdirSync('./storage');

for (const file of files) {
  if (file.endsWith('.json')) {
    const data = JSON.parse(fs.readFileSync(`./storage/${file}`, 'utf8'));
    for (const toy of data.toys) {
      await pool.query(
        'INSERT INTO toys (data, created_at) VALUES ($1, NOW())',
        [JSON.stringify(toy)]
      );
    }
  }
}
```

## Testing

1. **Unit Tests**: Update existing tests to mock database instead of file system
2. **Integration Tests**: Add database setup/teardown for integration tests
3. **Load Testing**: Test concurrent uploads and database connection pooling

## Rollback Plan

If you need to rollback:

1. Revert to previous git commit
2. Restore `STORAGE_DIR` environment variable
3. Remove `pg` dependency
4. Restore download endpoint code

## Performance Considerations

### Database Optimization

- **Batch Size**: Adjust `DB_BATCH_SIZE` based on your data size (default: 1000)
- **Connection Pool**: Adjust `DB_POOL_MAX` based on pod count and expected load
- **Indexes**: The application creates indexes on `batch_id` and `created_at`

### Monitoring

Monitor these metrics:
- Database connection pool utilization
- Batch insert performance
- Transaction commit times
- Database query performance

## Security Notes

1. **Credentials**: Store database credentials in secure secret management
2. **Connection Security**: Use SSL/TLS for database connections in production
3. **SQL Injection**: The code uses parameterized queries to prevent SQL injection
4. **Access Control**: Implement authentication/authorization as needed

## Next Steps

1. Install dependencies: `npm install`
2. Set up PostgreSQL database
3. Configure environment variables
4. Test the application
5. Deploy to Kubernetes (see `KUBERNETES-DEPLOYMENT.md`)
