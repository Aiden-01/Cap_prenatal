import { useEffect, useMemo, useState } from "react";
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

const INIT = { nombre_completo: "", username: "", password: "", rol: "personal_salud" };

const PERMISSION_UI = {
  "controles.crear": {
    label: "Crear controles prenatales",
    description: "Permite registrar nuevos controles prenatales.",
    section: "clinica",
    Icon: PlusCircle,
  },
  "controles.editar": {
    label: "Editar controles prenatales",
    description: "Permite modificar información general de controles ya registrados.",
    section: "clinica",
    Icon: Pencil,
  },
  "controles.ver_vih": {
    label: "Ver y gestionar resultados VIH",
    description: "Permite ver y modificar resultados VIH ya registrados. Asignar solo a personal autorizado.",
    section: "sensibles",
    Icon: LockKeyhole,
    sensitive: true,
  },
  "pacientes.crear": {
    label: "Crear pacientes",
    description: "Permite registrar nuevos pacientes en el sistema.",
    section: "pacientes",
    Icon: PlusCircle,
  },
  "pacientes.ver": {
    label: "Ver pacientes",
    description: "Permite consultar información de pacientes.",
    section: "pacientes",
    Icon: Eye,
  },
  "pacientes.editar": {
    label: "Editar pacientes",
    description: "Permite actualizar información de pacientes existentes.",
    section: "pacientes",
    Icon: Pencil,
  },
  "pacientes.eliminar": {
    label: "Eliminar pacientes",
    description: "Permite eliminar registros de pacientes.",
    section: "pacientes",
    Icon: Trash2,
  },
  "mapa_riesgo.ver": {
    label: "Ver mapa de riesgo",
    description: "Permite consultar el mapa de riesgo obstétrico.",
    section: "reportes",
    Icon: MapPinned,
  },
  "reportes.ver": {
    label: "Ver reportes",
    description: "Permite visualizar reportes del sistema.",
    section: "reportes",
    Icon: BarChart3,
  },
  "reportes.exportar": {
    label: "Exportar reportes",
    description: "Permite exportar reportes para impresión o análisis.",
    section: "reportes",
    Icon: FileDown,
  },
};

const PERMISSION_SECTIONS = [
  {
    id: "clinica",
    title: "Atención clínica",
    description: "Acciones relacionadas con controles prenatales.",
    Icon: Stethoscope,
  },
  {
    id: "pacientes",
    title: "Pacientes",
    description: "Consulta y mantenimiento de expedientes.",
    Icon: Users,
  },
  {
    id: "reportes",
    title: "Reportes y análisis",
    description: "Herramientas para seguimiento y toma de decisiones.",
    Icon: BarChart3,
  },
  {
    id: "sensibles",
    title: "Datos sensibles",
    description: "Accesos restringidos que requieren autorización.",
    Icon: ShieldAlert,
    sensitive: true,
  },
];

function getPermissionUi(permiso) {
  return PERMISSION_UI[permiso.codigo] || {
    label: permiso.descripcion || permiso.codigo,
    description: "Permite realizar esta acción dentro del sistema.",
    section: permiso.categoria || "otros",
    Icon: ShieldCheck,
  };
}

