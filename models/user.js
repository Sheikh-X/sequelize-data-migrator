//this and the role model file have only be added as samples, you should delete them and replace with your own models
"use strict";

module.exports = function (sequelize, DataTypes) {
  var User = sequelize.define(
    "User",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      username: { type: DataTypes.STRING, allowNull: false, unique: true },
      password: { type: DataTypes.STRING, allowNull: false },
    },
    {
      timestamps: true,
      tableName: "users",
      freezeTableName: true,
    }
  );

  User.associate = function (models) {
    User.belongsToMany(models.Role, {
      as: "roles",
      through: "users_roles",
      sourceKey: "id",
      foreignKey: { name: "UserId", primaryKey: false, references: null },
      constraints: false,
    });
  };
  return User;
};
