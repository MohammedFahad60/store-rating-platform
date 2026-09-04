const sequelize = require("../config/db");

const User = require("./User");
const Store = require("./Store");
const Rating = require("./Rating");
const Service = require("./Service");
const Booking = require("./Booking");
const Favorite = require("./Favorite");
const Notification = require("./Notification");
const AuditLog = require("./AuditLog");
const StoreHour = require("./StoreHour");

// ==========================================
// ASSOCIATIONS
// ==========================================

// User → Stores (owner)
User.hasMany(Store, { foreignKey: "ownerId", onDelete: "CASCADE" });
Store.belongsTo(User, { foreignKey: "ownerId" });

// User → Ratings (customer reviews)
User.hasMany(Rating, { foreignKey: "userId", onDelete: "CASCADE" });
Rating.belongsTo(User, { foreignKey: "userId" });

// User → Bookings
User.hasMany(Booking, { foreignKey: "userId", onDelete: "CASCADE" });
Booking.belongsTo(User, { foreignKey: "userId" });

// User → Favorites
User.hasMany(Favorite, { foreignKey: "userId", onDelete: "CASCADE" });
Favorite.belongsTo(User, { foreignKey: "userId" });

// User → Notifications
User.hasMany(Notification, { foreignKey: "userId", onDelete: "CASCADE" });
Notification.belongsTo(User, { foreignKey: "userId" });

// User → AuditLogs
User.hasMany(AuditLog, { foreignKey: "actorUserId", onDelete: "SET NULL" });
AuditLog.belongsTo(User, { foreignKey: "actorUserId" });

// Store → Ratings
Store.hasMany(Rating, { foreignKey: "storeId", onDelete: "CASCADE" });
Rating.belongsTo(Store, { foreignKey: "storeId" });

// Store → Services
Store.hasMany(Service, { foreignKey: "storeId", onDelete: "CASCADE" });
Service.belongsTo(Store, { foreignKey: "storeId" });

// Store → Bookings
Store.hasMany(Booking, { foreignKey: "storeId", onDelete: "CASCADE" });
Booking.belongsTo(Store, { foreignKey: "storeId" });

// Store → Favorites
Store.hasMany(Favorite, { foreignKey: "storeId", onDelete: "CASCADE" });
Favorite.belongsTo(Store, { foreignKey: "storeId" });

// Store → StoreHours
Store.hasMany(StoreHour, { foreignKey: "storeId", onDelete: "CASCADE" });
StoreHour.belongsTo(Store, { foreignKey: "storeId" });

// Service → Bookings
Service.hasMany(Booking, { foreignKey: "serviceId", onDelete: "CASCADE" });
Booking.belongsTo(Service, { foreignKey: "serviceId" });

// Booking → Rating (a review can reference the booking it came from)
Booking.hasOne(Rating, { foreignKey: "bookingId", onDelete: "SET NULL" });
Rating.belongsTo(Booking, { foreignKey: "bookingId" });

module.exports = {
  sequelize,
  User,
  Store,
  Rating,
  Service,
  Booking,
  Favorite,
  Notification,
  AuditLog,
  StoreHour,
};
