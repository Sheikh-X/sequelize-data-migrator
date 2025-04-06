#!/bin/bash
# schema-dump-and-restore.sh
# This script dumps the schema from a source PostgreSQL database and restores it to a target database

# Source database connection parameters
SOURCE_DB_NAME=""
SOURCE_DB_USER=""
SOURCE_DB_PASSWORD=""
SOURCE_DB_HOST=""
SOURCE_DB_PORT="5432"

# Target database connection parameters
TARGET_DB_NAME=" "
TARGET_DB_USER=" "
TARGET_DB_PASSWORD=" "
TARGET_DB_HOST=" "
TARGET_DB_PORT="5432"

# Output file for schema
SCHEMA_FILE="schema_dump.sql"

# Export PGPASSWORD for passwordless operation
export PGPASSWORD="$SOURCE_DB_PASSWORD"

echo "Dumping schema from source database..."
pg_dump -h $SOURCE_DB_HOST -p $SOURCE_DB_PORT -U $SOURCE_DB_USER -d $SOURCE_DB_NAME \
  --schema-only --no-owner --no-acl > $SCHEMA_FILE

if [ $? -ne 0 ]; then
  echo "Error dumping schema from source database"
  exit 1
fi

echo "Schema dumped successfully to $SCHEMA_FILE"

# Switch to target database password
export PGPASSWORD="$TARGET_DB_PASSWORD"

echo "Restoring schema to target database..."
psql -h $TARGET_DB_HOST -p $TARGET_DB_PORT -U $TARGET_DB_USER -d $TARGET_DB_NAME -f $SCHEMA_FILE

if [ $? -ne 0 ]; then
  echo "Error restoring schema to target database"
  exit 1
fi

echo "Schema restored successfully to target database"

# Clean up
unset PGPASSWORD
echo "Schema migration completed"