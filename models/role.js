//this and the user model file have only be added as samples, you should delete them and replace with your own models
"use strict";

module.exports = function (sequelize, DataTypes) {
  var Role = sequelize.define(
    "Role",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      name: { type: DataTypes.STRING, allowNull: false },
      code: { type: DataTypes.STRING, allowNull: false },
      maxLimit: { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 0.0 },
      minLimit: { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 0.0 },
      workFlowLevel: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
      },
    },
    {
      timestamps: true,
      tableName: "roles",
      freezeTableName: true,
    }
  );

  Role.associate = function (models) {
    Role.belongsToMany(models.User, {
      as: "users",
      through: "users_roles",
      sourceKey: "id",
      foreignKey: { name: "RoleId", primaryKey: false, references: null },
      constraints: false,
    });
  };
  return Role;
};
