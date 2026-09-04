const { Op } = require("sequelize");
const { sequelize, Service, Store, Booking } = require("../models");
const { ApiError } = require("../utils/http");
const { validateServiceFields, parsePageLimit, parseSortField, parseSortDirection } = require("../utils/validators");
const { findOwnerStore } = require("../utils/ownerStore");
const { audit, ACTIONS } = require("../utils/audit");
const { notify, TYPES } = require("../utils/notify");

// ==========================================
// OWNER: services of the owner's store + store info
// GET /api/services/my-store
// ==========================================
exports.getMyStore = async (req, res) => {
  const store = await findOwnerStore(req.user.id);
  if (!store) throw new ApiError(404, "No store is assigned to your owner account");

  const services = await Service.findAll({
    where: { storeId: store.id },
    order: [["createdAt", "DESC"]],
  });

  res.json({
    success: true,
    store: {
      id: store.id,
      name: store.name,
      category: store.category,
      address: store.address,
      email: store.email,
      status: store.status,
    },
    services,
  });
};

// ==========================================
// OWNER: services with search / filter / sort / pagination / stats
// GET /api/services/manage?search=&active=&sort=&order=&page=&limit=
// ==========================================
exports.getManagedServices = async (req, res) => {
  const store = await findOwnerStore(req.user.id);
  if (!store) throw new ApiError(404, "No store is assigned to your owner account");

  const { page, limit, offset } = parsePageLimit(req.query, { max: 50, defaultLimit: 10 });
  const search = (req.query.search || "").trim();
  const active = req.query.active;
  const sort = parseSortField(req.query.sort, ["created", "name", "price", "duration"], "created");
  const direction = parseSortDirection(req.query.order);

  const where = { storeId: store.id };
  if (active === "true") where.active = true;
  else if (active === "false") where.active = false;
  if (search) {
    const like = `%${search}%`;
    where[Op.or] = [
      { name: { [Op.like]: like } },
      { description: { [Op.like]: like } },
    ];
  }

  const orderMap = {
    created: [["createdAt", direction]],
    name: [["name", direction]],
    price: [["price", direction]],
    duration: [["estimatedMinutes", direction]],
  };

  const { count, rows } = await Service.findAndCountAll({
    where,
    order: orderMap[sort],
    limit,
    offset,
    distinct: true,
  });

  // Statistics for this store only.
  const [total, activeCount, inactiveCount, bookings] = await Promise.all([
    Service.count({ where: { storeId: store.id } }),
    Service.count({ where: { storeId: store.id, active: true } }),
    Service.count({ where: { storeId: store.id, active: false } }),
    Booking.findAll({
      where: { storeId: store.id },
      attributes: ["serviceId"],
      raw: true,
    }),
  ]);

  const usageByService = {};
  for (const b of bookings) {
    usageByService[b.serviceId] = (usageByService[b.serviceId] || 0) + 1;
  }

  res.json({
    success: true,
    services: rows.map((s) => ({
      id: s.id,
      storeId: s.storeId,
      name: s.name,
      description: s.description,
      price: Number(s.price),
      estimatedMinutes: s.estimatedMinutes,
      active: s.active,
      bookingCount: usageByService[s.id] || 0,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    })),
    stats: { total, activeCount, inactiveCount },
    pagination: { page, limit, total: count, totalPages: Math.ceil(count / limit) || 0 },
  });
};

// ==========================================
// SERVICES OF A STORE (customers see only active ones)
// GET /api/services/store/:storeId
// ==========================================
exports.getStoreServices = async (req, res) => {
  const storeId = Number.parseInt(req.params.storeId, 10);
  if (!Number.isInteger(storeId)) throw new ApiError(400, "Invalid store id");

  const store = await Store.findByPk(storeId);
  if (!store) throw new ApiError(404, "Store not found");

  const isOwner = store.ownerId === req.user.id;
  if (store.status !== "ACTIVE" && !isOwner) {
    throw new ApiError(403, "This store is currently unavailable");
  }

  const where = { storeId: store.id };
  if (!isOwner) where.active = true;

  const services = await Service.findAll({
    where,
    order: [["price", "ASC"]],
  });

  res.json({
    success: true,
    store: { id: store.id, name: store.name },
    services,
  });
};

// ==========================================
// SERVICE DETAIL (customer & owner)
// GET /api/services/:id
// ==========================================
exports.getServiceDetail = async (req, res) => {
  const serviceId = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(serviceId)) throw new ApiError(400, "Invalid service id");

  const service = await Service.findByPk(serviceId, {
    include: [
      {
        model: Store,
        attributes: ["id", "name", "category", "address", "phone", "status", "description"],
      },
    ],
  });
  if (!service) throw new ApiError(404, "Service not found");

  const isOwner = service.Store?.ownerId === req.user.id;
  const available = service.active && service.Store?.status === "ACTIVE";
  if (!available && !isOwner) {
    throw new ApiError(403, "This service is currently unavailable");
  }

  res.json({
    success: true,
    service: {
      id: service.id,
      storeId: service.storeId,
      name: service.name,
      description: service.description,
      price: Number(service.price),
      estimatedMinutes: service.estimatedMinutes,
      active: service.active,
      store: {
        id: service.Store?.id,
        name: service.Store?.name,
        category: service.Store?.category,
        address: service.Store?.address,
        phone: service.Store?.phone,
        status: service.Store?.status,
        description: service.Store?.description,
      },
    },
  });
};

