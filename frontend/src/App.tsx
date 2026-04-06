import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ClassProvider } from './context/ClassContext';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import SessionsSetup from './pages/SessionsSetup';
import SessionView from './pages/SessionView';
import GradesView from './pages/GradesView';
import Settings from './pages/Settings';
import Participants from './pages/Participants';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 10_000, retry: 1 } },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ClassProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<Dashboard />} />
              <Route path="sessions" element={<SessionsSetup />} />
              <Route path="session" element={<SessionView />} />
              <Route path="grades" element={<GradesView />} />
              <Route path="participants" element={<Participants />} />
              <Route path="settings" element={<Settings />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </ClassProvider>
    </QueryClientProvider>
  );
}
