"use strict";

const { DataTypes } = require("sequelize");

/**
 * 0001 - Users
 *
 * Migration creates the Users table with the primary key, unique email
 * constraint, role enum, password-change timestamp and audit timestamps.
 * Reproducible from an empty MySQL 8 database (and SQLite for tests).
 */
module.exports = {
  name: "create-users",

  up: async (queryInterface) => {
    await queryInterface.createTable("Users", {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },
      name: {
        type: DataTypes.STRING(60),
        allowNull: false,
      },
      email: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      password: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      address: {
        type: DataTypes.STRING(400),
        allowNull: true,
      },
      role: {
        type: DataTypes.ENUM("ADMIN", "USER", "OWNER"),
        allowNull: false,
        defaultValue: "USER",
      },
      // Audit timestamp of the last password change.
      passwordChangedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      // JWT invalidation counter: increased on every password change.
      // Tokens carry the version they were issued with; mismatches are
      // rejected by authMiddleware (precise, no clock-granularity issues).
      tokenVersion: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    });

    await queryInterface.addIndex("Users", ["email"], {
      unique: true,
      name: "users_email_unique",
    });

    await queryInterface.addIndex("Users", ["role"], {
      name: "users_role_index",
    });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable("Users");
  },
};
