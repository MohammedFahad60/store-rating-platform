"use strict";

const { DataTypes } = require("sequelize");

/**
 * 0002 - Stores
 *
 * Each store belongs to one owner (Users.ownerId). Foreign key, indexes and
 * the status enum are created here so the production schema is reproducible
 * from an empty MySQL 8 database.
 */
module.exports = {
  name: "create-stores",

  up: async (queryInterface) => {
    await queryInterface.createTable("Stores", {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },
      name: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      email: {
        type: DataTypes.STRING(255),
        allowNull: false,
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
        allowNull: false,
        defaultValue: "ACTIVE",
      },
      ownerId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "Users",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
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

    await queryInterface.addIndex("Stores", ["ownerId"], {
      name: "stores_owner_id_index",
    });
    await queryInterface.addIndex("Stores", ["name"], {
      name: "stores_name_index",
    });
    await queryInterface.addIndex("Stores", ["category"], {
      name: "stores_category_index",
    });
    await queryInterface.addIndex("Stores", ["status"], {
      name: "stores_status_index",
    });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable("Stores");
  },
};
