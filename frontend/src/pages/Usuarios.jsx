import { useEffect, useMemo, useRef, useState } from "react";
import {
  UserPlus, ShieldCheck, ShieldOff, ShieldAlert,
  User, KeyRound, BadgeCheck, Loader2, CheckCircle2, Trash2, X, LockKeyhole, AlertTriangle,
  Stethoscope, Users, BarChart3, Info, PlusCircle, Pencil, Eye, FileDown, MapPinned, Search
} from "lucide-react";
import api from "../api/axios";
import { useAuth } from "../hooks/useAuth";
import { useGlobalToast } from "../context/ToastContext";
import { getErrorMessage } from "../utils/errorMessage";
import { useFieldErrors } from "../hooks/useFieldErrors";
import PerfilProfesionalFields from '../components/usuarios/PerfilProfesionalFields';
import ModalPerfilProfesional from '../components/usuarios/ModalPerfilProfesional';
import CatalogosProfesionales from '../components/usuarios/CatalogosProfesionales';
import '../components/usuarios/profesionales.css';

import { requiresVihConfirmation } from "../utils/permissionConfirmation";
import { hasPermission } from "../utils/accessRules";

const INIT = { nombre_completo: "", username: "", password: "", rol: "personal_salud", cargo_id: null, especialidad_id: null };

const PERMISSION_UI = {
  "auditoria.ver": {
    label: "Ver historial de actividad",
    description: "Consultar el historial de actividad del sistema.",
    section: "historial",
    Icon: ShieldCheck,
  },
  "controles.crear": {
    label: "Registrar controles prenatales",
    description: "Registrar un nuevo control prenatal.",
    section: "controles",
    Icon: PlusCircle,
  },
  "controles.editar": {
    label: "Editar controles prenatales",
    description: "Actualizar controles prenatales registrados.",
    section: "controles",
    Icon: Pencil,
  },
  "controles.ver_vih": {
    label: "Ver resultados de VIH",
    description: "Consultar resultados de VIH registrados en los controles prenatales.",
    section: "vih",
    Icon: LockKeyhole,
    sensitive: true,
  },
  "pacientes.crear": {
    label: "Registrar pacientes",
    description: "Abrir un expediente para una nueva paciente.",
    section: "pacientes",
    Icon: PlusCircle,
  },
  "pacientes.ver": {
    label: "Ver pacientes",
    description: "Consultar expedientes de pacientes.",
    section: "pacientes",
    Icon: Eye,
  },
  "pacientes.editar": {
    label: "Editar pacientes",
    description: "Actualizar datos generales de las pacientes.",
    section: "pacientes",
    Icon: Pencil,
  },
  "mapa_riesgo.ver": {
    label: "Ver mapa de riesgo",
    description: "Consultar el mapa de riesgo obstétrico.",
    section: "reportes",
    Icon: MapPinned,
  },
  "reportes.ver": {
    label: "Ver reportes",
    description: "Consultar reportes de atención y seguimiento.",
    section: "reportes",
    Icon: BarChart3,
  },
  "reportes.exportar": {
    label: "Exportar reportes",
    description: "Descargar reportes en Excel o PDF.",
    section: "reportes",
    Icon: FileDown,
  },
  "notas_evolucion.ver": {
    label: "Consultar notas de evolución médica",
    description: "Consultar documentos de evolución médica según el acceso autorizado.",
    section: "notas_evolucion",
    Icon: Eye,
  },
  "notas_evolucion.registrar": {
    label: "Registrar notas de evolución médica",
    description: "Capturar la nota del médico responsable. El capturista puede ser otra persona y no adquiere su autoría clínica.",
    section: "notas_evolucion",
    Icon: Pencil,
  },
  "notas_evolucion.finalizar_captura": {
    label: "Finalizar captura de evolución médica",
    description: "Cerrar administrativamente el registro. No equivale a firmar, validar clínicamente ni emitir una prescripción.",
    section: "notas_evolucion",
    Icon: CheckCircle2,
  },
  "notas_enfermeria.ver": {
    label: "Consultar notas de evolución de enfermería",
    description: "Consultar documentos de evolución de enfermería según el acceso autorizado.",
    section: "notas_enfermeria",
    Icon: Eye,
  },
  "notas_enfermeria.registrar": {
    label: "Registrar notas de evolución de enfermería",
    description: "Capturar la nota del responsable AE o EP. El capturista puede ser otra persona y no adquiere su autoría clínica.",
    section: "notas_enfermeria",
    Icon: Pencil,
  },
  "notas_enfermeria.finalizar_captura": {
    label: "Finalizar captura de evolución de enfermería",
    description: "Cerrar administrativamente el registro. No equivale a firmar, validar clínicamente ni emitir una prescripción.",
    section: "notas_enfermeria",
    Icon: CheckCircle2,
  },
  "ordenes_medicas.ver": {
    label: "Consultar órdenes médicas",
    description: "Consultar órdenes médicas según el acceso autorizado.",
    section: "ordenes_medicas",
    Icon: Eye,
  },
  "ordenes_medicas.transcribir": {
    label: "Transcribir órdenes médicas",
    description: "Capturar indicaciones del médico responsable sin asumir su identidad ni adquirir permiso para emitir órdenes.",
    section: "ordenes_medicas",
    Icon: Pencil,
  },
  "ordenes_medicas.finalizar_captura": {
    label: "Finalizar captura de órdenes médicas",
    description: "Cerrar administrativamente la captura. No equivale a firmar, validar clínicamente ni emitir una prescripción.",
    section: "ordenes_medicas",
    Icon: CheckCircle2,
  },
  "ordenes_medicas.emitir": {
    label: "Emitir órdenes médicas",
    description: "Facultad reservada al médico autorizado. El permiso y la clasificación del cargo no acreditan por sí solos habilitación legal.",
    section: "ordenes_medicas",
    Icon: Stethoscope,
    sensitive: true,
  },
  "catalogos_profesionales.gestionar": {
    label: "Gestionar catálogos profesionales",
    description: "Administrar cargos, su clasificación profesional y especialidades. Requiere además un rol administrativo autorizado.",
    section: "catalogos_profesionales",
    Icon: BadgeCheck,
  },
};

