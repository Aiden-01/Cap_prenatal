import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { lazy, Suspense } from "react";
import { useAuth } from "./hooks/useAuth";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";

const Pacientes = lazy(() => import("./pages/Pacientes"));
const NuevaPaciente = lazy(() => import("./pages/NuevaPaciente"));
const ExpedientePaciente = lazy(() => import("./pages/ExpedientePaciente"));
const NuevoControl = lazy(() => import("./pages/NuevoControl"));
const FichaRiesgo = lazy(() => import("./pages/FichaRiesgo"));
const PlanPartoForm = lazy(() => import("./pages/PlanPartoForm"));
const PuerperioForm = lazy(() => import("./pages/PuerperioForm"));
const MorbilidadForm = lazy(() => import("./pages/MorbilidadForm"));
const VacunaForm = lazy(() => import("./pages/VacunaForm"));
const Reportes = lazy(() => import("./pages/Reportes"));
const Usuarios = lazy(() => import("./pages/Usuarios"));
const NotFoundPage = lazy(() => import("./pages/NotFoundPage"));
const MapaRiesgo = lazy(() => import("./pages/MapaRiesgo"));
const Comunidades = lazy(() => import("./pages/Comunidades"));

function LazyPage({ children }) {
  return (
    <Suspense fallback={<div className="card" style={{ padding: "1rem" }}>Cargando módulo...</div>}>
      {children}
    </Suspense>
  );
}

function PrivateRoute({ children, adminOnly = false, directorOnly = false }) {
  const { usuario, isAdmin } = useAuth();
  if (!usuario) return <Navigate to="/login" replace />;
  if (directorOnly && usuario.rol !== "director") return <Navigate to="/dashboard" replace />;
  if (adminOnly && !isAdmin) return <Navigate to="/dashboard" replace />;
  return children;
}

export default function App() {
  const { usuario } = useAuth();
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={usuario ? <Navigate to="/dashboard" /> : <Login />} />
        <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
          <Route index element={<Navigate to="/dashboard" />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="pacientes" element={<LazyPage><Pacientes /></LazyPage>} />
          <Route path="pacientes/:id" element={<LazyPage><ExpedientePaciente /></LazyPage>} />
          <Route path="pacientes/:id/editar" element={<LazyPage><NuevaPaciente /></LazyPage>} />
          <Route path="pacientes/:id/controles/nuevo" element={<LazyPage><NuevoControl /></LazyPage>} />
          <Route path="pacientes/:id/controles/:controlId/editar" element={<LazyPage><NuevoControl /></LazyPage>} />
          <Route path="pacientes/:id/riesgo" element={<LazyPage><FichaRiesgo /></LazyPage>} />
          <Route path="pacientes/:id/plan-parto" element={<LazyPage><PlanPartoForm /></LazyPage>} />
          <Route path="pacientes/:id/puerperio/nuevo" element={<LazyPage><PuerperioForm /></LazyPage>} />
          <Route path="pacientes/:id/puerperio/:puerperioId/editar" element={<LazyPage><PuerperioForm /></LazyPage>} />
          <Route path="pacientes/:id/morbilidad/nuevo" element={<LazyPage><MorbilidadForm /></LazyPage>} />
          <Route path="pacientes/:id/morbilidad/:morbilidadId/editar" element={<LazyPage><MorbilidadForm /></LazyPage>} />
          <Route path="pacientes/:id/vacunas/nuevo" element={<LazyPage><VacunaForm /></LazyPage>} />
          <Route path="pacientes/:id/vacunas/:vacunaId/editar" element={<LazyPage><VacunaForm /></LazyPage>} />
          <Route path="nuevo" element={<LazyPage><NuevaPaciente /></LazyPage>} />
          <Route path="reportes" element={<LazyPage><Reportes /></LazyPage>} />
          <Route path="mapa-riesgo" element={<LazyPage><MapaRiesgo /></LazyPage>} />
          <Route path="comunidades" element={<PrivateRoute directorOnly><LazyPage><Comunidades /></LazyPage></PrivateRoute>} />
          <Route path="usuarios" element={<PrivateRoute adminOnly><LazyPage><Usuarios /></LazyPage></PrivateRoute>} />
        </Route>
        <Route path="/404" element={<LazyPage><NotFoundPage /></LazyPage>} />
        <Route path="*" element={<LazyPage><NotFoundPage /></LazyPage>} />
      </Routes>
    </BrowserRouter>
  );
}
