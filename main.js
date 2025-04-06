require("dotenv").config();
const { Sequelize, Op } = require("sequelize");

// Configure production (source) database connection
const sourceConfig = {
  database: process.env.SOURCE_SQL_DB,
  username: process.env.SOURCE_SQL_USER,
  password: process.env.SOURCE_SQL_PASSWORD,
  host: process.env.SOURCE_SQL_HOST,
  port: process.env.SOURCE_SQL_PORT,
  dialect: "postgres",
  logging: false,
  dialectOptions: {
    ssl:
      process.env.SOURCE_ENV !== "DEVELOPMENT"
        ? {
            require: true,
          }
        : false,
  },
};

// Configure staging (target) database connection
const targetConfig = {
  database: process.env.TARGET_SQL_DB,
  username: process.env.TARGET_SQL_USER,
  password: process.env.TARGET_SQL_PASSWORD,
  host: process.env.TARGET_SQL_HOST,
  port: process.env.TARGET_SQL_PORT,
  dialect: "postgres",
  logging: false,
  dialectOptions: {
    ssl:
      process.env.TARGET_ENV !== "DEVELOPMENT"
        ? {
            require: true,
          }
        : false,
  },
};

// Initialize Sequelize connections
const sourceSequelize = new Sequelize(sourceConfig);
const targetSequelize = new Sequelize(targetConfig);

// Import models for both databases
const sourceModels = require("./models")(sourceSequelize, Sequelize.DataTypes);
const targetModels = require("./models")(targetSequelize, Sequelize.DataTypes);

// Helper function to check if a model has associations
const hasAssociations = (model) => {
  return model.associations && Object.keys(model.associations).length > 0;
};

// Track processed records to prevent circular references
const processedRecords = new Set();

// Helper function to get all associated records for a model instance
async function getAssociatedRecords(
  modelInstance,
  sourceModels,
  depth = 0,
  maxDepth = 3
) {
  // Prevent infinite recursion
  if (depth >= maxDepth) {
    return {};
  }

  const model = modelInstance.constructor;
  const modelName = model.name;
  const recordId = modelInstance.id;
  const recordKey = `${modelName}_${recordId}`;

  // Check if we've already processed this record to avoid circular references
  if (processedRecords.has(recordKey)) {
    return {};
  }

  // Mark this record as processed
  processedRecords.add(recordKey);

  const associations = model.associations || {};
  const associatedData = {};

  try {
    for (const [associationName, association] of Object.entries(associations)) {
      const associatedModel = association.target;
      const associationKey = association.foreignKey;

      if (association.associationType === "HasMany") {
        // Get records from has-many relationship
        const records = await associatedModel.findAll({
          where: { [associationKey]: modelInstance.id },
        });

        if (records.length > 0) {
          console.log(
            `Found ${records.length} ${associationName} for ${modelName} ID: ${recordId}`
          );

          associatedData[associationName] = await Promise.all(
            records.map(async (record) => {
              const plainRecord = record.get({ plain: true });
              // Recursively get deeper associations
              const nestedAssociations = await getAssociatedRecords(
                record,
                sourceModels,
                depth + 1,
                maxDepth
              );
              return { ...plainRecord, associations: nestedAssociations };
            })
          );
        }
      } else if (association.associationType === "BelongsTo") {
        // Get record from belongs-to relationship
        const foreignKeyValue = modelInstance[associationKey];
        if (foreignKeyValue) {
          const record = await associatedModel.findByPk(foreignKeyValue);
          if (record) {
            console.log(
              `Found ${associationName} for ${modelName} ID: ${recordId}`
            );

            const plainRecord = record.get({ plain: true });
            // Recursively get deeper associations
            const nestedAssociations = await getAssociatedRecords(
              record,
              sourceModels,
              depth + 1,
              maxDepth
            );
            associatedData[associationName] = {
              ...plainRecord,
              associations: nestedAssociations,
            };
          }
        }
      } else if (association.associationType === "BelongsToMany") {
        // Get records from many-to-many relationship
        const getterMethodName = `get${
          associationName.charAt(0).toUpperCase() + associationName.slice(1)
        }`;

        if (typeof modelInstance[getterMethodName] === "function") {
          const records = await modelInstance[getterMethodName]();

          if (records.length > 0) {
            console.log(
              `Found ${records.length} ${associationName} for ${modelName} ID: ${recordId}`
            );

            associatedData[associationName] = await Promise.all(
              records.map(async (record) => {
                const plainRecord = record.get({ plain: true });
                // Recursively get deeper associations
                const nestedAssociations = await getAssociatedRecords(
                  record,
                  sourceModels,
                  depth + 1,
                  maxDepth
                );
                return { ...plainRecord, associations: nestedAssociations };
              })
            );
          }
        } else {
          console.warn(
            `Warning: Getter method ${getterMethodName} not found for ${modelName}`
          );
        }
      }
    }
  } catch (error) {
    console.error(
      `Error getting associations for ${modelName} (ID: ${recordId}):`,
      error
    );
  }

  // Remove this record from the processed set when we're done with it
  // This allows it to be processed again in a different branch if necessary
  if (depth === 0) {
    processedRecords.clear(); // Only clear at the top level when we're done with the whole tree
  }

  return associatedData;
}

