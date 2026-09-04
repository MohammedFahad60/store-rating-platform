const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const Service = sequelize.define(
  "Service",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },

    storeId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
      validate: {
        notEmpty: {
          msg: "Service name is required",
        },
        len: {
          args: [2, 100],
          msg: "Service name must be between 2 and 100 characters",
        },
      },
    },

    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
      validate: {
        min: {
          args: [0],
          msg: "Price cannot be negative",
        },
      },
    },

    estimatedMinutes: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 30,
      validate: {
        min: {
          args: [1],
          msg: "Estimated time must be at least 1 minute",
        },
      },
    },

    active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
  },
  {
    tableName: "Services",
    indexes: [{ fields: ["storeId"] }, { fields: ["storeId", "active"] }],
  }
);

module.exports = Service;