const FIELD_LABELS = {
  nombre_completo: "Nombre completo",
  username: "Usuario",
  password: "Contrasena",
  rol: "Rol",
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
  onCancelar,
}) {
  if (!usuario) return null;
  const grupos = catalogo.reduce((acc, permiso) => {
    const ui = getPermissionUi(permiso);
    if (!acc[ui.section]) acc[ui.section] = [];
    acc[ui.section].push({ ...permiso, ui });
    return acc;
  }, {});
  const sections = [
    ...PERMISSION_SECTIONS,
    ...Object.keys(grupos)
      .filter((id) => !PERMISSION_SECTIONS.some((section) => section.id === id))
      .map((id) => ({
        id,
        title: id.replace("_", " "),
        description: "Permisos adicionales del sistema.",
        Icon: ShieldCheck,
      })),
  ].filter((section) => grupos[section.id]?.length);
  const selectedCount = seleccionados.length;

  return (
    <div className="modal-backdrop">
      <div className="card modal-card permissions-modal">
        <div className="permissions-modal-header">
          <div className="permissions-modal-titlebar">
            <div className="permissions-modal-icon">
              <ShieldCheck size={20} />
            </div>
            <div>
              <h2>Permisos del usuario</h2>
              <p>
                {usuario.nombre_completo}
              </p>
            </div>
          </div>
          <button type="button" className="password-modal-close" onClick={onCancelar} disabled={saving} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        <div className="permissions-modal-guidance">
          <Info size={15} />
          <span>Selecciona solo las acciones necesarias. Los permisos sensibles deben asignarse únicamente a personal autorizado.</span>
        </div>

        {loading ? (
          <div className="permissions-loading">
            <Loader2 className="spin" size={18} />
            Cargando permisos...
          </div>
        ) : (
          <div className="permissions-modal-body">
            {sections.map((section) => {
              const SectionIcon = section.Icon;
              return (
              <section
                key={section.id}
                className={`permission-section ${section.sensitive ? "is-sensitive" : ""}`}
              >
                <div className="permission-section-header">
                  <span className="permission-section-icon">
                    <SectionIcon size={16} />
                  </span>
                  <div>
                    <h3>{section.title}</h3>
                    <p>{section.description}</p>
                  </div>
                  <span className="permission-section-count">
                    {grupos[section.id].filter((permiso) => seleccionados.includes(permiso.codigo)).length}/{grupos[section.id].length}
                  </span>
                </div>
                <div className="permission-list">
                  {grupos[section.id].map((permiso) => {
                    const { ui } = permiso;
                    const Icon = ui.Icon;
                    const checked = seleccionados.includes(permiso.codigo);
                    return (
                      <label
                        key={permiso.codigo}
                        className={`permission-row ${checked ? "is-checked" : ""} ${ui.sensitive ? "is-sensitive" : ""}`}
                        title={`Código técnico: ${permiso.codigo}`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
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
                          <span className="permission-row-code">
                            {permiso.codigo}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </section>
              );
            })}
          </div>
        )}

        <div className="permissions-modal-footer">
          <span>{selectedCount} permisos seleccionados. Los cambios se aplican inmediatamente.</span>
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
  const [form, setForm]                 = useState(INIT);
  const [loading, setLoading]           = useState(false);
  const [ultimoCreado, setUltimoCreado] = useState(null);
  const [aEliminar, setAEliminar]       = useState(null); // usuario seleccionado para eliminar
  const [formOpen, setFormOpen]         = useState(false);
  const [permisosUsuario, setPermisosUsuario] = useState(null);
  const [catalogoPermisos, setCatalogoPermisos] = useState([]);
  const [permisosSeleccionados, setPermisosSeleccionados] = useState([]);
  const [permisosLoading, setPermisosLoading] = useState(false);
  const [permisosSaving, setPermisosSaving] = useState(false);
  const [filtroEstado, setFiltroEstado] = useState("activos");
  const [filtroRol, setFiltroRol] = useState("todos");
  const [busqueda, setBusqueda] = useState("");
  const fieldErrors = useFieldErrors(FIELD_LABELS, inferUsuarioFieldErrors);
  const toast        = useGlobalToast();
  const { usuario: yo, refreshUsuario } = useAuth();
  const esDirector = yo?.rol === "director";

  const cargar = () =>
    api.get("/usuarios").then(({ data }) => setUsuarios(data)).catch(console.error);

  useEffect(() => { cargar(); }, []);

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
      setLoading(false);
    }
  };

  const toggleActivo = async (u) => {
    if (String(u.id) === String(yo?.id)) {
      toast("No puedes modificar tu propia cuenta", "error");
      return;
    }
    try {
      await api.put(`/usuarios/${u.id}`, { ...u, activo: !u.activo });
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
    try {
      const [{ data: catalogo }, { data: actuales }] = await Promise.all([
        api.get("/permisos"),
        api.get(`/usuarios/${usuario.id}/permisos`),
      ]);
      setCatalogoPermisos(catalogo);
      setPermisosSeleccionados(actuales.map((permiso) => permiso.codigo));
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
    if (!permisosUsuario) return;
    setPermisosSaving(true);
    try {
      await api.put(`/usuarios/${permisosUsuario.id}/permisos`, { permisos: permisosSeleccionados });
      toast("Permisos actualizados", "success");
      if (permisosUsuario.id === yo?.id) {
        await refreshUsuario();
      }
      setPermisosUsuario(null);
    } catch (err) {
      toast(getErrorMessage(err, "Error al guardar permisos"), "error");
    } finally {
      setPermisosSaving(false);
    }
  };

  return (
    <>
      {/* Modal confirmacion eliminar */}
      <ModalEliminar
        usuario={aEliminar}
        onConfirmar={confirmarEliminar}
        onCancelar={() => setAEliminar(null)}
      />
      <ModalPermisos
        usuario={permisosUsuario}
        catalogo={catalogoPermisos}
        seleccionados={permisosSeleccionados}
        loading={permisosLoading}
        saving={permisosSaving}
        onToggle={togglePermiso}
        onGuardar={guardarPermisos}
        onCancelar={() => !permisosSaving && setPermisosUsuario(null)}
      />

      <div className="record-page">
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
            onClick={() => setFormOpen(true)}
          >
            <UserPlus size={16} />
            Nuevo usuario
          </button>
        </div>

        <div
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

                  {usuariosFiltrados.length === 0 && (
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
                <label className="input-label">Nombre completo</label>
                <div className="icon-input">
                  <User size={15} />
                  <input
                    className={fieldErrors.inputClass("nombre_completo")}
                    name="nombre_completo"
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
                <label className="input-label">Usuario</label>
                <div className="icon-input">
                  <BadgeCheck size={15} />
                  <input
                    className={fieldErrors.inputClass("username")}
                    name="username"
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
                <label className="input-label">Contrasena</label>
                <div className="icon-input">
                  <KeyRound size={15} />
                  <input
                    className={fieldErrors.inputClass("password")}
                    name="password"
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
                <label className="input-label">Rol</label>
                <select
                  className={fieldErrors.inputClass("rol")}
                  name="rol"
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

              <button
                className="btn-primary"
                type="submit"
                disabled={loading}
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
        </div>
      </div>
    </>
  );
}
