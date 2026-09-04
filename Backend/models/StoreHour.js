const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

/**
 * Per-weekday operating hours.
 * dayOfWeek: 1 = Monday ... 7 = Sunday. `closed` days ignore open/close
 * times. Unique (storeId, dayOfWeek).
 */
const StoreHour = sequelize.define(
  "StoreHour",
  {
    storeId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    dayOfWeek: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        min: 1,
        max: 7,
      },
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
  },
  {
    tableName: "StoreHours",
    indexes: [
      {
        unique: true,
        fields: ["storeId", "dayOfWeek"],
        name: "unique_store_day_hours",
      },
      { fields: ["storeId"], name: "store_hours_store_id_index" },
    ],
  }
);

module.exports = StoreHour;
