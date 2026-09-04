const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

/**
 * Customer favorite (userId, storeId). The unique index is enforced by the
 * database so duplicate favorites are impossible.
 */
const Favorite = sequelize.define(
  "Favorite",
  {
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    storeId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
  },
  {
    tableName: "Favorites",
    indexes: [
      {
        unique: true,
        fields: ["userId", "storeId"],
        name: "unique_user_store_favorite",
      },
      { fields: ["storeId"], name: "favorites_store_id_index" },
    ],
  }
);

module.exports = Favorite;
