# API Contract

Base path: `/api`. All responses are JSON. Protected endpoints require
`Authorization: Bearer <JWT>`. Error responses always match:

```json
{ "success": false, "message": "...", "errors": ["..."] }
```

Status codes: `400` validation · `401` missing/invalid/expired JWT or
disabled account · `403` role/authorization · `404` not found ·
`409` conflict · `500` internal (generic, no internals).

**Security rules (enforced server-side, never trusted from the client):**
`userId`, `ownerId`, `storeId`, `role` and booking `price` are derived from
the authenticated JWT / database. Administrative users never receive
password hashes; audit/notification metadata never contains passwords or
JWTs. Every new Phase 3 endpoint follows this contract.

## Auth

| Method | URL | Auth | Request body | Success response | Errors |
|---|---|---|---|---|---|
| POST | `/auth/register` | public | `{name, email, phone?, password, address?}` | `201 {success, message, user}` (`user` = safe fields, `role` forced `USER`, never `ADMIN`/`OWNER`) | 400, 409 |
| POST | `/auth/login` | public | `{email, password}` | `200 {success, message, token, id, name, email, role}` (failed + disabled attempts audited) | 400, 401, 403 |
| PUT | `/auth/change-password` | any role | `{oldPassword, newPassword}` | `200 {success, message}` (all previous JWTs invalidated via tokenVersion; audited) | 400, 401 |

## Users / Customer profile

| Method | URL | Auth | Request body | Success response | Errors |
|---|---|---|---|---|---|
| GET | `/users/profile` | any role | — | `200 {success, user{id,name,email,phone,address,role,status,createdAt}}` (no `password`/`tokenVersion`) | 401, 404 |
| PUT | `/users/profile` | any role | `{name?, email?, phone?, address?}` — `id`/`role`/`tokenVersion` are ignored by the server | `200 {success, message, user}` | 400, 401 |
| GET | `/customer/dashboard` | USER | — | `200 {success, stats{upcomingBookings,pendingBookings,completedBookings,cancelledBookings,favorites,averageRatingGiven,totalReviews}, upcoming[], favoriteStores[], recommendedStores[], recentReviews[]}` | 401, 403 |

## Stores (customer discovery + detail)

| Method | URL | Auth | Query | Success response | Errors |
|---|---|---|---|---|---|
| GET | `/stores` | any role | `search, category, service, minRating(1-5), maxPrice(≥0), openNow(true), lat, lng, sort(highest_rated\|most_reviewed\|nearest\|price\|newest\|name), order(asc\|desc), page, limit(≤50)` | `200 {success, data[{id,name,category,address,phone,description,openingTime,closingTime,latitude,longitude,averageRating,ratingCount,serviceCount,minPrice,distance?}], pagination{page,limit,total,totalPages}, filters{openNow,sort,hasCoords}}` | 401 |
| GET | `/stores/:id` | any role | — | `200 {success, store{id,name,email,phone,description,category,address,latitude,longitude,openingTime,closingTime,status,ownerName,averageRating,totalServices,activeServiceCount,isFavorite,hasCustomHours,operatingHours[{dayOfWeek,openTime,closeTime,closed}]}}` | 400, 401, 403, 404 |
| GET | `/stores/:id/availability?date=YYYY-MM-DD` | any role | `date` required | `200 {success, date, hours{open,close,closed}, slots[{time"HH:MM", available}]}` (30-min slots, bookable times only) | 400, 401, 403, 404 |

## Services

