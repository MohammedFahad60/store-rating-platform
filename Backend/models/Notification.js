const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

/**
 * In-app notification. `metadata` is a JSON blob (ids only - never
 * passwords/JWTs). The (userId, read, createdAt) index powers the unread
 * count and the paginated feed.
 */
const Notification = sequelize.define(
  "Notification",
  {
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
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
  },
  {
    tableName: "Notifications",
    indexes: [
      {
        fields: ["userId", "read", "createdAt"],
        name: "notifications_user_read_created_index",
      },
    ],
  }
);

module.exports = Notification;
