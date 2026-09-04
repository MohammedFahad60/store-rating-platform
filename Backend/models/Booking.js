const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const Booking = sequelize.define(
  "Booking",
  {
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    storeId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    serviceId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    bookingDate: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },

    // Appointment start time (HH:MM, 24h). Required for new bookings and
    // validated against the store's operating hours at the API layer.
    startTime: {
      type: DataTypes.TIME,
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM(
        "PENDING",
        "CONFIRMED",
        "IN_PROGRESS",
        "COMPLETED",
        "CANCELLED",
        "REJECTED"
      ),
      defaultValue: "PENDING",
      allowNull: false,
    },
    // Price snapshot taken from the service at booking time.
    price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      validate: {
        min: 0,
      },
    },
    notes: {
      type: DataTypes.STRING(1000),
      allowNull: true,
    },
  },
  {
    tableName: "Bookings",
    indexes: [
      { fields: ["userId"] },
      { fields: ["storeId", "status"] },
      { fields: ["serviceId"] },
      { fields: ["bookingDate"] },
      {
        fields: ["storeId", "bookingDate", "startTime", "status"],
        name: "bookings_store_date_time_status_index",
      },
    ],
  }
);

module.exports = Booking;