| Method | URL | Auth | Request body | Success response | Errors |
|---|---|---|---|---|---|
| GET | `/services/store/:storeId` | any role | — | `200 {success, services[]}` (customers see `active` only) | 400, 401, 403, 404 |
| GET | `/services/:id` | any role | — | `200 {success, service{id,storeId,name,description,price,estimatedMinutes,active,store{id,name,category,address,phone,status,description}}}` (inactive store/service requires OWNER) | 400, 401, 403, 404 |
| GET | `/services/my-store` | OWNER | — | `200 {success, store{id,name,category,address,email,status}, services[]}` | 401, 403, 404 |
| GET | `/owner/services` | OWNER | `search, active(true\|false), sort(created\|name\|price\|duration), order, page, limit(≤50)` | `200 {success, services[{id,storeId,name,description,price,estimatedMinutes,active,bookingCount,createdAt,updatedAt}], stats{total,activeCount,inactiveCount}, pagination}` | 401, 403, 404 |
| POST | `/services` | OWNER | `{name, description?, price, estimatedMinutes}` (storeId from JWT, never body) | `201 {success, message, service}` | 400, 401, 403, 404 |
| PUT | `/services/:id` | OWNER | any of `{name?, description?, price?, estimatedMinutes?, active?}` | `200 {success, message, service}` | 400, 401, 403, 404 |
| DELETE | `/services/:id` | OWNER | — | `200 {success, message}` (soft deactivate, audited, affected customers notified) | 400, 401, 403, 404 |

## Bookings

| Method | URL | Auth | Request body | Success response | Errors |
|---|---|---|---|---|---|
| POST | `/bookings` | USER | `{serviceId, bookingDate "YYYY-MM-DD" (not past), startTime "HH:MM" (inside operating hours, no collision), notes? ≤1000}` — price snapshotted from DB, never from body | `201 {success, message, booking}` | 400, 401, 403, 404, 409 |
| GET | `/bookings/my` | USER | `status?, search?, from?, to?, page, limit(≤50)` | `200 {success, bookings[{id,storeId,serviceId,storeName,storeAddress,storeCategory,serviceName,estimatedMinutes,bookingDate,startTime,status,price,notes,createdAt,updatedAt}], pagination}` | 400, 401, 403 |
| GET | `/bookings/:id` | USER (owner) or OWNER (of store) | — | `200 {success, booking{...,store{id,name,address},service{id,name},customer{name,email},rating?}}` | 400, 401, 403, 404 |
| PUT | `/bookings/:id/cancel` | USER | — | `200 {success, message, booking}` (own, PENDING only) | 400, 401, 403, 404 |
| GET | `/bookings/store` | OWNER | `status?, search?, from?, to?, sort(date\|created\|customer\|status), order, page, limit(≤50)` | `200 {success, bookings[{id,customerName,customerEmail,serviceName,estimatedMinutes,bookingDate,startTime,status,price,notes,createdAt}], pagination}` | 400, 401, 403, 404 |
| PUT | `/bookings/:id/status` | OWNER | `{status}` (strict: PENDING→CONFIRMED/REJECTED, CONFIRMED→IN_PROGRESS/CANCELLED, IN_PROGRESS→COMPLETED/CANCELLED) — invalid transitions rejected, customer notified | `200 {success, message, booking}` | 400, 401, 403, 404 |

## Ratings & reviews

| Method | URL | Auth | Request body | Success response | Errors |
|---|---|---|---|---|---|
| GET | `/ratings/store/:storeId` | any role | — | `200 {success, averageRating, totalRatings, distribution{1..5}, ratings[{id,rating,comment,ownerReply,userName,createdAt}]}` (customers see `VISIBLE` only; OWNER sees hidden) | 400, 401, 403, 404 |
| GET | `/ratings/my` | USER | — | `200 {success, ratings[{id,storeId,rating,comment,ownerReply,status,createdAt,store?}]}` | 401, 403 |
| POST | `/ratings` | USER | `{storeId, rating 1-5, comment? ≤1000}` (requires a completed booking; one per user+store, DB-enforced) | `201 {success, message, rating}` | 400, 401, 403, 404, 409 |
| PUT | `/ratings/:id` | USER | any of `{rating?, comment?}` (own rating only) | `200 {success, message, rating}` | 400, 401, 403, 404 |
| PUT | `/ratings/:id/reply` | OWNER | `{reply ≤2000}` (own store review only; notifies customer) | `200 {success, message, rating}` | 400, 401, 403, 404 |

## Favorites

| Method | URL | Auth | Request body | Success response | Errors |
|---|---|---|---|---|---|
| GET | `/favorites` | USER | `page, limit(≤50)` | `200 {success, favorites[{id,storeId,store{id,name,category,address,averageRating,ratingCount,status}}], pagination}` | 401, 403 |
| GET | `/favorites/:storeId/status` | USER | — | `200 {success, storeId, isFavorite}` | 400, 401, 403 |
| POST | `/favorites` | USER | `{storeId}` | `201 {success, message, favorite}` (200 if already saved; DB unique `(userId,storeId)`) | 400, 401, 403, 404 |
| DELETE | `/favorites/:storeId` | USER | — | `200 {success, message}` (own favorite only) | 400, 401, 403, 404 |

