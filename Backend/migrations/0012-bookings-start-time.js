"use strict";

const { DataTypes } = require("sequelize");

/**
 * 0012 - Bookings: appointment start time
 *
 * Adds `startTime` (HH:MM) to bookings. Kept nullable at the DB level so
 * existing rows survive the migration; the booking API requires it for all
 * NEW bookings and the seed backfills it. The composite index makes the
 * store + date + time availability check cheap.
 */
module.exports = {
  name: "bookings-start-time",

  up: async (queryInterface) => {
    await queryInterface.addColumn("Bookings", "startTime", {
      type: DataTypes.TIME,
      allowNull: true,
    });

    await queryInterface.addIndex("Bookings", ["storeId", "bookingDate", "startTime", "status"], {
      name: "bookings_store_date_time_status_index",
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeIndex("Bookings", "bookings_store_date_time_status_index");
    await queryInterface.removeColumn("Bookings", "startTime");
  },
};
