const { Store } = require("../models");

/**
 * Resolve the store owned by a user.
 *
 * Product rule: an OWNER account manages exactly one store in this version.
 * The store is always derived from the authenticated user (JWT), never from
 * a storeId supplied by the frontend, so an owner can never act on another
 * owner's store.
 */
async function findOwnerStore(ownerId) {
  return Store.findOne({ where: { ownerId } });
}

module.exports = { findOwnerStore };
