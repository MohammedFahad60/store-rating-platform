"use strict";

const { DataTypes } = require("sequelize");

/**
 * 0011 - StoreHours (per-weekday operating hours)
 *
 * dayOfWeek: 1 = Monday ... 7 = Sunday. A day may be `closed`.
 * `openTime`/`closeTime` are stored as TIME and validated at the API layer
 * (close must be > open). One row per (storeId, dayOfWeek) - unique.
 * Booking availability checks use these rows; stores without rows fall back
 * to Stores.openingTime/closingTime (legacy default hours).
 */
module.exports = {
  name: "create-store-hours",

  up: async (queryInterface) => {
    await queryInterface.createTable("StoreHours", {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },
      storeId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "Stores", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      dayOfWeek: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      openTime: {
        type: DataTypes.TIME,
        allowNull: true,
      },
      closeTime: {
        type: DataTypes.TIME,
        allowNull: true,
      },
      closed: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
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

    await queryInterface.addIndex("StoreHours", ["storeId", "dayOfWeek"], {
      unique: true,
      name: "unique_store_day_hours",
    });
    await queryInterface.addIndex("StoreHours", ["storeId"], {
      name: "store_hours_store_id_index",
    });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable("StoreHours");
  },
};
