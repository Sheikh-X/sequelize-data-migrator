"use strict";

const fs = require("fs");
const path = require("path");
const Sequelize = require("sequelize");
const basename = path.basename(__filename);

/**
 * Initialize models with a Sequelize instance
 * @param {Sequelize} sequelize - Sequelize instance to use
 * @param {Object} DataTypes - Sequelize DataTypes
 * @returns {Object} Object containing all models
 */
module.exports = function (sequelize, DataTypes) {
  const db = {};

  // Read all model files in the directory
  fs.readdirSync(__dirname)
    .filter((file) => {
      return (
        file.indexOf(".") !== 0 && file !== basename && file.slice(-3) === ".js"
      );
    })
    .forEach((file) => {
      // Import each model
      const model = require(path.join(__dirname, file))(sequelize, DataTypes);
      db[model.name] = model;
    });

  // Set up associations between models
  Object.keys(db).forEach((modelName) => {
    if (db[modelName].associate) {
      db[modelName].associate(db);
    }
  });

  db.sequelize = sequelize;
  db.Sequelize = Sequelize;

  return db;
};
