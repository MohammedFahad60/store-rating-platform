"use strict";

const { DataTypes } = require("sequelize");

/**
 * 0006 - Users: phone + account status
 *
 * Customer profile needs a phone number; admins need the ability to
 * deactivate/re-activate accounts (login + tokens of disabled users are
 * rejected by the auth layer). No password/JWT data is stored here.
 */
module.exports = {
  name: "users-phone-status",

  up: async (queryInterface) => {
    await queryInterface.addColumn("Users", "phone", {
      type: DataTypes.STRING(20),
      allowNull: true,
    });

    await queryInterface.addColumn("Users", "status", {
      type: DataTypes.ENUM("ACTIVE", "DISABLED"),
      allowNull: false,
      defaultValue: "ACTIVE",
    });

    await queryInterface.addIndex("Users", ["status"], {
      name: "users_status_index",
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeIndex("Users", "users_status_index");
    await queryInterface.removeColumn("Users", "status");
    await queryInterface.removeColumn("Users", "phone");
  },
};
