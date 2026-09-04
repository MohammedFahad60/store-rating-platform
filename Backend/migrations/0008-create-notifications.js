"use strict";

const { DataTypes } = require("sequelize");

/**
 * 0008 - Notifications (in-app)
 *
 * Internal notification feed. Indexed by (userId, read, createdAt) so the
 * unread count and paginated feed queries stay cheap. `metadata` is a JSON
 * blob (e.g. { bookingId, storeId }) - never passwords or JWTs.
 */
module.exports = {
  name: "create-notifications",

  up: async (queryInterface) => {
    await queryInterface.createTable("Notifications", {
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
      type: {
        type: DataTypes.STRING(60),
        allowNull: false,
      },
      title: {
        type: DataTypes.STRING(200),
        allowNull: false,
      },
      message: {
        type: DataTypes.STRING(1000),
        allowNull: true,
      },
      read: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      metadata: {
        type: DataTypes.JSON,
        allowNull: true,
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

    await queryInterface.addIndex("Notifications", ["userId", "read", "createdAt"], {
      name: "notifications_user_read_created_index",
    });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable("Notifications");
  },
};
