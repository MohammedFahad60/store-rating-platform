require("dotenv").config({ quiet: true });

const bcrypt = require("bcryptjs");
const { sequelize, User, Store, Service, Booking, Rating, Favorite, Notification, StoreHour, AuditLog } = require("./models");
const { runMigrations } = require("./utils/migrate");

// Default weekly operating hours used by every seeded store
// (dayOfWeek: 1 = Monday ... 7 = Sunday). Stores open 09:00-20:00,
// closed on Sundays.
const DEFAULT_HOURS = [
  { dayOfWeek: 1, openTime: "09:00", closeTime: "20:00", closed: false },
  { dayOfWeek: 2, openTime: "09:00", closeTime: "20:00", closed: false },
  { dayOfWeek: 3, openTime: "09:00", closeTime: "20:00", closed: false },
  { dayOfWeek: 4, openTime: "09:00", closeTime: "20:00", closed: false },
  { dayOfWeek: 5, openTime: "09:00", closeTime: "20:00", closed: false },
  { dayOfWeek: 6, openTime: "10:00", closeTime: "18:00", closed: false },
  { dayOfWeek: 7, openTime: null, closeTime: null, closed: true },
];

// Deterministic 30-minute appointment times (HH:MM, within store hours).
const SLOT_TIMES = ["09:30", "10:00", "11:30", "14:00", "16:30", "18:00"];

// ---------------------------------------------------------------
// Demo data (deterministic - no randomness, safe to re-run)
// ---------------------------------------------------------------

const STORE_CATEGORIES = ["SALON", "REPAIR", "FITNESS", "PHOTOGRAPHY", "CLEANING", "AUTO CARE"];

