# Sequelize Database Migration Tool

A Node.js tool for migrating data between two PostgreSQL databases with full association preservation.

## Overview

I did this because I had a database in production that I wanted to extract records to populate a staging database for tests and adding features on an inherited codebase which unfortunately didn't have seeder files nor migration files. Others might find it useful and make improvements to better fit their use case and performance needs.

This tool allows you to migrate a specified number of records from a source PostgreSQL database to a target PostgreSQL database while preserving all associations and relationships between records. It's particularly useful for:

- Creating realistic test environments with production-like data
- Migrating partial datasets between environments (production → staging, staging → development)
- Database backup and restoration with selective record migration

## Features

- Migrates records with complete relationship preservation (HasMany, BelongsTo, BelongsToMany)
- Configurable recursion depth for controlling how deep to follow associations
- Prevents circular references that could cause infinite loops
- Configurable via environment variables and command-line arguments
- Handles existing records (updates them instead of creating duplicates)

## Prerequisites

- Node.js 18.x or higher(I tested with 20 but other versions should be fine as well)
- Source and target PostgreSQL databases
- Sequelize models representing your database schema

## Installation

1. Clone this repository:

   ```bash
   git clone https://github.com/Sheikh-X/sequelize-data-migrator.git
   cd sequelize-data-migrator
   ```

2. Install dependencies:

   ```bash
   yarn install
   ```

3. Create a `.env` file with your database configurations similatr to the `.env.example` file :

   ```
   # Source Database (Production)
   SOURCE_SQL_DB=your_production_db
   SOURCE_SQL_USER=your_production_user
   SOURCE_SQL_PASSWORD=your_production_password
   SOURCE_SQL_HOST=your_production_host
   SOURCE_SQL_PORT=5432
   SOURCE_ENV=PRODUCTION

   # Target Database (Staging)
   TARGET_SQL_DB=your_staging_db
   TARGET_SQL_USER=your_staging_user
   TARGET_SQL_PASSWORD=your_staging_password
   TARGET_SQL_HOST=your_staging_host
   TARGET_SQL_PORT=5432
   TARGET_ENV=STAGING
   ```

## Usage

Run the migration script with:

```bash
node main.js [modelName] [limit] [maxDepth]
```

Where:

- `modelName`: The starting model to migrate (default: "User")
- `limit`: Number of records to migrate (default: 2)
- `maxDepth`: Maximum depth for recursively following associations (default: 3)

Example:

```bash
# Migrate 10 User records with a maximum association depth of 2
node main.js User 10 2

# Migrate 5 Order records with default association depth (3)
node main.js Order 5
```

### Schema Migration

To transfer the database schema from source to target:

```bash
./scripts/schema-dump-and-restore.sh
```

This script will:

1. Dump the schema from your source PostgreSQL database
2. Restore it to your target database
3. Preserve the structure without transferring data

The script uses the database connection parameters from your `.env` file, so make sure those are correctly configured before running it.

## How It Works

1. The script establishes connections to both source and target databases
2. It retrieves the specified number of records from the source database
3. For each record, it recursively fetches all associated records up to the specified depth
4. Records are then inserted into the target database, preserving all relationships
5. If a record already exists in the target (by ID), it's updated instead of duplicated

### Schema Migration Process

The `schema-dump-and-restore.sh` script:

1. Uses `pg_dump` to extract only the schema (tables, views, functions, etc.) from the source database
2. Removes any database-specific ownership or permission statements
3. Uses `psql` to apply the schema to the target database
4. Preserves database structure while allowing you to selectively migrate data using the main script

## Project Structure

```
sequelize-data-migrator/
├── main.js     # Main migration script
├── models/               # Sequelize model definitions
│   ├── index.js          # Model loader
│   └── [model files]     # Individual model
definitions
├── scripts/              # Utility scripts
│   └── schema-dump-and-restore.sh   # Script to dump and restore database schema
definitions
├── .env                  # Environment variables configuration
└── README.md             # This documentation
```

## Customization

### Working with Different Models

Ensure your Sequelize models are properly defined in the `models` directory and have the correct associations set up. The script relies on these model definitions to understand the relationships between entities.

### Increasing Performance

For large databases, you can:

1. Lower the `maxDepth` parameter to reduce the number of relationships followed
2. Use more specific queries in the main function rather than ordering by `createdAt`
3. Add indexes to frequently queried columns in both databases

## Troubleshooting

### Common Issues

1. **Migration hangs or takes too long**

   - Reduce the `maxDepth` parameter
   - Check for circular references in your database schema
   - Look for models with extremely large numbers of associations

2. **Database connection errors**

   - Verify your connection parameters in the `.env` file
   - Ensure database users have appropriate permissions
   - Check if SSL is required for your database connections

3. **Missing associations in target database**
   - Ensure models have the same association definitions in both environments
   - Check the logs for specific association errors

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.
