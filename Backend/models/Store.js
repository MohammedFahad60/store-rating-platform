const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const Store = sequelize.define(
  "Store",
  {
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
      validate: {
        notEmpty: { msg: "Store name is required" },
        len: {
          args: [2, 100],
          msg: "Store name must be between 2 and 100 characters",
        },
      },
    },

    email: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        isEmail: true,
      },
    },

    phone: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },

    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    category: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },

    address: {
      type: DataTypes.STRING(400),
      allowNull: false,
    },

    latitude: {
      type: DataTypes.DECIMAL(10, 8),
      allowNull: true,
    },

    longitude: {
      type: DataTypes.DECIMAL(11, 8),
      allowNull: true,
    },

    openingTime: {
      type: DataTypes.TIME,
      allowNull: true,
    },

    closingTime: {
      type: DataTypes.TIME,
      allowNull: true,
    },

    status: {
      type: DataTypes.ENUM("ACTIVE", "INACTIVE", "SUSPENDED"),
      defaultValue: "ACTIVE",
      allowNull: false,
    },

    ownerId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
  },
  {
    tableName: "Stores",
    indexes: [
      { fields: ["ownerId"] },
      { fields: ["name"] },
      { fields: ["category"] },
      { fields: ["status"] },
    ],
  }
);

module.exports = Store;