const STORES = [
  {
    owner: { name: "Rahul Sharma", email: "owner1@storerating.com" },
    store: {
      name: "Glow & Groom Salon",
      email: "glowgroom@store.com",
      phone: "9886012345",
      address: "12th Main Road, Koramangala, Bengaluru",
      category: "SALON",
      description: "Premium unisex salon offering haircuts, styling, facials and grooming.",
      openingTime: "09:00:00",
      closingTime: "21:00:00",
    },
    services: [
      { name: "Haircut & Styling", description: "Wash, cut and styling by senior stylist", price: 300, estimatedMinutes: 45 },
      { name: "Hair Colouring", description: "Full head colour with premium ammonia-free dye", price: 1500, estimatedMinutes: 120 },
      { name: "Signature Facial", description: "Deep cleansing facial with vitamin C pack", price: 800, estimatedMinutes: 60 },
      { name: "Manicure & Pedicure", description: "Complete nail care and spa treatment", price: 500, estimatedMinutes: 40 },
    ],
  },
  {
    owner: { name: "Priya Nair", email: "owner2@storerating.com" },
    store: {
      name: "TechFix Mobile Repairs",
      email: "techfix@store.com",
      phone: "9845098765",
      address: "100 Feet Road, Indiranagar, Bengaluru",
      category: "REPAIR",
      description: "Fast and reliable smartphone repair with genuine parts and warranty.",
      openingTime: "10:00:00",
      closingTime: "20:00:00",
    },
    services: [
      { name: "Screen Replacement", description: "Original display replacement with 90 day warranty", price: 1200, estimatedMinutes: 90 },
      { name: "Battery Replacement", description: "High-capacity battery replacement for all brands", price: 800, estimatedMinutes: 60 },
      { name: "Software Tune-up", description: "OS optimisation, virus removal and speed boost", price: 400, estimatedMinutes: 30 },
      { name: "Water Damage Recovery", description: "Ultrasonic cleaning and board-level repair", price: 2000, estimatedMinutes: 180 },
    ],
  },
  {
    owner: { name: "Arjun Patel", email: "owner3@storerating.com" },
    store: {
      name: "FitZone Personal Training",
      email: "fitzone@store.com",
      phone: "9740091122",
      address: "27th Main, HSR Layout, Bengaluru",
      category: "FITNESS",
      description: "Certified personal trainers and small group fitness coaching.",
      openingTime: "06:00:00",
      closingTime: "22:00:00",
    },
    services: [
      { name: "Personal Training Session", description: "1-on-1 coaching with custom workout plan", price: 900, estimatedMinutes: 60 },
      { name: "Nutrition Consultation", description: "Personalised diet plan with monthly review", price: 1500, estimatedMinutes: 45 },
      { name: "Group HIIT Class", description: "High intensity interval training for small groups", price: 350, estimatedMinutes: 60 },
      { name: "Body Composition Analysis", description: "Detailed body fat and muscle analysis report", price: 500, estimatedMinutes: 30 },
    ],
  },
  {
    owner: { name: "Sneha Iyer", email: "owner4@storerating.com" },
    store: {
      name: "LensPro Studio",
      email: "lenspro@store.com",
      phone: "9900112233",
      address: "ITPL Main Road, Whitefield, Bengaluru",
      category: "PHOTOGRAPHY",
      description: "Professional photography studio for portraits, products and events.",
      openingTime: "10:00:00",
      closingTime: "19:00:00",
    },
    services: [
      { name: "Studio Portrait Session", description: "Professional headshot with 10 edited photos", price: 2000, estimatedMinutes: 90 },
      { name: "Wedding Coverage", description: "Full day photography with 500+ edited photos", price: 25000, estimatedMinutes: 480 },
      { name: "Product Photoshoot", description: "E-commerce product photography on white background", price: 1500, estimatedMinutes: 60 },
      { name: "Event Photography", description: "Corporate and private event coverage (3 hours)", price: 8000, estimatedMinutes: 240 },
    ],
  },
  {
    owner: { name: "Vikram Reddy", email: "owner5@storerating.com" },
    store: {
      name: "Sparkle & Shine Laundry",
      email: "sparkle@store.com",
      phone: "9632123456",
      address: "9th Block, Jayanagar, Bengaluru",
      category: "CLEANING",
      description: "Eco-friendly laundry, dry cleaning and doorstep pickup service.",
      openingTime: "08:00:00",
      closingTime: "20:00:00",
    },
    services: [
      { name: "Wash & Fold (per kg)", description: "Machine wash, dry and fold for everyday clothes", price: 250, estimatedMinutes: 300 },
      { name: "Dry Cleaning (per item)", description: "Premium dry cleaning for suits and formals", price: 150, estimatedMinutes: 1440 },
      { name: "Ironing (per kg)", description: "Steam ironing with anti-crease finish", price: 100, estimatedMinutes: 120 },
      { name: "Deep Cleaning (per kg)", description: "Stain removal and sanitised deep wash", price: 400, estimatedMinutes: 1440 },
    ],
  },
  {
    owner: { name: "Neha Joshi", email: "owner6@storerating.com" },
    store: {
      name: "AutoCare Service Center",
      email: "autocare@store.com",
      phone: "9100099887",
      address: "Outer Ring Road, Marathahalli, Bengaluru",
      category: "AUTO CARE",
      description: "Complete car care: scheduled service, repair and detailing by certified mechanics.",
      openingTime: "09:00:00",
      closingTime: "19:00:00",
    },
    services: [
      { name: "Basic Service (BS1)", description: "Oil change, filters, inspection and top-up", price: 2500, estimatedMinutes: 240 },
      { name: "Engine Oil Change", description: "Synthetic engine oil replacement", price: 900, estimatedMinutes: 60 },
      { name: "AC Service & Gas Refill", description: "AC cleaning, leak check and gas refill", price: 1500, estimatedMinutes: 120 },
      { name: "Brake Pad Replacement", description: "Front brake pads with inspection", price: 1800, estimatedMinutes: 150 },
    ],
  },
];

const CUSTOMERS = [
  { name: "Aisha Khan", email: "aisha@gmail.com" },
  { name: "Rohan Verma", email: "rohan@gmail.com" },
  { name: "Karan Mehta", email: "karan@gmail.com" },
  { name: "Pooja Singh", email: "pooja@gmail.com" },
  { name: "Ananya Rao", email: "ananya@gmail.com" },
  { name: "Rakesh Kumar", email: "rakesh@gmail.com" },
  { name: "Divya Patel", email: "divya@gmail.com" },
  { name: "Imran Sheikh", email: "imran@gmail.com" },
  // Disabled demo account (admin can reactivate): must never be able to log in.
  { name: "Disabled User", email: "disabled@storerating.com", status: "DISABLED" },
];

const CUSTOMER_COMMENTS = [
  "Very professional service, highly recommended!",
  "Great experience, will visit again.",
  "Friendly staff and quality work.",
];

