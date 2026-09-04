"use strict";

const { DataTypes } = require("sequelize");

/**
 * 0010 - Ratings: moderation + owner reply
 *
 * Reviews are never hard-deleted. `status` controls visibility:
 *   VISIBLE (default) - shown to everyone
 *   HIDDEN             - hidden by an admin (restorable)
 * `ownerReply` lets the store owner respond to a review (the customer is
 * notified).
 */
module.exports = {
  name: "ratings-moderation",

  up: async (queryInterface) => {
    await queryInterface.addColumn("Ratings", "status", {
      type: DataTypes.ENUM("VISIBLE", "HIDDEN"),
      allowNull: false,
      defaultValue: "VISIBLE",
    });

    await queryInterface.addColumn("Ratings", "ownerReply", {
      type: DataTypes.TEXT,
      allowNull: true,
    });

    await queryInterface.addIndex("Ratings", ["storeId", "status", "createdAt"], {
      name: "ratings_store_status_created_index",
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeIndex("Ratings", "ratings_store_status_created_index");
    await queryInterface.removeColumn("Ratings", "ownerReply");
    await queryInterface.removeColumn("Ratings", "status");
  },
};
