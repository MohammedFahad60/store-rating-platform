"use strict";

const { DataTypes } = require("sequelize");

/**
 * 0009 - Audit Logs
 *
 * Immutable administrative audit trail. Records actor, action, entity and a
 * JSON metadata blob (never passwords/JWTs). No updatedAt - logs are
 * append-only. `actorUserId` is SET NULL if the actor account is removed so
 * the log survives.
 */
module.exports = {
  name: "create-audit-logs",

  up: async (queryInterface) => {
    await queryInterface.createTable("AuditLogs", {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },
      actorUserId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "Users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      action: {
        type: DataTypes.STRING(80),
        allowNull: false,
      },
      entityType: {
        type: DataTypes.STRING(80),
        allowNull: true,
      },
      entityId: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      metadata: {
        type: DataTypes.JSON,
        allowNull: true,
      },
      ipAddress: {
        type: DataTypes.STRING(45),
        allowNull: true,
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    });

    await queryInterface.addIndex("AuditLogs", ["actorUserId"], {
      name: "audit_logs_actor_index",
    });
    await queryInterface.addIndex("AuditLogs", ["entityType", "entityId"], {
      name: "audit_logs_entity_index",
    });
    await queryInterface.addIndex("AuditLogs", ["action"], {
      name: "audit_logs_action_index",
    });
    await queryInterface.addIndex("AuditLogs", ["createdAt"], {
      name: "audit_logs_created_index",
    });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable("AuditLogs");
  },
};