const PERMISSION_SECTIONS = [
  {
    id: "pacientes",
    title: "Pacientes",
    description: "Expedientes de pacientes.",
    Icon: Users,
  },
  {
    id: "controles",
    title: "Controles prenatales",
    description: "Registro y seguimiento de controles.",
    Icon: Stethoscope,
  },
  {
    id: "reportes",
    title: "Reportes y mapa de riesgo",
    description: "Información para el seguimiento del CAP.",
    Icon: BarChart3,
  },
  {
    id: "vih",
    title: "Resultados de VIH",
    description: "Consulta y corrección de resultados registrados.",
    Icon: ShieldAlert,
    sensitive: true,
  },
  {
    id: "historial",
    title: "Historial de actividad",
    description: "Registro de acciones realizadas en el sistema.",
    Icon: ShieldCheck,
  },
  {
    id: "notas_evolucion",
    title: "Notas de evolución médica",
    description: "La autoría corresponde al médico responsable; capturar y finalizar son acciones diferenciadas.",
    Icon: Stethoscope,
  },
  {
    id: "notas_enfermeria",
    title: "Notas de evolución de enfermería",
    description: "La autoría corresponde al AE o EP responsable; capturar y finalizar son acciones diferenciadas.",
    Icon: Users,
  },
  {
    id: "ordenes_medicas",
    title: "Órdenes médicas",
    description: "Transcribir o finalizar la captura no autoriza a emitir indicaciones médicas.",
    Icon: Stethoscope,
  },
  {
    id: "catalogos_profesionales",
    title: "Catálogos profesionales",
    description: "Administración de cargos y especialidades; no concede autoría clínica.",
    Icon: BadgeCheck,
  },
];

function getPermissionUi(permiso) {
  return PERMISSION_UI[permiso.codigo] || {
    label: permiso.descripcion || "Permiso adicional",
    description: "Acceso adicional del sistema.",
    section: permiso.categoria || "otros",
    Icon: ShieldCheck,
  };
}

function normalizarBusquedaPermisos(texto) {
  return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

const FIELD_LABELS = {
  nombre_completo: "Nombre completo",
  username: "Usuario",
  password: "Contrasena",
  rol: "Rol",
  cargo_id: 'Cargo laboral',
  especialidad_id: 'Especialidad',
};

function inferUsuarioFieldErrors(err) {
  const code = err?.response?.data?.code;
  const message = getErrorMessage(err, "");
  if (code === "DUPLICATE_RESOURCE" && message.toLowerCase().includes("usuario")) {
    return { username: message };
  }
  return {};
}

function SuccessBanner({ nombre }) {
  return (
    <div className="status-banner success">
      <CheckCircle2 size={20} color="var(--accent)" strokeWidth={2.5} style={{ flexShrink: 0 }} />
      <div>
        <div style={{ color: "var(--accent)", fontWeight: 700, fontSize: "0.88rem" }}>
          Usuario creado exitosamente
        </div>
        <div style={{ color: "var(--accent)", opacity: 0.8, fontSize: "0.8rem", marginTop: 1 }}>
          <strong>{nombre}</strong> ya puede iniciar sesion en el sistema
        </div>
      </div>
    </div>
  );
}

/* Modal de confirmacion para eliminar */
function ModalEliminar({ usuario, onConfirmar, onCancelar }) {
  if (!usuario) return null;
  return (
    <div className="modal-backdrop">
      <div className="card modal-card">
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1rem" }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: "var(--danger-lt)", display: "grid", placeItems: "center", flexShrink: 0,
          }}>
            <Trash2 size={18} color="var(--danger)" />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: "1rem" }}>Eliminar usuario</div>
            <div style={{ color: "var(--text-muted)", fontSize: "0.82rem" }}>
              Esta accion no se puede deshacer
            </div>
          </div>
        </div>

        <p style={{ fontSize: "0.9rem", marginBottom: "1.25rem", color: "var(--text-muted)" }}>
          Estas a punto de eliminar permanentemente a{" "}
          <strong style={{ color: "var(--text)" }}>{usuario.nombre_completo}</strong>.
          Todos sus datos de acceso seran borrados del sistema.
        </p>

        <div className="action-row">
          <button className="btn-secondary" onClick={onCancelar}>
            Cancelar
          </button>
          <button className="btn-danger" onClick={onConfirmar}>
            <Trash2 size={14} /> Eliminar
          </button>
        </div>
      </div>
    </div>
  );
}

