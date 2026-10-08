import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { lazy, Suspense } from "react";
import { useAuth } from "./hooks/useAuth";
import Layout from "./components/Layout";
import PrivateRoute from "./components/AccessRoute";
import { ACCESS } from "./utils/accessRules";
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
const Historial = lazy(() => import("./pages/Historial"));

function LazyPage({ children }) {
  return (
    <Suspense fallback={<div className="card" style={{ padding: "1rem" }}>Cargando módulo...</div>}>
      {children}
    </Suspense>
  );
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
          <Route path="pacientes" element={<PrivateRoute access={ACCESS.patients}><LazyPage><Pacientes /></LazyPage></PrivateRoute>} />
          <Route path="pacientes/:id" element={<PrivateRoute access={ACCESS.patients}><LazyPage><ExpedientePaciente /></LazyPage></PrivateRoute>} />
          <Route path="pacientes/:id/editar" element={<PrivateRoute access={ACCESS.editPatient}><LazyPage><NuevaPaciente /></LazyPage></PrivateRoute>} />
          <Route path="pacientes/:id/controles/nuevo" element={<PrivateRoute access={ACCESS.newControl}><LazyPage><NuevoControl /></LazyPage></PrivateRoute>} />
          <Route path="pacientes/:id/controles/:controlId/editar" element={<PrivateRoute access={ACCESS.editControl}><LazyPage><NuevoControl /></LazyPage></PrivateRoute>} />
          <Route path="pacientes/:id/riesgo" element={<PrivateRoute access={ACCESS.riskForm}><LazyPage><FichaRiesgo /></LazyPage></PrivateRoute>} />
          <Route path="pacientes/:id/plan-parto" element={<PrivateRoute access={ACCESS.planForm}><LazyPage><PlanPartoForm /></LazyPage></PrivateRoute>} />
          <Route path="pacientes/:id/puerperio/nuevo" element={<PrivateRoute access={ACCESS.planForm}><LazyPage><PuerperioForm /></LazyPage></PrivateRoute>} />
          <Route path="pacientes/:id/puerperio/:puerperioId/editar" element={<PrivateRoute access={ACCESS.editControl}><LazyPage><PuerperioForm /></LazyPage></PrivateRoute>} />
          <Route path="pacientes/:id/morbilidad/nuevo" element={<PrivateRoute access={ACCESS.newControl}><LazyPage><MorbilidadForm /></LazyPage></PrivateRoute>} />
          <Route path="pacientes/:id/morbilidad/:morbilidadId/editar" element={<PrivateRoute access={ACCESS.editControl}><LazyPage><MorbilidadForm /></LazyPage></PrivateRoute>} />
          <Route path="pacientes/:id/vacunas/nuevo" element={<PrivateRoute access={ACCESS.newControl}><LazyPage><VacunaForm /></LazyPage></PrivateRoute>} />
          <Route path="pacientes/:id/vacunas/:vacunaId/editar" element={<PrivateRoute access={ACCESS.editControl}><LazyPage><VacunaForm /></LazyPage></PrivateRoute>} />
          <Route path="nuevo" element={<PrivateRoute access={ACCESS.newPatient}><LazyPage><NuevaPaciente /></LazyPage></PrivateRoute>} />
          <Route path="reportes" element={<PrivateRoute access={ACCESS.reports}><LazyPage><Reportes /></LazyPage></PrivateRoute>} />
          <Route path="mapa-riesgo" element={<PrivateRoute access={ACCESS.riskMap}><LazyPage><MapaRiesgo /></LazyPage></PrivateRoute>} />
          <Route path="comunidades" element={<PrivateRoute access={ACCESS.communities}><LazyPage><Comunidades /></LazyPage></PrivateRoute>} />
          <Route path="usuarios" element={<PrivateRoute access={ACCESS.users}><LazyPage><Usuarios /></LazyPage></PrivateRoute>} />
          <Route path="historial" element={<PrivateRoute access={ACCESS.history}><LazyPage><Historial /></LazyPage></PrivateRoute>} />
        </Route>
        <Route path="/404" element={<LazyPage><NotFoundPage /></LazyPage>} />
        <Route path="*" element={<LazyPage><NotFoundPage /></LazyPage>} />
      </Routes>
    </BrowserRouter>
  );
}