// Insert a record and its associations into the target database
async function insertRecordWithAssociations(
  data,
  modelName,
  targetModels,
  inserted = new Map()
) {
  // Skip if already inserted
  if (inserted.has(`${modelName}_${data.id}`)) {
    return inserted.get(`${modelName}_${data.id}`);
  }

  // Clone the data without association data for initial insert
  const { associations, ...recordData } = data;

  try {
    // Insert main record
    const targetModel = targetModels[modelName];

    if (!targetModel) {
      console.error(`Model ${modelName} not found in target database`);
      return null;
    }

    // Check if record already exists in target database
    let existingRecord = await targetModel.findByPk(data.id);
    let record;

    if (existingRecord) {
      // Update existing record
      await existingRecord.update(recordData);
      record = existingRecord;
      console.log(`Updated existing ${modelName} record ID: ${data.id}`);
    } else {
      // Create new record
      record = await targetModel.create(recordData);
      console.log(`Created new ${modelName} record ID: ${data.id}`);
    }

    // Store the inserted record in our map
    inserted.set(`${modelName}_${data.id}`, record);

    // Handle associations
    if (associations) {
      for (const [associationName, associationData] of Object.entries(
        associations
      )) {
        const association = targetModel.associations[associationName];

        if (!association) {
          console.warn(
            `Association ${associationName} not found for model ${modelName}`
          );
          continue;
        }

        const associatedModelName = association.target.name;

        if (Array.isArray(associationData)) {
          // Handle HasMany or BelongsToMany
          console.log(
            `Processing ${associationData.length} ${associationName} for ${modelName} ID: ${data.id}`
          );

          for (const assocItem of associationData) {
            const insertedAssoc = await insertRecordWithAssociations(
              assocItem,
              associatedModelName,
              targetModels,
              inserted
            );

            if (!insertedAssoc) continue;

            if (association.associationType === "HasMany") {
              await insertedAssoc.update({
                [association.foreignKey]: record.id,
              });
              console.log(
                `Set HasMany association for ${associatedModelName} ID: ${insertedAssoc.id}`
              );
            } else if (association.associationType === "BelongsToMany") {
              const adderMethodName = `add${
                associationName.charAt(0).toUpperCase() +
                associationName.slice(1).slice(0, -1)
              }`;

              if (typeof record[adderMethodName] === "function") {
                await record[adderMethodName](insertedAssoc);
                console.log(
                  `Set BelongsToMany association for ${associatedModelName} ID: ${insertedAssoc.id}`
                );
              } else {
                console.warn(
                  `Warning: Method ${adderMethodName} not found for ${modelName}`
                );
              }
            }
          }
        } else if (associationData) {
          // Handle BelongsTo
          console.log(
            `Processing BelongsTo ${associationName} for ${modelName} ID: ${data.id}`
          );

          const insertedAssoc = await insertRecordWithAssociations(
            associationData,
            associatedModelName,
            targetModels,
            inserted
          );

          if (!insertedAssoc) continue;

          // Set association for BelongsTo
          if (association.associationType === "BelongsTo") {
            await record.update({ [association.foreignKey]: insertedAssoc.id });
            console.log(
              `Set BelongsTo association for ${modelName} ID: ${record.id}`
            );
          }
        }
      }
    }

    return record;
  } catch (error) {
    console.error(`Error inserting ${modelName} (ID: ${data.id}):`, error);
    return null;
  }
}

async function migrateSampleData(
  startModel = "User",
  limit = 100,
  maxDepth = 3
) {
  try {
    console.log(
      `Starting migration of ${limit} ${startModel} records with max depth ${maxDepth}...`
    );

    // Test connections
    await sourceSequelize.authenticate();
    console.log("Source database connection established successfully.");

    await targetSequelize.authenticate();
    console.log("Target database connection established successfully.");

    // Create tables in target database if they don't exist
    console.log("Creating schema in target database if it does not exist...");
    await targetSequelize.sync({ alter: true });
    console.log("Schema synchronization complete.");

    // Get sample records from source
    const sourceModel = sourceModels[startModel];
    if (!sourceModel) {
      throw new Error(`Model ${startModel} not found in source database`);
    }

    const sampleRecords = await sourceModel.findAll({
      limit,
      order: [["createdAt", "DESC"]],
    });

    console.log(
      `Found ${sampleRecords.length} ${startModel} records in source database.`
    );

    // For each record, get associated data and insert into target
    for (const [index, record] of sampleRecords.entries()) {
      console.log(
        `Processing ${startModel} record ${index + 1} of ${
          sampleRecords.length
        } (ID: ${record.id})...`
      );

      // Get plain record data
      const plainRecord = record.get({ plain: true });
      console.log(`Got plain record data for ${startModel} ID: ${record.id}`);

      // Clear processed records set for each new root record
      processedRecords.clear();

      // Get all associated records
      console.log(`Getting associations for ${startModel} ID: ${record.id}...`);
      const associations = await getAssociatedRecords(
        record,
        sourceModels,
        0,
        maxDepth
      );
      console.log(
        `Completed gathering associations for ${startModel} ID: ${record.id}`
      );

      // Combine record with associations
      const fullRecord = { ...plainRecord, associations };

      // Insert record and all associations into target database
      console.log(
        `Inserting ${startModel} ID: ${record.id} into target database...`
      );
      await insertRecordWithAssociations(fullRecord, startModel, targetModels);
      console.log(
        `Completed processing ${startModel} record ${index + 1} (ID: ${
          record.id
        })`
      );
    }

    console.log(
      `Migration completed successfully. ${sampleRecords.length} ${startModel} records migrated with their associations.`
    );
  } catch (error) {
    console.error("Migration failed:", error);
  } finally {
    // Close connections
    await sourceSequelize.close();
    await targetSequelize.close();
  }
}

const modelName = process.argv[2] || "User";
const limit = parseInt(process.argv[3]) || 2;
const maxDepth = parseInt(process.argv[4]) || 3;

migrateSampleData(modelName, limit, maxDepth)
  .then(() => {
    console.log("Migration script finished.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Fatal error during migration:", err);
    process.exit(1);
  });