function dateOffset(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function seed() {
  try {
    await sequelize.authenticate();
    console.log("[Seed] Connected to database");

    // Schema is created by TRACKED MIGRATIONS - never sync({ alter: true }).
    // Safe to run in development and against an existing production database
    // (idempotent: pending migrations only).
    const result = await runMigrations({ log: (line) => console.log(line) });
    console.log(`[Seed] Schema ready (${result.applied.length} migration(s) applied)`);

    await sequelize.transaction(async (transaction) => {
      // ---- Wipe existing data in FK-safe order (inside one transaction) ----
      await Notification.destroy({ where: {}, force: true, transaction });
      await Favorite.destroy({ where: {}, force: true, transaction });
      await StoreHour.destroy({ where: {}, force: true, transaction });
      await Booking.destroy({ where: {}, force: true, transaction });
      await Rating.destroy({ where: {}, force: true, transaction });
      await AuditLog.destroy({ where: {}, force: true, transaction });
      await Service.destroy({ where: {}, force: true, transaction });
      await Store.destroy({ where: {}, force: true, transaction });
      await User.destroy({ where: {}, force: true, transaction });
      console.log("[Seed] Existing data cleared");

      const adminPassword = await bcrypt.hash("Admin@123", 10);
      const ownerPassword = await bcrypt.hash("Owner@123", 10);
      const userPassword = await bcrypt.hash("User@123", 10);
      const now = new Date();

      // ---- Admin ----
      await User.create(
        {
          name: "Platform Administrator",
          email: "admin@storerating.com",
          password: adminPassword,
          address: "Electronic City, Bengaluru",
          role: "ADMIN",
          passwordChangedAt: now,
        },
        { transaction }
      );

      // ---- Owners ----
      const owners = [];
      for (const item of STORES) {
        const owner = await User.create(
          {
            name: item.owner.name,
            email: item.owner.email,
            password: ownerPassword,
            address: "Bengaluru",
            role: "OWNER",
            passwordChangedAt: now,
          },
          { transaction }
        );
        owners.push(owner);
      }

      // ---- Customers ----
      const customers = [];
      for (const customer of CUSTOMERS) {
        const user = await User.create(
          {
            name: customer.name,
            email: customer.email,
            password: userPassword,
            address: "Bengaluru",
            role: "USER",
            status: customer.status || "ACTIVE",
            passwordChangedAt: now,
          },
          { transaction }
        );
        customers.push(user);
      }

      // ---- Stores + services ----
      const createdStores = [];
      const createdServices = [];

      for (let si = 0; si < STORES.length; si++) {
        const item = STORES[si];
        const store = await Store.create(
          {
            name: item.store.name,
            email: item.store.email,
            phone: item.store.phone,
            description: item.store.description,
            category: item.store.category,
            address: item.store.address,
            openingTime: item.store.openingTime,
            closingTime: item.store.closingTime,
            ownerId: owners[si].id,
            status: "ACTIVE",
          },
          { transaction }
        );
        createdStores.push(store);

        // Deterministic weekly operating hours (Sunday closed).
        for (const hour of DEFAULT_HOURS) {
          await StoreHour.create({ storeId: store.id, ...hour }, { transaction });
        }

        const serviceRows = [];
        for (const svc of item.services) {
          const service = await Service.create(
            {
              storeId: store.id,
              name: svc.name,
              description: svc.description,
              price: svc.price,
              estimatedMinutes: svc.estimatedMinutes,
              active: true,
            },
            { transaction }
          );
          serviceRows.push(service);
        }
        createdServices.push(serviceRows);
      }

      // ---- Customer favorites (deterministic) ----
      await Favorite.create(
        { userId: customers[0].id, storeId: createdStores[0].id },
        { transaction }
      );
      await Favorite.create(
        { userId: customers[0].id, storeId: createdStores[1].id },
        { transaction }
      );
      await Favorite.create(
        { userId: customers[3].id, storeId: createdStores[0].id },
        { transaction }
      );

      // ---- Bookings + ratings/reviews ----
      for (let si = 0; si < createdStores.length; si++) {
        const store = createdStores[si];
        const services = createdServices[si];

        // 3 completed bookings (one per reviewer) that are then rated
        for (let j = 0; j < 3; j++) {
          const customer = customers[(si + j) % customers.length];
          const service = services[j % services.length];

        const booking = await Booking.create(
          {
            userId: customer.id,
            storeId: store.id,
            serviceId: service.id,
            bookingDate: dateOffset(-(j + 3) * 2),
            startTime: SLOT_TIMES[(si + j) % SLOT_TIMES.length],
            status: "COMPLETED",
            price: service.price,
            notes: null,
          },
          { transaction }
        );

          await Rating.create(
            {
              userId: customer.id,
              storeId: store.id,
              bookingId: booking.id,
              rating: [5, 4, 5][j],
              comment: CUSTOMER_COMMENTS[j],
            },
            { transaction }
          );
        }

        // One completed-but-unrated booking on the first two stores
        // (lets a demo customer leave a fresh rating/review).
        if (si < 2) {
          const customer = customers[0];
          const service = services[(si + 2) % services.length];
          await Booking.create(
            {
              userId: customer.id,
              storeId: store.id,
              serviceId: service.id,
              bookingDate: dateOffset(-2),
              startTime: SLOT_TIMES[(si + 1) % SLOT_TIMES.length],
              status: "COMPLETED",
              price: service.price,
              notes: "Please call before arriving",
            },
            { transaction }
          );
        }

        // Status variety for the owner workflow demo
        const statusDemo = [
          { status: "PENDING", customerOffset: 3, dayOffset: 1 },
          { status: "CONFIRMED", customerOffset: 4, dayOffset: 2 },
          { status: "IN_PROGRESS", customerOffset: 5, dayOffset: 0 },
          { status: "REJECTED", customerOffset: 6, dayOffset: -4 },
          { status: "CANCELLED", customerOffset: 7, dayOffset: -6 },
        ];

        for (const demo of statusDemo) {
          const customer = customers[demo.customerOffset % customers.length];
          const service = services[(si + demo.customerOffset) % services.length];

          await Booking.create(
            {
              userId: customer.id,
              storeId: store.id,
              serviceId: service.id,
              bookingDate: dateOffset(demo.dayOffset),
              startTime: SLOT_TIMES[(si + demo.customerOffset) % SLOT_TIMES.length],
              status: demo.status,
              price: service.price,
              notes: demo.status === "PENDING" ? "Prefer morning slot" : null,
            },
            { transaction }
          );
        }

        // ---- A future CONFIRMED booking for demo dashboards ----
        if (si < 3) {
          const customer = customers[(si + 1) % customers.length];
          const service = services[(si + 3) % services.length];
          await Booking.create(
            {
              userId: customer.id,
              storeId: store.id,
              serviceId: service.id,
              bookingDate: dateOffset(2),
              startTime: SLOT_TIMES[(si + 2) % SLOT_TIMES.length],
              status: "CONFIRMED",
              price: service.price,
              notes: null,
            },
            { transaction }
          );
        }
      }

      // ---- Seed a few in-app notifications (deterministic) ----
      const adminUser = await User.findOne({ where: { email: "admin@storerating.com" }, transaction });
      const aishaUser = await User.findOne({ where: { email: "aisha@gmail.com" }, transaction });
      const owner1User = await User.findOne({ where: { email: "owner1@storerating.com" }, transaction });
      if (adminUser) {
        await Notification.create(
          {
            userId: adminUser.id,
            type: "SYSTEM",
            title: "Welcome to STORE",
            message: "Platform seeded with demo data. You can manage users, stores and reviews.",
            read: false,
            metadata: {},
          },
          { transaction }
        );
      }
      if (aishaUser && createdStores[0]) {
        await Notification.create(
          {
            userId: aishaUser.id,
            type: "BOOKING_STATUS",
            title: "Booking confirmed",
            message: "Your booking at Glow & Groom Salon is confirmed.",
            read: false,
            metadata: { storeId: createdStores[0].id },
          },
          { transaction }
        );
      }
      if (owner1User && createdStores[0]) {
        await Notification.create(
          {
            userId: owner1User.id,
            type: "BOOKING_CREATED",
            title: "New booking request",
            message: "A customer requested a service at your store.",
            read: false,
            metadata: { storeId: createdStores[0].id },
          },
          { transaction }
        );
      }
    });

    console.log("==========================================");
    console.log("  Database Seeded Successfully");
    console.log("==========================================");
    console.log("");
    console.log("ADMIN");
    console.log("  admin@storerating.com  /  Admin@123");
    console.log("");
    console.log("OWNERS (one store each)");
    STORES.forEach((item, i) => {
      console.log(`  ${item.owner.email}  /  Owner@123   ->  ${item.store.name}`);
    });
    console.log("");
    console.log("CUSTOMERS");
    CUSTOMERS.forEach((c) => {
      console.log(`  ${c.email}  /  User@123`);
    });
    console.log("");
    console.log(`Stores: ${STORES.length}`);
    console.log(`Services: ${STORES.reduce((sum, item) => sum + item.services.length, 0)}`);
    console.log(`Customers: ${CUSTOMERS.length}`);
    console.log(`Owners: ${STORES.length}`);
    console.log("==========================================");

    await sequelize.close();
    process.exit(0);
  } catch (error) {
    console.error("[Seed] Failed:", error.message);
    try {
      await sequelize.close();
    } catch {
      // ignore
    }
    process.exit(1);
  }
}

seed();
