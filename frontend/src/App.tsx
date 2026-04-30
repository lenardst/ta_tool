import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ClassProvider } from './context/ClassContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Admin from './pages/Admin';
import Dashboard from './pages/Dashboard';
import SessionsSetup from './pages/SessionsSetup';
import SessionView from './pages/SessionView';
import GradesView from './pages/GradesView';
import Settings from './pages/Settings';
import Participants from './pages/Participants';
import Groups from './pages/Groups';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 10_000, retry: 1 } },
});

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  return token ? <>{children}</> : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClient}>
        <ClassProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route
                element={
                  <PrivateRoute>
                    <Layout />
                  </PrivateRoute>
                }
              >
                <Route index element={<Dashboard />} />
                <Route path="sessions" element={<SessionsSetup />} />
                <Route path="session" element={<SessionView />} />
                <Route path="grades" element={<GradesView />} />
                <Route path="participants" element={<Participants />} />
                <Route path="groups" element={<Groups />} />
                <Route path="settings" element={<Settings />} />
                <Route path="admin" element={<Admin />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </ClassProvider>
      </QueryClientProvider>
    </AuthProvider>
  );
}