function ModalConfirmarVih({ usuario, saving, onConfirmar, onCancelar }) {
  const cancelarRef = useRef(null);
  const dialogRef = useRef(null);
  useEffect(() => {
    const anterior = document.activeElement;
    cancelarRef.current?.focus();
    return () => anterior?.focus();
  }, []);
  const onKeyDown = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      if (!saving) onCancelar();
    }
    if (event.key === "Tab") {
      const botones = [...dialogRef.current.querySelectorAll('button:not(:disabled)')];
      const primero = botones[0];
      const ultimo = botones.at(-1);
      if (!primero) { event.preventDefault(); return; }
      if (event.shiftKey && document.activeElement === primero) {
        event.preventDefault(); ultimo.focus();
      } else if (!event.shiftKey && document.activeElement === ultimo) {
        event.preventDefault(); primero.focus();
      }
    }
  };
  return (
    <div className="modal-backdrop vih-confirmation-backdrop" onKeyDown={onKeyDown}>
      <div ref={dialogRef} className="card modal-card vih-confirmation" role="alertdialog" aria-modal="true" aria-labelledby="vih-confirmation-title" aria-describedby="vih-confirmation-description" aria-busy={saving}>
        <ShieldAlert size={32} className="vih-confirmation-icon" aria-hidden="true" />
        <h2 id="vih-confirmation-title">Asignar acceso a resultados de VIH</h2>
        <div className="vih-confirmation-user"><strong>{usuario.nombre_completo}</strong><span>@{usuario.username}</span></div>
        <p id="vih-confirmation-description">Estás por permitir que este usuario consulte resultados de VIH. Este permiso da acceso a información clínica especialmente sensible. ¿Deseas continuar?</p>
        <div className="vih-confirmation-actions">
          <button ref={cancelarRef} type="button" className="btn-secondary" onClick={onCancelar} disabled={saving}>Cancelar</button>
          <button type="button" className="btn-primary" onClick={onConfirmar} disabled={saving}>{saving ? <><Loader2 className="spin" size={16} /> Guardando...</> : "Asignar permiso"}</button>
        </div>
      </div>
    </div>
  );
}

function rolLabel(rol) {
  if (rol === "director") return "Director";
  if (rol === "admin") return "Admin";
  return "Personal salud";
}

function rolBadge(rol) {
  if (rol === "director") return "badge-orange";
  if (rol === "admin") return "badge-blue";
  return "badge-green";
}

const ESTADO_FILTROS = [
  { value: "activos", label: "Activos" },
  { value: "inactivos", label: "Inactivos" },
  { value: "todos", label: "Todos" },
];

const ROL_FILTROS = [
  { value: "todos", label: "Todos" },
  { value: "admin", label: "Admin" },
  { value: "director", label: "Director" },
  { value: "personal_salud", label: "Personal salud" },
];