## Notifications

| Method | URL | Auth | Request body | Success response | Errors |
|---|---|---|---|---|---|
| GET | `/notifications` | any role | `unreadOnly(true), page, limit(≤50)` | `200 {success, notifications[{id,type,title,message,read,metadata,createdAt}], unreadCount, pagination}` | 401 |
| GET | `/notifications/unread-count` | any role | — | `200 {success, unreadCount}` | 401 |
| PUT | `/notifications/:id/read` | any role | — | `200 {success, message, unreadCount}` (own notification only) | 400, 401, 404 |
| PUT | `/notifications/read-all` | any role | — | `200 {success, message, unreadCount:0}` | 401 |

## Owner operations

| Method | URL | Auth | Request body | Success response | Errors |
|---|---|---|---|---|---|
| GET | `/owner/dashboard` | OWNER | `range(today\|7\|30\|90)` | `200 {success, range, store{...}, stats{totalServices,activeServices,totalBookings,pendingBookings,confirmedBookings,inProgressBookings,completedBookings,cancelledBookings,rejectedBookings,todayBookings,upcomingBookings,totalCustomers,averageRating,totalRatings,revenue}, recentRatings[], recentBookings[]}` | 401, 403, 404 |
| GET | `/owner/analytics` | OWNER | `range(7\|30\|90)` | `200 {success, range, store{id,name}, metrics{revenue,customers,bookings,bookingsCompleted,bookingsCancelled,activeServices,totalServices,averageRating,totalRatings}, series{bookings[{date,count}], revenue[{date,revenue}]}, bookingStatusDistribution, ratingDistribution, topServices[]}` | 401, 403, 404 |
| GET | `/owner/customers` | OWNER | `search?, page, limit(≤50)` | `200 {success, customers[{id,name,email,phone,bookingCount,completedBookings,lastBooking{at,status},totalSpending,averageRatingGiven}], pagination}` (own store only) | 401, 403, 404 |
| GET | `/owner/customers/:id` | OWNER | — | `200 {success, customer{id,name,email,phone,address,bookingHistory[{id,serviceName,bookingDate,startTime,status,price,createdAt}], reviews[]}}` (404 unless the customer interacted with THIS store) | 400, 401, 403, 404 |
| GET | `/owner/store` | OWNER | — | `200 {success, store{id,name,email,phone,description,category,address,latitude,longitude,openingTime,closingTime,status,createdAt,operatingHours[]\|null}}` (no `ownerId` exposed) | 401, 403, 404 |
| PUT | `/owner/store` | OWNER | any of `{name?, email?, phone?, address?, category?, description?, latitude?, longitude?, openingTime?, closingTime?}` — `id`/`ownerId`/`createdAt`/`status` ignored (admin suspension authoritative) | `200 {success, message, store}` | 400, 401, 403, 404 |
| PUT | `/owner/store/hours` | OWNER | `{hours:[{dayOfWeek 1-7 (Mon-Sun), openTime, closeTime, closed}]}` — exactly 7 entries, close must be after open | `200 {success, message, operatingHours[]}` | 400, 401, 403, 404 |

## Admin platform

