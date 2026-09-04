"use strict";

const { DataTypes } = require("sequelize");

/**
 * 0007 - Favorites
 *
 * A customer can favorite a store. The (userId, storeId) unique constraint
 * is enforced by the database - duplicates are impossible.
 */
module.exports = {
  name: "create-favorites",

  up: async (queryInterface) => {
    await queryInterface.createTable("Favorites", {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "Users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      storeId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "Stores", key: "id" },
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

    await queryInterface.addIndex("Favorites", ["userId", "storeId"], {
      unique: true,
      name: "unique_user_store_favorite",
    });
    await queryInterface.addIndex("Favorites", ["storeId"], {
      name: "favorites_store_id_index",
    });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable("Favorites");
  },
};