function ModalPermisos({
  usuario,
  catalogo,
  seleccionados,
  loading,
  saving,
  onToggle,
  onGuardar,
  blocked,
  onCancelar,
}) {
  const [busqueda, setBusqueda] = useState("");
  const [seccionesCerradas, setSeccionesCerradas] = useState({});
  if (!usuario) return null;
  const grupos = catalogo.filter((permiso) => permiso.codigo !== "auditoria.ver" || usuario.rol === "admin").reduce((acc, permiso) => {
    const ui = getPermissionUi(permiso);
    if (!acc[ui.section]) acc[ui.section] = [];
    acc[ui.section].push({ ...permiso, ui });
    return acc;
  }, {});
  const termino = normalizarBusquedaPermisos(busqueda);
  const gruposFiltrados = Object.fromEntries(Object.entries(grupos).map(([id, permisos]) => [
    id,
    termino
      ? permisos.filter(({ ui }) => normalizarBusquedaPermisos(`${ui.label} ${ui.description}`).includes(termino))
      : permisos,
  ]));
  const sections = [
    ...PERMISSION_SECTIONS,
    ...Object.keys(grupos)
      .filter((id) => !PERMISSION_SECTIONS.some((section) => section.id === id))
      .map((id) => ({
        id,
        title: "Otros permisos",
        description: "Permisos adicionales del sistema.",
        Icon: ShieldCheck,
      })),
  ].filter((section) => gruposFiltrados[section.id]?.length);
  const selectedCount = seleccionados.length;

  return (
    <div className="modal-backdrop permissions-backdrop" inert={blocked || undefined} aria-hidden={blocked || undefined}>
      <div className="card modal-card permissions-modal" role="dialog" aria-modal="true" aria-labelledby="permissions-modal-title">
        <div className="permissions-modal-header">
          <div className="permissions-modal-titlebar">
            <div className="permissions-modal-icon">
              <ShieldCheck size={20} />
            </div>
            <div>
              <h2 id="permissions-modal-title">Permisos del usuario</h2>
              <p>{usuario.nombre_completo} <span className="permissions-role">{rolLabel(usuario.rol)}</span></p>
            </div>
          </div>
          <button type="button" className="password-modal-close permissions-modal-close" onClick={onCancelar} disabled={saving} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        <div className="permissions-modal-tools">
          <label className="sr-only" htmlFor="permissions-search">Buscar permisos</label>
          <div className="permissions-search">
            <Search size={18} aria-hidden="true" />
            <input
              id="permissions-search"
              type="search"
              value={busqueda}
              onChange={(event) => setBusqueda(event.target.value)}
              placeholder="Buscar permisos"
              disabled={loading}
            />
          </div>
          <div className="permissions-modal-guidance">
            <Info size={15} />
            <span>Selecciona solo las acciones necesarias. Los permisos sensibles deben asignarse únicamente a personal autorizado. Conceder un permiso no acredita la profesión ni la habilitación legal de la persona.</span>
          </div>
        </div>

        {loading ? (
          <div className="permissions-loading">
            <Loader2 className="spin" size={18} />
            Cargando permisos...
          </div>
        ) : (
          <div className="permissions-modal-body">
            {sections.length === 0 && (
              <p className="permissions-empty">No hay permisos que coincidan con la búsqueda.</p>
            )}
            {sections.map((section) => {
              const SectionIcon = section.Icon;
              const abierta = !seccionesCerradas[section.id];
              const seleccionadosEnSeccion = grupos[section.id].filter((permiso) => seleccionados.includes(permiso.codigo)).length;
              return (
              <section
                key={section.id}
                className={`permission-section ${section.sensitive ? "is-sensitive" : ""}`}
              >
                <button
                  type="button"
                  className="permission-section-header"
                  aria-expanded={abierta}
                  onClick={() => setSeccionesCerradas((actuales) => ({ ...actuales, [section.id]: abierta }))}
                >
                  <span className="permission-section-icon"><SectionIcon size={18} /></span>
                  <span className="permission-section-heading">
                    <span className="permission-section-title">{section.title}</span>
                    <span className="permission-section-description">{section.description}</span>
                  </span>
                  <span className="permission-section-count">{seleccionadosEnSeccion}/{grupos[section.id].length}</span>
                  <span className="permission-section-chevron" aria-hidden="true">{abierta ? "−" : "+"}</span>
                </button>
                {abierta && <div className="permission-list">
                  {gruposFiltrados[section.id].map((permiso) => {
                    const { ui } = permiso;
                    const Icon = ui.Icon;
                    const checked = seleccionados.includes(permiso.codigo);
                    return (
                      <label
                        key={permiso.codigo}
                        className={`permission-row ${checked ? "is-checked" : ""} ${ui.sensitive ? "is-sensitive" : ""}`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={saving}
                          onChange={() => onToggle(permiso.codigo)}
                        />
                        <span className="permission-row-check" aria-hidden="true">
                          {checked && <CheckCircle2 size={13} />}
                        </span>
                        <span className="permission-row-icon">
                          <Icon size={15} />
                        </span>
                        <span className="permission-row-copy">
                          <span className="permission-row-title">
                            {ui.label}
                            {ui.sensitive && <span className="permission-sensitive-badge">Acceso restringido</span>}
                          </span>
                          <span className="permission-row-description">
                            {ui.description}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>}
              </section>
              );
            })}
          </div>
        )}

        <div className="permissions-modal-footer">
          <span>{selectedCount} permisos seleccionados. Los cambios se aplican al guardar.</span>
          <div className="permissions-modal-actions">
          <button className="btn-secondary" onClick={onCancelar} disabled={saving}>
            Cancelar
          </button>
          <button className="btn-primary" onClick={onGuardar} disabled={loading || saving}>
            {saving ? <><Loader2 className="spin" size={14} /> Guardando...</> : <><ShieldCheck size={14} /> Guardar cambios</>}
          </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Usuarios() {
  const [usuarios, setUsuarios]         = useState([]);
  const [usuariosLoading, setUsuariosLoading] = useState(true);
  const [usuariosError, setUsuariosError] = useState('');
  const [form, setForm]                 = useState(INIT);
  const [loading, setLoading]           = useState(false);
  const [ultimoCreado, setUltimoCreado] = useState(null);
  const [aEliminar, setAEliminar]       = useState(null); // usuario seleccionado para eliminar
  const [formOpen, setFormOpen]         = useState(false);
  const [perfilUsuario, setPerfilUsuario] = useState(null);
  const [catalogosOpen, setCatalogosOpen] = useState(false);
  const [createReady, setCreateReady] = useState(false);
  const createPending = useRef(false);
  const [permisosUsuario, setPermisosUsuario] = useState(null);
  const [catalogoPermisos, setCatalogoPermisos] = useState([]);
  const [permisosSeleccionados, setPermisosSeleccionados] = useState([]);
  const [permisosLoading, setPermisosLoading] = useState(false);
  const [permisosSaving, setPermisosSaving] = useState(false);
  const [permisosOriginales, setPermisosOriginales] = useState([]);
  const [confirmarVih, setConfirmarVih] = useState(false);
  const permisosRequestRef = useRef(false);
  const [filtroEstado, setFiltroEstado] = useState("activos");
  const [filtroRol, setFiltroRol] = useState("todos");
  const [busqueda, setBusqueda] = useState("");
  const fieldErrors = useFieldErrors(FIELD_LABELS, inferUsuarioFieldErrors);
  const toast        = useGlobalToast();
  const { usuario: yo, refreshUsuario } = useAuth();
  const esDirector = yo?.rol === "director";
  const puedeGestionarCatalogos = ["admin", "director"].includes(yo?.rol)
    && hasPermission(yo, "catalogos_profesionales.gestionar");

  const cargar = () => {
    setUsuariosLoading(true); setUsuariosError('');
    return api.get('/usuarios').then(({ data }) => setUsuarios(data))
      .catch(err => setUsuariosError(getErrorMessage(err, 'No se pudieron cargar los usuarios')))
      .finally(() => setUsuariosLoading(false));
  };

  useEffect(() => {
    const controller = new AbortController();
    api.get('/usuarios', { signal: controller.signal })
      .then(({ data }) => { if (!controller.signal.aborted) setUsuarios(data); })
      .catch(err => { if (!controller.signal.aborted) setUsuariosError(getErrorMessage(err, 'No se pudieron cargar los usuarios')); })
      .finally(() => { if (!controller.signal.aborted) setUsuariosLoading(false); });
    return () => controller.abort();
  }, []);

  const usuariosFiltrados = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();

    return usuarios.filter((u) => {
      const coincideEstado = filtroEstado === "todos"
        || (filtroEstado === "activos" && u.activo)
        || (filtroEstado === "inactivos" && !u.activo);
      const coincideRol = filtroRol === "todos" || u.rol === filtroRol;
      const coincideBusqueda = !termino
        || u.nombre_completo?.toLowerCase().includes(termino)
        || u.username?.toLowerCase().includes(termino);

      return coincideEstado && coincideRol && coincideBusqueda;
    });
  }, [usuarios, filtroEstado, filtroRol, busqueda]);

  const conteoActivos = usuarios.filter((u) => u.activo).length;
  const conteoInactivos = usuarios.length - conteoActivos;

  const handleCrear = async (e) => {
    e.preventDefault();
    if (createPending.current || !createReady) return;
    if (!form.cargo_id) { toast('Selecciona un cargo laboral', 'error'); return; }
    createPending.current = true;
    setLoading(true);
    setUltimoCreado(null);
    fieldErrors.clearFieldErrors();
    try {
      await api.post("/usuarios", form);
      setUltimoCreado(form.nombre_completo);
      setForm(INIT);
      cargar();
      setTimeout(() => setUltimoCreado(null), 5000);
    } catch (err) {
      toast(fieldErrors.setErrorsFromResponse(err, "Error al crear usuario").message, "error");
    } finally {
      createPending.current = false;
      setLoading(false);
    }
  };

  const toggleActivo = async (u) => {
    if (String(u.id) === String(yo?.id)) {
      toast("No puedes modificar tu propia cuenta", "error");
      return;
    }
    try {
      await api.put(`/usuarios/${u.id}`, { activo: !u.activo });
      cargar();
      // Toast sin emojis — texto plano
      toast(
        u.activo
          ? `${u.nombre_completo} desactivado`
          : `${u.nombre_completo} reactivado`,
        u.activo ? "info" : "success"
      );
    } catch (err) {
      toast(getErrorMessage(err, "Error al actualizar usuario"), "error");
    }
  };

  const confirmarEliminar = async () => {
    if (!aEliminar) return;
    if (!aEliminar.puede_eliminarse) {
      toast("Este usuario esta protegido por historial. Desactivalo en lugar de eliminarlo.", "error");
      setAEliminar(null);
      return;
    }
    try {
      await api.delete(`/usuarios/${aEliminar.id}`);
      toast(`${aEliminar.nombre_completo} eliminado del sistema`, "info");
      setAEliminar(null);
      cargar();
    } catch (err) {
      toast(getErrorMessage(err, "Error al eliminar usuario"), "error");
      setAEliminar(null);
    }
  };

  const abrirPermisos = async (usuario) => {
    setPermisosUsuario(usuario);
    setPermisosLoading(true);
    setPermisosSeleccionados([]);
    setPermisosOriginales([]);
    setConfirmarVih(false);
    try {
      const [{ data: catalogo }, { data: actuales }] = await Promise.all([
        api.get("/permisos"),
        api.get(`/usuarios/${usuario.id}/permisos`),
      ]);
      setCatalogoPermisos(catalogo);
      setPermisosSeleccionados(actuales.map((permiso) => permiso.codigo));
      setPermisosOriginales(actuales.map((permiso) => permiso.codigo));
    } catch (err) {
      toast(getErrorMessage(err, "Error al cargar permisos"), "error");
      setPermisosUsuario(null);
    } finally {
      setPermisosLoading(false);
    }
  };

  const togglePermiso = (codigo) => {
    setPermisosSeleccionados((actuales) =>
      actuales.includes(codigo)
        ? actuales.filter((item) => item !== codigo)
        : [...actuales, codigo]
    );
  };

  const guardarPermisos = async () => {
    if (!permisosUsuario || permisosLoading || permisosRequestRef.current) return;
    permisosRequestRef.current = true;
    setPermisosSaving(true);
    try {
      await api.put(`/usuarios/${permisosUsuario.id}/permisos`, { permisos: permisosSeleccionados });
      setPermisosOriginales([...permisosSeleccionados]);
      toast("Permisos actualizados", "success");
      if (permisosUsuario.id === yo?.id) {
        await refreshUsuario();
      }
      setPermisosUsuario(null);
      setConfirmarVih(false);
    } catch (err) {
      toast(getErrorMessage(err, "Error al guardar permisos"), "error");
    } finally {
      permisosRequestRef.current = false;
      setPermisosSaving(false);
    }
  };

  return (
    <>
      {perfilUsuario && <ModalPerfilProfesional key={perfilUsuario.id} usuario={perfilUsuario} onClose={() => setPerfilUsuario(null)} onSaved={cargar} />}
      {/* Modal confirmacion eliminar */}
      <ModalEliminar
        usuario={aEliminar}
        onConfirmar={confirmarEliminar}
        onCancelar={() => setAEliminar(null)}
      />
      <ModalPermisos
        key={permisosUsuario?.id ?? "cerrado"}
        usuario={permisosUsuario}
        catalogo={catalogoPermisos}
        seleccionados={permisosSeleccionados}
        loading={permisosLoading}
        saving={permisosSaving}
        onToggle={togglePermiso}
        blocked={confirmarVih}
        onGuardar={() => {
          if (permisosLoading || permisosRequestRef.current || confirmarVih) return;
          if (requiresVihConfirmation(permisosOriginales, permisosSeleccionados)) setConfirmarVih(true);
          else guardarPermisos();
        }}
        onCancelar={() => !permisosSaving && setPermisosUsuario(null)}
      />

      {confirmarVih && permisosUsuario && <ModalConfirmarVih
        usuario={permisosUsuario}
        saving={permisosSaving}
        onConfirmar={guardarPermisos}
        onCancelar={() => !permisosRequestRef.current && setConfirmarVih(false)}
      />}

      <div className="record-page" inert={confirmarVih || undefined}>
        <div className="page-header">
          <ShieldCheck size={26} color="var(--primary)" />
          <div>
            <h1>
              Gestion de Usuarios
            </h1>
            <p>
              Administra el acceso al sistema
            </p>
          </div>
          <button
            type="button"
            className="user-create-minimal"
            onClick={() => { setCreateReady(false); setFormOpen(true); setCatalogosOpen(false); }}
          >
            <UserPlus size={16} />
            Nuevo usuario
          </button>
          {puedeGestionarCatalogos && <button type="button" className="btn-secondary" onClick={() => setCatalogosOpen(true)}>Catálogos profesionales</button>}
        </div>

        {catalogosOpen && puedeGestionarCatalogos ? <CatalogosProfesionales onClose={() => setCatalogosOpen(false)} /> : <div
          className="usuarios-grid"
        >
          {/* ── Tabla de usuarios ── */}
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <div className="card-titlebar">
              <User size={16} color="var(--text-muted)" />
              <strong>
                Usuarios registrados
              </strong>
              <span className="badge badge-blue" style={{ marginLeft: "auto" }}>
                {usuariosFiltrados.length}
              </span>
            </div>

            <div className="usuarios-toolbar">
              <div className="usuarios-tabs" role="tablist" aria-label="Filtro por estado">
                {ESTADO_FILTROS.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    className={`usuarios-tab ${filtroEstado === item.value ? "is-active" : ""}`}
                    onClick={() => setFiltroEstado(item.value)}
                  >
                    {item.label}
                    <span>
                      {item.value === "activos" ? conteoActivos : item.value === "inactivos" ? conteoInactivos : usuarios.length}
                    </span>
                  </button>
                ))}
              </div>

              <div className="usuarios-filters">
                <div className="usuarios-search">
                  <Search size={15} />
                  <input
                    type="search"
                    placeholder="Buscar nombre o usuario"
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                  />
                </div>
                <select
                  className="usuarios-role-filter"
                  value={filtroRol}
                  onChange={(e) => setFiltroRol(e.target.value)}
                  aria-label="Filtrar por rol"
                >
                  {ROL_FILTROS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="tabla-wrapper">
              {usuariosLoading && <p role="status">Cargando usuarios…</p>}
              {usuariosError && <div role="alert" className="error-box">{usuariosError} <button className="btn-secondary" onClick={cargar}>Reintentar</button></div>}
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Usuario</th>
                    <th>Rol</th>
                    <th>Estado</th>
                    <th>Historial</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {usuariosFiltrados.map((u) => {
                    const esSelf = String(u.id) === String(yo?.id);
                    const protegido = !u.puede_eliminarse;
                    const eliminarTitle = esSelf
                      ? "No puedes eliminar tu propia cuenta"
                      : protegido
                        ? "No puede eliminarse porque tiene historial clinico o de auditoria. Desactivalo para conservar trazabilidad."
                        : "Eliminar usuario";
                    return (
                      <tr key={u.id} className={!u.activo ? "usuario-row-inactivo" : ""}>
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                            <div className="avatar-token">
                              <User size={14} color="var(--primary)" />
                            </div>
                            <div>
                              <div style={{ fontWeight: 500, fontSize: "0.88rem" }}>
                                {u.nombre_completo}
                              </div>
                              <div className="usuario-profesion">
                                {u.cargo_nombre || 'Sin cargo asignado'}{u.cargo_activo === false ? ' (inactivo)' : ''}
                                {u.especialidad_nombre && <> · {u.especialidad_nombre}{u.especialidad_activa === false ? ' (inactiva)' : ''}</>}
                              </div>
                              {esSelf && (
                                <div style={{ fontSize: "0.72rem", color: "var(--primary)" }}>
                                  (tu)
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
                          {u.username}
                        </td>
                        <td>
                          <span className={`badge ${rolBadge(u.rol)}`}>
                            {rolLabel(u.rol)}
                          </span>
                        </td>
                        <td>
                          {u.activo
                            ? <span className="badge badge-green" style={{ gap: "0.3rem" }}>
                                <ShieldCheck size={11} /> Activo
                              </span>
                            : <span className="badge badge-red" style={{ gap: "0.3rem" }}>
                                <ShieldOff size={11} /> Inactivo
                              </span>
                          }
                        </td>
                        <td>
                          {u.puede_eliminarse
                            ? <span className="badge badge-blue" title="No tiene registros clinicos ni auditoria asociada">
                                <CheckCircle2 size={11} /> Puede eliminarse
                              </span>
                            : <span className="badge badge-orange" title="Tiene registros clinicos o de auditoria asociados">
                                <LockKeyhole size={11} /> Protegido por historial
                              </span>
                          }
                        </td>
                        <td>
                          <div className="table-actions">
                            <button className="btn-secondary btn-compact" onClick={() => setPerfilUsuario(u)} title={`Editar perfil profesional de ${u.nombre_completo}`}><Pencil size={13} /> Perfil</button>
                            {/* Activar / Desactivar */}
                            <button
                              className={`btn-secondary btn-compact ${!u.activo ? "btn-reactivar" : ""}`}
                              onClick={() => toggleActivo(u)}
                              disabled={esSelf}
                              title={esSelf ? "No puedes modificar tu propia cuenta" : ""}
                            >
                              {u.activo
                                ? <><ShieldOff size={13} /> Desactivar</>
                                : <><ShieldAlert size={13} /> Reactivar</>
                              }
                            </button>

                            {/* Eliminar */}
                            <button
                              className="btn-soft-danger"
                              onClick={() => !esSelf && !protegido && setAEliminar(u)}
                              disabled={esSelf || protegido}
                              title={eliminarTitle}
                            >
                              <Trash2 size={13} />
                              Eliminar
                            </button>
                            {esDirector && (
                              <button
                                className="btn-secondary btn-compact"
                                onClick={() => abrirPermisos(u)}
                                title="Gestionar permisos"
                              >
                                <ShieldCheck size={13} />
                                Permisos
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}

                  {!usuariosLoading && !usuariosError && usuariosFiltrados.length === 0 && (
                    <tr>
                      <td colSpan={6} style={{
                        textAlign: "center",
                        color: "var(--text-muted)",
                        padding: "2rem",
                      }}>
                        No hay usuarios con los filtros seleccionados
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Formulario nuevo usuario ── */}
          {formOpen && (
          <div className="user-create-drawer-shell">
            <button
              type="button"
              className="user-create-drawer-backdrop"
              onClick={() => !loading && setFormOpen(false)}
              aria-label="Cerrar formulario"
            />

          <div className="card user-create-drawer">
            <div className="record-panel-header user-create-drawer-header">
              <span className="user-create-title">
                <UserPlus size={18} color="var(--primary)" />
                <span>Nuevo usuario</span>
              </span>
              <button
                type="button"
                className="password-modal-close"
                onClick={() => !loading && setFormOpen(false)}
                disabled={loading}
                aria-label="Cerrar"
              >
                <X size={18} />
              </button>
            </div>

            {ultimoCreado && (
              <div style={{ marginBottom: "1.25rem" }}>
                <SuccessBanner nombre={ultimoCreado} />
              </div>
            )}

            <form onSubmit={handleCrear} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {fieldErrors.summary.length > 0 && (
                <div className="error-box">
                  <strong>Revisa estos datos:</strong>{" "}
                  {fieldErrors.summary.map((error) => `${error.label}: ${error.message}`).join(" | ")}
                </div>
              )}
              <div className="form-group">
                <label className="input-label" htmlFor="usuario-create-nombre">Nombre completo</label>
                <div className="icon-input">
                  <User size={15} />
                  <input
                    className={fieldErrors.inputClass("nombre_completo")}
                    name="nombre_completo"
                    id="usuario-create-nombre"
                    type="text"
                    placeholder="Nombre completo"
                    value={form.nombre_completo}
                    onChange={(e) => fieldErrors.setFormValue(setForm, "nombre_completo", e.target.value)}
                    required
                  />
                </div>
                {fieldErrors.fieldError("nombre_completo") && <div className="field-error-text">{fieldErrors.fieldError("nombre_completo")}</div>}
              </div>

              <div className="form-group">
                <label className="input-label" htmlFor="usuario-create-username">Usuario</label>
                <div className="icon-input">
                  <BadgeCheck size={15} />
                  <input
                    className={fieldErrors.inputClass("username")}
                    name="username"
                    id="usuario-create-username"
                    type="text"
                    placeholder="nombre_usuario"
                    value={form.username}
                    onChange={(e) => fieldErrors.setFormValue(setForm, "username", e.target.value)}
                    required
                  />
                </div>
                {fieldErrors.fieldError("username") && <div className="field-error-text">{fieldErrors.fieldError("username")}</div>}
              </div>

              <div className="form-group">
                <label className="input-label" htmlFor="usuario-create-password">Contrasena</label>
                <div className="icon-input">
                  <KeyRound size={15} />
                  <input
                    className={fieldErrors.inputClass("password")}
                    name="password"
                    id="usuario-create-password"
                    type="password"
                    placeholder="••••••••"
                    value={form.password}
                    onChange={(e) => fieldErrors.setFormValue(setForm, "password", e.target.value)}
                    required
                  />
                </div>
                {fieldErrors.fieldError("password") && <div className="field-error-text">{fieldErrors.fieldError("password")}</div>}
              </div>

              <div className="form-group">
                <label className="input-label" htmlFor="usuario-create-rol">Rol del sistema</label>
                <select
                  className={fieldErrors.inputClass("rol")}
                  name="rol"
                  id="usuario-create-rol"
                  value={form.rol}
                  onChange={(e) => fieldErrors.setFormValue(setForm, "rol", e.target.value)}
                >
                  <option value="personal_salud">Personal de salud</option>
                  <option value="admin">Administrador</option>
                  {esDirector && <option value="director">Director</option>}
                </select>
                {!esDirector && (
                  <div style={{ display: "flex", gap: "0.35rem", alignItems: "center", color: "var(--text-muted)", fontSize: "0.75rem", marginTop: 4 }}>
                    <AlertTriangle size={12} /> Solo un director puede crear usuarios director.
                  </div>
                )}
                {fieldErrors.fieldError("rol") && <div className="field-error-text">{fieldErrors.fieldError("rol")}</div>}
              </div>

              <PerfilProfesionalFields value={form} required disabled={loading} onReady={setCreateReady} onChange={(campo, valor) => setForm(current => ({ ...current, [campo]: valor }))} />
              <button
                className="btn-primary"
                type="submit"
                disabled={loading || !createReady}
                style={{ justifyContent: "center", marginTop: "0.25rem" }}
              >
                {loading
                  ? <><Loader2 className="spin" size={15} /> Creando...</>
                  : <><UserPlus size={15} /> Crear usuario</>
                }
              </button>
            </form>
          </div>
          </div>
          )}
        </div>}
      </div>
    </>
  );
}