// ==========================================
// OWNER: create a service (storeId derived from JWT, never from the body)
// POST /api/services
// ==========================================
exports.createService = async (req, res) => {
  const { name, description, price, estimatedMinutes } = req.body || {};

  const errors = validateServiceFields({ name, description, price, estimatedMinutes });
  if (errors.length > 0) throw new ApiError(400, errors[0], errors);

  const store = await findOwnerStore(req.user.id);
  if (!store) throw new ApiError(404, "No store is assigned to your owner account");

  const service = await Service.create({
    storeId: store.id,
    name: name.trim(),
    description: description ? String(description).trim() : null,
    price: Number(price),
    estimatedMinutes: Number(estimatedMinutes),
    active: true,
  });

  await audit(req, {
    action: ACTIONS.SERVICE_CREATE,
    entityType: "Service",
    entityId: service.id,
    metadata: { name: service.name },
  });

  res.status(201).json({
    success: true,
    message: "Service created successfully",
    service,
  });
};

// ==========================================
// OWNER: update a service (activation/deactivation via `active`)
// PUT /api/services/:id
// ==========================================
exports.updateService = async (req, res) => {
  const serviceId = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(serviceId)) throw new ApiError(400, "Invalid service id");

  const store = await findOwnerStore(req.user.id);
  if (!store) throw new ApiError(404, "No store is assigned to your owner account");

  const service = await Service.findOne({ where: { id: serviceId, storeId: store.id } });
  if (!service) throw new ApiError(404, "Service not found");

  const body = req.body || {};
  const hasActive = typeof body.active === "boolean";
  const wasActive = service.active;

  const payload = {};

  if (body.name !== undefined || body.description !== undefined) {
    const validationErrors = validateServiceFields({
      name: body.name !== undefined ? body.name : service.name,
      description: body.description !== undefined ? body.description : service.description,
      price: body.price !== undefined ? body.price : service.price,
      estimatedMinutes: body.estimatedMinutes !== undefined ? body.estimatedMinutes : service.estimatedMinutes,
    });
    if (validationErrors.length > 0) throw new ApiError(400, validationErrors[0], validationErrors);
  }

  // Prices and durations are ALWAYS re-validated server-side, even when only
  // the `active` flag is sent.
  if (body.price !== undefined || body.estimatedMinutes !== undefined) {
    const errs = validateServiceFields({
      name: service.name,
      description: service.description,
      price: body.price !== undefined ? body.price : service.price,
      estimatedMinutes: body.estimatedMinutes !== undefined ? body.estimatedMinutes : service.estimatedMinutes,
    });
    if (errs.length > 0) throw new ApiError(400, errs[0], errs);
  }

  if (body.name !== undefined) payload.name = String(body.name).trim();
  if (body.description !== undefined) {
    payload.description = body.description === null || String(body.description).trim() === ""
      ? null
      : String(body.description).trim();
  }
  if (body.price !== undefined) payload.price = Number(body.price);
  if (body.estimatedMinutes !== undefined) payload.estimatedMinutes = Number(body.estimatedMinutes);

  const deactivating = hasActive && !body.active && wasActive;
  if (hasActive) payload.active = body.active;

  await service.update(payload);

  await audit(req, {
    action: deactivating ? ACTIONS.SERVICE_DEACTIVATE : ACTIONS.SERVICE_UPDATE,
    entityType: "Service",
    entityId: service.id,
    metadata: { fields: Object.keys(payload), deactivating: Boolean(deactivating) },
  });

  res.json({
    success: true,
    message: deactivating ? "Service deactivated successfully" : "Service updated successfully",
    service,
  });
};

// ==========================================
// OWNER: soft-delete (deactivate) a service
// DELETE /api/services/:id
// ==========================================
exports.deactivateService = async (req, res) => {
  const serviceId = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(serviceId)) throw new ApiError(400, "Invalid service id");

  const store = await findOwnerStore(req.user.id);
  if (!store) throw new ApiError(404, "No store is assigned to your owner account");

  const service = await Service.findOne({ where: { id: serviceId, storeId: store.id } });
  if (!service) throw new ApiError(404, "Service not found");
  if (!service.active) throw new ApiError(400, "Service is already deactivated");

  await service.update({ active: false });

  await audit(req, {
    action: ACTIONS.SERVICE_DEACTIVATE,
    entityType: "Service",
    entityId: service.id,
    metadata: { name: service.name },
  });

  // Bookings after this moment are blocked by `active = false`, but users who
  // already have active bookings at this service should know it was disabled.
  const affectedBookings = await Booking.findAll({
    where: { serviceId: service.id, status: { [Op.in]: ["PENDING", "CONFIRMED"] } },
    attributes: ["userId"],
    raw: true,
  });
  const userIds = [...new Set(affectedBookings.map((b) => b.userId))];
  for (const userId of userIds) {
    await notify(
      userId,
      TYPES.SERVICE_DEACTIVATED,
      "Service deactivated",
      `"${service.name}" is no longer available at ${store.name}.`,
      { serviceId: service.id, storeId: store.id }
    ).catch(() => {});
  }

  res.json({
    success: true,
    message: "Service deactivated successfully",
  });
};
