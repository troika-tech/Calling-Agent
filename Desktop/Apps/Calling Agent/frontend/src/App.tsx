import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';

// Auth
import Login from './components/auth/Login';
import Register from './components/auth/Register';
import AdminRoute from './components/auth/AdminRoute';

// Pages
import Dashboard from './components/dashboard/Dashboard';
import AgentList from './components/agents/AgentList';
import AgentForm from './components/agents/AgentForm';
import CallList from './components/calls/CallList';
import CallDetail from './components/calls/CallDetail';
import PhoneList from './components/phones/PhoneList';
import CampaignDashboard from './components/campaigns/CampaignDashboard';
import CampaignForm from './components/campaigns/CampaignForm';
import CampaignDetail from './components/campaigns/CampaignDetail';

function App() {
  const { loadUser, isAuthenticated } = useAuthStore();

  useEffect(() => {
    loadUser();
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        {/* Public Routes */}
        <Route
          path="/login"
          element={isAuthenticated ? <Navigate to="/dashboard" /> : <Login />}
        />
        <Route
          path="/register"
          element={isAuthenticated ? <Navigate to="/dashboard" /> : <Register />}
        />

        {/* Admin Only Routes */}
        <Route element={<AdminRoute />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/agents" element={<AgentList />} />
          <Route path="/agents/new" element={<AgentForm />} />
          <Route path="/agents/:id/edit" element={<AgentForm />} />
          <Route path="/phones" element={<PhoneList />} />
          <Route path="/calls" element={<CallList />} />
          <Route path="/calls/:id" element={<CallDetail />} />
          <Route path="/campaigns" element={<CampaignDashboard />} />
          <Route path="/campaigns/new" element={<CampaignForm />} />
          <Route path="/campaigns/:id" element={<CampaignDetail />} />
        </Route>

        {/* Default redirect */}
        <Route path="/" element={<Navigate to="/dashboard" />} />
        <Route path="*" element={<Navigate to="/dashboard" />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
