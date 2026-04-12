import { Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.js';
import HomePage from './pages/HomePage.js';
import JobPage from './pages/JobPage.js';
import DashboardPage from './pages/DashboardPage.js';
import LoginPage from './pages/LoginPage.js';

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/jobs/:id" element={<JobPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/login" element={<LoginPage />} />
      </Routes>
    </AuthProvider>
  );
}
