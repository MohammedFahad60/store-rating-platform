"use strict";

const { DataTypes } = require("sequelize");

/**
 * 0003 - Services
 *
 * Services belong to a store (Stores.storeId). The (storeId, active) index
 * supports the "customers only see active services" query.
 */
module.exports = {
  name: "create-services",

  up: async (queryInterface) => {
    await queryInterface.createTable("Services", {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },
      storeId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "Stores",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      name: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      price: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
      },
      estimatedMinutes: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 30,
      },
      active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
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

    await queryInterface.addIndex("Services", ["storeId"], {
      name: "services_store_id_index",
    });
    await queryInterface.addIndex("Services", ["storeId", "active"], {
      name: "services_store_id_active_index",
    });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable("Services");
  },
};
