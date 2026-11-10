import '@fontsource/josefin-sans/400.css';
import '@fontsource/josefin-sans/600.css';
import '@fontsource/josefin-sans/700.css';
import '@fontsource/dm-sans/400.css';
import '@fontsource/dm-sans/500.css';
import '@fontsource/dm-sans/700.css';
import './styles.css';

import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { AppProvider, MenuProvider, useApp } from './app';
import { Loading } from './components/ui';
import { AuthPage } from './pages/Auth';
import { BarPage, DrinkPage, MenuPage } from './pages/Guest';
import { TvPage } from './pages/Tv';
import { AdminLayout, InventoryPage, ShoppingPage } from './pages/admin/Admin';
import { RecipeEditPage, RecipesPage } from './pages/admin/Recipes';
import { SettingsPage } from './pages/admin/Settings';

function WithMenu() {
  return (
    <MenuProvider>
      <Outlet />
    </MenuProvider>
  );
}

function AdminOnly({ children }: { children: ReactNode }) {
  const { user, authReady, config } = useApp();
  if (!authReady) return <Loading />;
  if (!user) return <Navigate to={config.needsSetup ? '/setup' : '/login'} replace />;
  return <AdminLayout>{children}</AdminLayout>;
}

function App() {
  return (
    <Routes>
      <Route element={<WithMenu />}>
        <Route path="/" element={<MenuPage />} />
        <Route path="/drink/:slug" element={<DrinkPage />} />
        <Route path="/tv" element={<TvPage />} />
      </Route>
      <Route path="/bar" element={<BarPage />} />
      <Route path="/login" element={<AuthPage mode="login" />} />
      <Route path="/setup" element={<AuthPage mode="setup" />} />
      <Route path="/admin" element={<Navigate to="/admin/inventory" replace />} />
      <Route path="/admin/inventory" element={<AdminOnly><InventoryPage /></AdminOnly>} />
      <Route path="/admin/recipes" element={<AdminOnly><RecipesPage /></AdminOnly>} />
      <Route path="/admin/recipes/new" element={<AdminOnly><RecipeEditPage key="new" /></AdminOnly>} />
      <Route path="/admin/recipes/:id" element={<AdminOnly><RecipeEditPage /></AdminOnly>} />
      <Route path="/admin/shopping" element={<AdminOnly><ShoppingPage /></AdminOnly>} />
      <Route path="/admin/settings" element={<AdminOnly><SettingsPage /></AdminOnly>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AppProvider>
        <App />
      </AppProvider>
    </BrowserRouter>
  </StrictMode>,
);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  });
}
