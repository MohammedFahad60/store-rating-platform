"use strict";

const { DataTypes } = require("sequelize");

/**
 * 0005 - Ratings
 *
 * A rating is a (userId, storeId) pair - unique - optionally linked to the
 * completed booking it came from (bookingId, SET NULL if the booking is
 * removed). Foreign keys and the uniqueness index are created here.
 */
module.exports = {
  name: "create-ratings",

  up: async (queryInterface) => {
    await queryInterface.createTable("Ratings", {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "Users",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
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
      bookingId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: "Bookings",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      rating: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      comment: {
        type: DataTypes.TEXT,
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

    await queryInterface.addIndex("Ratings", ["userId", "storeId"], {
      unique: true,
      name: "unique_user_store_rating",
    });
    await queryInterface.addIndex("Ratings", ["storeId"], {
      name: "ratings_store_id_index",
    });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable("Ratings");
  },
};
