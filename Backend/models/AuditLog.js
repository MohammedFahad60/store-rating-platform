const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

/**
 * Immutable administrative audit log (append-only, no updatedAt).
 */
const AuditLog = sequelize.define(
  "AuditLog",
  {
    actorUserId: {
      type: DataTypes.INTEGER,
      allowNull: true,
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
  },
  {
    tableName: "AuditLogs",
    updatedAt: false,
    indexes: [
      { fields: ["actorUserId"], name: "audit_logs_actor_index" },
      { fields: ["entityType", "entityId"], name: "audit_logs_entity_index" },
      { fields: ["action"], name: "audit_logs_action_index" },
      { fields: ["createdAt"], name: "audit_logs_created_index" },
    ],
  }
);

module.exports = AuditLog;
