import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import ProtectedRoute from "./components/ProtectedRoute";
import AppLayout from "./components/AppLayout";

import Login from "./pages/Login";
import Register from "./pages/Register";
import RootRedirect from "./pages/RootRedirect";
import ChangePassword from "./pages/ChangePassword";

// Customer
import StoreList from "./pages/StoreList";
import StoreDetail from "./pages/StoreDetail";
import ServiceDetail from "./pages/ServiceDetail";
import CustomerBookings from "./pages/CustomerBookings";
import BookingDetails from "./pages/BookingDetails";
import CustomerDashboard from "./pages/CustomerDashboard";
import FavoritesPage from "./pages/FavoritesPage";
import NotificationsPage from "./pages/NotificationsPage";
import Profile from "./pages/Profile";

// Owner
import OwnerDashboard from "./pages/OwnerDashboard";
import OwnerAnalytics from "./pages/OwnerAnalytics";
import ManageServices from "./pages/ManageServices";
import OwnerBookings from "./pages/OwnerBookings";
import OwnerCustomers from "./pages/OwnerCustomers";
import StoreSettings from "./pages/StoreSettings";

// Admin
import AdminDashboard from "./pages/AdminDashboard";
import AdminAnalytics from "./pages/AdminAnalytics";
import UsersList from "./pages/UsersList";
import UserDetails from "./pages/UserDetails";
import CreateUser from "./pages/CreateUser";
import StoresList from "./pages/StoresList";
import CreateStore from "./pages/CreateStore";
import AdminBookings from "./pages/AdminBookings";
import AdminReviews from "./pages/AdminReviews";
import AdminAuditLogs from "./pages/AdminAuditLogs";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public */}
        <Route path="/" element={<RootRedirect />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        {/* Any authenticated role: account actions */}
        <Route element={<ProtectedRoute roles={["ADMIN", "OWNER", "USER"]} />}>
          <Route element={<AppLayout />}>
            <Route path="/change-password" element={<ChangePassword />} />
            <Route path="/notifications" element={<NotificationsPage />} />
          </Route>
        </Route>

        {/* Customer */}
        <Route element={<ProtectedRoute roles={["USER"]} />}>
          <Route element={<AppLayout />}>
            <Route path="/customer" element={<CustomerDashboard />} />
            <Route path="/stores" element={<StoreList />} />
            <Route path="/stores/:id" element={<StoreDetail />} />
            <Route path="/services/:id" element={<ServiceDetail />} />
            <Route path="/my-bookings" element={<CustomerBookings />} />
            <Route path="/bookings/:id" element={<BookingDetails />} />
            <Route path="/favorites" element={<FavoritesPage />} />
            <Route path="/profile" element={<Profile />} />
          </Route>
        </Route>

        {/* Owner */}
        <Route element={<ProtectedRoute roles={["OWNER"]} />}>
          <Route element={<AppLayout />}>
            <Route path="/owner" element={<OwnerDashboard />} />
            <Route path="/owner/analytics" element={<OwnerAnalytics />} />
            <Route path="/owner/services" element={<ManageServices />} />
            <Route path="/owner/bookings" element={<OwnerBookings />} />
            <Route path="/owner/customers" element={<OwnerCustomers />} />
            <Route path="/owner/settings" element={<StoreSettings />} />
          </Route>
        </Route>

        {/* Admin */}
        <Route element={<ProtectedRoute roles={["ADMIN"]} />}>
          <Route element={<AppLayout />}>
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/admin/analytics" element={<AdminAnalytics />} />
            <Route path="/admin/users" element={<UsersList />} />
            <Route path="/admin/users/new" element={<CreateUser />} />
            <Route path="/admin/users/:id" element={<UserDetails />} />
            <Route path="/admin/stores" element={<StoresList />} />
            <Route path="/admin/stores/new" element={<CreateStore />} />
            <Route path="/admin/bookings" element={<AdminBookings />} />
            <Route path="/admin/reviews" element={<AdminReviews />} />
            <Route path="/admin/audit-logs" element={<AdminAuditLogs />} />
          </Route>
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
