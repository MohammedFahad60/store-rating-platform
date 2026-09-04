function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    address: user.address,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt,
  };
}

function publicStore(store) {
  if (!store) return null;
  return {
    id: store.id,
    name: store.name,
    email: store.email,
    phone: store.phone,
    description: store.description,
    category: store.category,
    address: store.address,
    openingTime: store.openingTime,
    closingTime: store.closingTime,
    status: store.status,
    createdAt: store.createdAt,
  };
}

module.exports = { publicUser, publicStore };
