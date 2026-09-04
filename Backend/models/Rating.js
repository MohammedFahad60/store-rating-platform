const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const Rating = sequelize.define(
  "Rating",
  {
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

    storeId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

    // Optional provenance: the completed booking this review belongs to.
    bookingId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },

    rating: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        min: 1,
        max: 5,
      },
    },

    // Review text (optional)
    comment: {
      type: DataTypes.TEXT,
      allowNull: true,
      validate: {
        len: {
          args: [0, 1000],
          msg: "Review cannot exceed 1000 characters",
        },
      },
    },

    // Moderation: VISIBLE (default) or HIDDEN by an admin. Soft only.
    status: {
      type: DataTypes.ENUM("VISIBLE", "HIDDEN"),
      allowNull: false,
      defaultValue: "VISIBLE",
    },

    // Optional store-owner response to the review.
    ownerReply: {
      type: DataTypes.TEXT,
      allowNull: true,
      validate: {
        len: {
          args: [0, 2000],
          msg: "Reply cannot exceed 2000 characters",
        },
      },
    },
  },
  {
    tableName: "Ratings",
    indexes: [
      {
        unique: true,
        fields: ["userId", "storeId"],
        name: "unique_user_store_rating",
      },
      { fields: ["storeId"] },
      { fields: ["storeId", "status", "createdAt"], name: "ratings_store_status_created_index" },
    ],
  }
);

module.exports = Rating;
