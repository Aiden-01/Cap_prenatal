import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./hooks/useAuth";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Pacientes from "./pages/Pacientes";
import NuevaPaciente from "./pages/NuevaPaciente";
import ExpedientePaciente from "./pages/ExpedientePaciente";
import NuevoControl from "./pages/NuevoControl";
import FichaRiesgo from "./pages/FichaRiesgo";
import PlanPartoForm from "./pages/PlanPartoForm";
import PuerperioForm from "./pages/PuerperioForm";
import MorbilidadForm from "./pages/MorbilidadForm";
import VacunaForm from "./pages/VacunaForm";
import Reportes from "./pages/Reportes";
import Usuarios from "./pages/Usuarios";

function PrivateRoute({ children, adminOnly = false }) {
  const { usuario, isAdmin } = useAuth();
  if (!usuario) return <Navigate to="/login" replace />;
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
          <Route path="pacientes" element={<Pacientes />} />
          <Route path="pacientes/:id" element={<ExpedientePaciente />} />
          <Route path="pacientes/:id/editar" element={<NuevaPaciente />} />
          <Route path="pacientes/:id/controles/nuevo" element={<NuevoControl />} />
          <Route path="pacientes/:id/controles/:controlId/editar" element={<NuevoControl />} />
          <Route path="pacientes/:id/riesgo" element={<FichaRiesgo />} />
          <Route path="pacientes/:id/plan-parto" element={<PlanPartoForm />} />
          <Route path="pacientes/:id/puerperio/nuevo" element={<PuerperioForm />} />
          <Route path="pacientes/:id/puerperio/:puerperioId/editar" element={<PuerperioForm />} />
          <Route path="pacientes/:id/morbilidad/nuevo" element={<MorbilidadForm />} />
          <Route path="pacientes/:id/morbilidad/:morbilidadId/editar" element={<MorbilidadForm />} />
          <Route path="pacientes/:id/vacunas/nuevo" element={<VacunaForm />} />
          <Route path="pacientes/:id/vacunas/:vacunaId/editar" element={<VacunaForm />} />
          <Route path="nuevo" element={<NuevaPaciente />} />
          <Route path="reportes" element={<Reportes />} />
          <Route path="usuarios" element={<PrivateRoute adminOnly><Usuarios /></PrivateRoute>} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" />} />
      </Routes>
    </BrowserRouter>
  );
}
