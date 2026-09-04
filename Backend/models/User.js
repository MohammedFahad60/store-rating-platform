const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const User = sequelize.define(
  "User",
  {
    name: {
      type: DataTypes.STRING(60),
      allowNull: false,
    },

    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
    },

    password: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    address: {
      type: DataTypes.STRING(400),
    },

    phone: {
      type: DataTypes.STRING(20),
      allowNull: true,
      validate: {
        is: {
          args: [/^[0-9+\-\s()]{7,20}$/],
          msg: "Phone number is invalid",
        },
      },
    },

    role: {
      type: DataTypes.ENUM("ADMIN", "USER", "OWNER"),
      defaultValue: "USER",
    },

    // Account status: admins may disable a user (login + tokens rejected).
    status: {
      type: DataTypes.ENUM("ACTIVE", "DISABLED"),
      allowNull: false,
      defaultValue: "ACTIVE",
    },

    // Audit timestamp of the last password change.
    passwordChangedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    // JWT invalidation counter: increased on every password change. Tokens
    // carry the version they were issued with; mismatches are rejected by
    // authMiddleware (token invalidation on password change).
    tokenVersion: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
  },
  {
    tableName: "Users",
    indexes: [
      { unique: true, fields: ["email"], name: "users_email_unique" },
      { fields: ["role"], name: "users_role_index" },
    ],
  }
);

module.exports = User;