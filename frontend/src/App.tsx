import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { useAuthStore } from './store/authStore';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Vehicles from './pages/Vehicles';
import Maintenance from './pages/Maintenance';
import ServiceRequests from './pages/ServiceRequests';
import Insurance from './pages/Insurance';
import Inspections from './pages/Inspections';
import Admin from './pages/Admin';
import Fuel from './pages/Fuel';
import BulkOperations from './pages/BulkOperations';
import Reports from './pages/Reports';
import MonthlyKmEntry from './pages/MonthlyKmEntry';
import Accidents from './pages/Accidents';
import VehicleOverview from './pages/VehicleOverview';
import ProtectedRoute from './utils/ProtectedRoute';
 

function App() {
  const { fetchProfile, isAuthenticated } = useAuthStore();

  useEffect(() => {
    if (isAuthenticated) {
      fetchProfile();
    }
  }, [isAuthenticated, fetchProfile]);

  return (
    <>
      <Toaster position="top-right" />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        } />
        <Route path="/vehicles" element={
          <ProtectedRoute>
            <Vehicles />
          </ProtectedRoute>
        } />
        <Route path="/vehicle-overview" element={
          <ProtectedRoute>
            <VehicleOverview />
          </ProtectedRoute>
        } />
        <Route path="/maintenance" element={
          <ProtectedRoute>
            <Maintenance />
          </ProtectedRoute>
        } />
        <Route path="/service-requests" element={
          <ProtectedRoute>
            <ServiceRequests />
          </ProtectedRoute>
        } />
        <Route path="/insurance" element={
          <ProtectedRoute>
            <Insurance />
          </ProtectedRoute>
        } />
        <Route path="/inspections" element={
          <ProtectedRoute>
            <Inspections />
          </ProtectedRoute>
        } />
        <Route path="/accidents" element={
          <ProtectedRoute>
            <Accidents />
          </ProtectedRoute>
        } />
        <Route path="/admin" element={
          <ProtectedRoute>
            <Admin />
          </ProtectedRoute>
        } />
        <Route path="/fuel" element={
          <ProtectedRoute>
            <Fuel />
          </ProtectedRoute>
        } />
        <Route path="/bulk-operations" element={
          <ProtectedRoute>
            <BulkOperations />
          </ProtectedRoute>
        } />
        <Route path="/reports" element={
          <ProtectedRoute>
            <Reports />
          </ProtectedRoute>
        } />
        <Route path="/monthly-km" element={
          <ProtectedRoute>
            <MonthlyKmEntry />
          </ProtectedRoute>
        } />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </>
  );
}

export default App;
