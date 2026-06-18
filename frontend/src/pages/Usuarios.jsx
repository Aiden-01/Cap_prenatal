import { useEffect, useState } from "react";
import {
  UserPlus, ShieldCheck, ShieldOff, ShieldAlert,
  User, KeyRound, BadgeCheck, Loader2, CheckCircle2, Trash2, X, LockKeyhole, AlertTriangle
} from "lucide-react";
import api from "../api/axios";
import { useAuth } from "../hooks/useAuth";
import { useGlobalToast } from "../context/ToastContext";
import { getErrorMessage } from "../utils/errorMessage";
import { useFieldErrors } from "../hooks/useFieldErrors";

const INIT = { nombre_completo: "", username: "", password: "", rol: "personal_salud" };

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
    if (!acc[permiso.categoria]) acc[permiso.categoria] = [];
    acc[permiso.categoria].push(permiso);
    return acc;
  }, {});

  return (
    <div className="modal-backdrop">
      <div className="card modal-card" style={{ maxWidth: 720 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "flex-start", marginBottom: "1rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10,
              background: "var(--primary-lt)", display: "grid", placeItems: "center", flexShrink: 0,
            }}>
              <ShieldCheck size={18} color="var(--primary)" />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: "1rem" }}>Gestionar permisos</div>
              <div style={{ color: "var(--text-muted)", fontSize: "0.82rem" }}>
                {usuario.nombre_completo}
              </div>
            </div>
          </div>
          <button type="button" className="password-modal-close" onClick={onCancelar} disabled={saving} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)" }}>
            Cargando permisos...
          </div>
        ) : (
          <div style={{ display: "grid", gap: "0.9rem", maxHeight: "58vh", overflowY: "auto", paddingRight: "0.25rem" }}>
            {Object.entries(grupos).map(([categoria, permisos]) => (
              <div key={categoria} style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
                <div className="card-titlebar" style={{ borderBottom: "1px solid var(--border)" }}>
                  <strong style={{ textTransform: "capitalize" }}>{categoria.replace("_", " ")}</strong>
                </div>
                <div style={{ display: "grid", gap: "0.45rem", padding: "0.75rem" }}>
                  {permisos.map((permiso) => {
                    const sensible = permiso.codigo === "controles.ver_vih";
                    return (
                      <label
                        key={permiso.codigo}
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: "0.65rem",
                          padding: "0.65rem",
                          borderRadius: 8,
                          border: sensible ? "1px solid var(--warn)" : "1px solid var(--border)",
                          background: sensible ? "var(--warn-lt)" : "var(--surface)",
                          cursor: "pointer",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={seleccionados.includes(permiso.codigo)}
                          onChange={() => onToggle(permiso.codigo)}
                          style={{ marginTop: 3 }}
                        />
                        <span style={{ display: "grid", gap: 2 }}>
                          <span style={{ display: "flex", gap: "0.4rem", alignItems: "center", fontWeight: 700, color: sensible ? "var(--warn)" : "var(--text)" }}>
                            {sensible && <LockKeyhole size={14} />}
                            {permiso.codigo}
                          </span>
                          <span style={{ fontSize: "0.8rem", color: sensible ? "var(--warn)" : "var(--text-muted)" }}>
                            {permiso.descripcion}
                            {sensible ? " - habilita visibilidad de datos VIH." : ""}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="action-row" style={{ marginTop: "1.25rem" }}>
          <button className="btn-secondary" onClick={onCancelar} disabled={saving}>
            Cancelar
          </button>
          <button className="btn-primary" onClick={onGuardar} disabled={loading || saving}>
            {saving ? <><Loader2 className="spin" size={14} /> Guardando...</> : <><ShieldCheck size={14} /> Guardar permisos</>}
          </button>
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
  const fieldErrors = useFieldErrors(FIELD_LABELS, inferUsuarioFieldErrors);
  const toast        = useGlobalToast();
  const { usuario: yo, refreshUsuario } = useAuth();
  const esDirector = yo?.rol === "director";

  const cargar = () =>
    api.get("/usuarios").then(({ data }) => setUsuarios(data)).catch(console.error);

  useEffect(() => { cargar(); }, []);

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
    if (u.id === yo?.id) {
      toast("No puedes desactivar tu propia cuenta", "error");
      return;
    }
    try {
      await api.put(`/usuarios/${u.id}`, { ...u, activo: !u.activo });
      cargar();
      // Toast sin emojis — texto plano
      toast(
        u.activo
          ? `${u.nombre_completo} desactivado`
          : `${u.nombre_completo} activado`,
        u.activo ? "info" : "success"
      );
    } catch (err) {
      toast(getErrorMessage(err, "Error al actualizar usuario"), "error");
    }
  };

  const confirmarEliminar = async () => {
    if (!aEliminar) return;
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
                {usuarios.length}
              </span>
            </div>

            <div className="tabla-wrapper">
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Usuario</th>
                    <th>Rol</th>
                    <th>Estado</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {usuarios.map((u) => {
                    const esSelf = u.id === yo?.id;
                    return (
                      <tr key={u.id} style={{ opacity: u.activo ? 1 : 0.6 }}>
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
                          <div className="table-actions">
                            {/* Activar / Desactivar */}
                            <button
                              className="btn-secondary btn-compact"
                              onClick={() => toggleActivo(u)}
                              disabled={esSelf}
                              title={esSelf ? "No puedes modificar tu propia cuenta" : ""}
                            >
                              {u.activo
                                ? <><ShieldOff size={13} /> Desactivar</>
                                : <><ShieldAlert size={13} /> Activar</>
                              }
                            </button>

                            {/* Eliminar */}
                            <button
                              className="btn-soft-danger"
                              onClick={() => !esSelf && setAEliminar(u)}
                              disabled={esSelf}
                              title={esSelf ? "No puedes eliminar tu propia cuenta" : "Eliminar usuario"}
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

                  {usuarios.length === 0 && (
                    <tr>
                      <td colSpan={5} style={{
                        textAlign: "center",
                        color: "var(--text-muted)",
                        padding: "2rem",
                      }}>
                        No hay usuarios registrados
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