| Method | URL | Auth | Request body | Success response | Errors |
|---|---|---|---|---|---|
| GET | `/admin/dashboard` | ADMIN | — | `200 {success, totalUsers,totalOwners,totalCustomers,totalStores,activeStores,suspendedStores,totalServices,totalBookings,pendingBookings,completedBookings,totalRatings,visibleRatings}` | 401, 403 |
| GET | `/admin/analytics` | ADMIN | `range(7\|30\|90)` | `200 {success, range, metrics{totalUsers,totalOwners,totalCustomers,totalStores,activeStores,inactiveStores,totalServices,totalBookings,revenue,averageRating,totalRatings}, series{bookings[],revenue[],users[],stores[]}, bookingStatusDistribution, topStores[]}` | 401, 403 |
| POST | `/admin/users` | ADMIN | `{name, email, password, address?, role(ADMIN\|OWNER\|USER)}` | `201 {success, message, user}` (audited) | 400, 401, 403, 409 |
| GET | `/admin/users` | ADMIN | `search?, role?, sort(created\|name\|role), order, page, limit(≤50)` | `200 {success, users[{id,name,email,phone,address,role,status,createdAt}], pagination}` (no password hash) | 401, 403 |
| GET | `/admin/users/:id` | ADMIN | — | `200 {success, user{...,Stores[]}}` | 400, 401, 403, 404 |
| PUT | `/admin/users/:id/status` | ADMIN | `{status(ACTIVE\|DISABLED)}` | `200 {success, message, user}` (audited; disabled accounts rejected at auth) | 400, 401, 403, 404 |
| POST | `/admin/stores` | ADMIN | `{name, email, address, ownerId, category?, phone?, description?}` | `201 {success, message, store}` (audited) | 400, 401, 403, 404, 409 |
| GET | `/admin/stores` | ADMIN | `search?, category?, status?, sort(created\|name\|status), order, page, limit(≤50)` | `200 {success, stores[{id,name,email,phone,address,category,status,ownerId,ownerName,averageRating,ratingCount,serviceCount,activeServiceCount}], pagination}` | 401, 403 |
| PUT | `/admin/stores/:id/status` | ADMIN | `{status(ACTIVE\|INACTIVE\|SUSPENDED)}` | `200 {success, message, store}` (audited + owner notified; owners cannot override) | 400, 401, 403, 404 |
| GET | `/admin/bookings` | ADMIN | `search?, status?, storeId?, from?, to?, sort(date\|created\|status), order, page, limit(≤50)` | `200 {success, bookings[{id,customerName,customerEmail,storeName,serviceName,bookingDate,startTime,status,price,createdAt,updatedAt}], pagination}` (read-only) | 401, 403 |
| GET | `/admin/reviews` | ADMIN | `search?, status(VISIBLE\|HIDDEN)?, rating(1-5)?, storeId?, page, limit(≤50)` | `200 {success, reviews[{id,userId,storeId,userName,userEmail,storeName,rating,comment,status,ownerReply,createdAt}], pagination}` | 401, 403 |
| PUT | `/admin/reviews/:id/status` | ADMIN | `{status(VISIBLE\|HIDDEN)}` (hide/restore — never hard delete; audited) | `200 {success, message, review{id,status}}` | 400, 401, 403, 404 |
| GET | `/admin/audit-logs` | ADMIN | `actorId?, action?, entityType?, entityId?, from?, to?, page, limit(≤100)` | `200 {success, logs[{id,actorUserId,actorName,actorEmail,action,entityType,entityId,metadata,ipAddress,createdAt}], pagination}` (append-only) | 401, 403 |

## Health

| Method | URL | Auth | Request body | Success response | Errors |
|---|---|---|---|---|---|
| GET | `/health` | public | — | `200 {success, status:"ok", database:"connected", uptime, timestamp}` | `503 {success:false, status:"unavailable", message:"Service is temporarily unavailable"}` |

## Frontend ↔ backend mapping audit

- `Frontend/src/services/api.js` uses the relative `/api` origin (or
  `VITE_API_URL`); the Vite dev server proxies `/api` to the backend.
- Pages used: Login/Register/ChangePassword (auth); StoreList/StoreDetail/
  ServiceDetail/CustomerBookings/BookingDetails/CustomerDashboard/
  FavoritesPage/NotificationsPage/Profile (customer); OwnerDashboard/
  OwnerAnalytics/ManageServices/OwnerBookings/OwnerCustomers/StoreSettings
  (owner); AdminDashboard/AdminAnalytics/UsersList/UserDetails/CreateUser/
  StoresList/CreateStore/AdminBookings/AdminReviews/AdminAuditLogs (admin).
- Response fields consumed by the frontend match the backend responses
  exactly (e.g. `store.averageRating`, `booking.customerName`,
  `metrics.revenue`, `data.pagination`, `slots[].available`).
- No frontend code reads a field the backend does not return, and no backend
  field required by the frontend is missing.
