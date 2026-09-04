"use strict";

const { DataTypes } = require("sequelize");

/**
 * 0004 - Bookings
 *
 * A booking links a customer (Users.userId), a store (Stores.storeId) and a
 * service (Services.serviceId), and snapshots the service price. All foreign
 * keys, the status enum and the query indexes are created here.
 */
module.exports = {
  name: "create-bookings",

  up: async (queryInterface) => {
    await queryInterface.createTable("Bookings", {
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
      serviceId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "Services",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      bookingDate: {
        type: DataTypes.DATEONLY,
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
        allowNull: false,
        defaultValue: "PENDING",
      },
      price: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
      },
      notes: {
        type: DataTypes.STRING(1000),
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

    await queryInterface.addIndex("Bookings", ["userId"], {
      name: "bookings_user_id_index",
    });
    await queryInterface.addIndex("Bookings", ["storeId", "status"], {
      name: "bookings_store_id_status_index",
    });
    await queryInterface.addIndex("Bookings", ["serviceId"], {
      name: "bookings_service_id_index",
    });
    await queryInterface.addIndex("Bookings", ["bookingDate"], {
      name: "bookings_booking_date_index",
    });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable("Bookings");
  },
};
