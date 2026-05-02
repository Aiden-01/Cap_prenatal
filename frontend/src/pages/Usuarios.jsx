import { useEffect, useState } from "react";
import {
  UserPlus, ShieldCheck, ShieldOff, ShieldAlert,
  User, KeyRound, BadgeCheck, Loader2, CheckCircle2, Trash2
} from "lucide-react";
import api from "../api/axios";
import { useAuth } from "../hooks/useAuth";
import { useGlobalToast } from "../context/ToastContext";

const INIT = { nombre_completo: "", username: "", password: "", rol: "personal_salud" };

function SuccessBanner({ nombre }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: "0.75rem",
      background: "var(--accent-lt)", border: "1px solid var(--accent)",
      borderRadius: 10, padding: "0.85rem 1.1rem",
      animation: "bannerIn 0.4s cubic-bezier(0.34,1.56,0.64,1)",
    }}>
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
    <div style={{
      position: "fixed", inset: 0, zIndex: 500,
      background: "rgba(0,0,0,0.45)", backdropFilter: "blur(2px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "1rem",
    }}>
      <div className="card" style={{
        maxWidth: 400, width: "100%",
        animation: "bannerIn 0.25s cubic-bezier(0.34,1.56,0.64,1)",
      }}>
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

        <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
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

export default function Usuarios() {
  const [usuarios, setUsuarios]         = useState([]);
  const [form, setForm]                 = useState(INIT);
  const [loading, setLoading]           = useState(false);
  const [ultimoCreado, setUltimoCreado] = useState(null);
  const [aEliminar, setAEliminar]       = useState(null); // usuario seleccionado para eliminar
  const toast        = useGlobalToast();
  const { usuario: yo } = useAuth();

  const cargar = () =>
    api.get("/usuarios").then(({ data }) => setUsuarios(data)).catch(console.error);

  useEffect(() => { cargar(); }, []);

  const handleCrear = async (e) => {
    e.preventDefault();
    setLoading(true);
    setUltimoCreado(null);
    try {
      await api.post("/usuarios", form);
      setUltimoCreado(form.nombre_completo);
      setForm(INIT);
      cargar();
      setTimeout(() => setUltimoCreado(null), 5000);
    } catch (err) {
      toast(err.response?.data?.error || "Error al crear usuario", "error");
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
      toast(err.response?.data?.error || "Error al actualizar usuario", "error");
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
      toast(err.response?.data?.error || "Error al eliminar usuario", "error");
      setAEliminar(null);
    }
  };

  return (
    <>
      <style>{`
        @keyframes bannerIn {
          from { opacity: 0; transform: translateY(-10px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0)     scale(1);    }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @media (max-width: 768px) {
          .usuarios-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {/* Modal confirmacion eliminar */}
      <ModalEliminar
        usuario={aEliminar}
        onConfirmar={confirmarEliminar}
        onCancelar={() => setAEliminar(null)}
      />

      <div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1.75rem" }}>
          <ShieldCheck size={26} color="var(--primary)" />
          <div>
            <h1 style={{ fontSize: "1.5rem", fontWeight: 800, lineHeight: 1 }}>
              Gestion de Usuarios
            </h1>
            <p style={{ color: "var(--text-muted)", fontSize: "0.82rem", marginTop: 3 }}>
              Administra el acceso al sistema
            </p>
          </div>
        </div>

        <div
          className="usuarios-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 380px",
            gap: "1.5rem",
            alignItems: "start",
          }}
        >
          {/* ── Tabla de usuarios ── */}
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <div style={{
              padding: "0.9rem 1.25rem",
              borderBottom: "1px solid var(--border)",
              display: "flex", alignItems: "center", gap: "0.5rem",
            }}>
              <User size={16} color="var(--text-muted)" />
              <span style={{ fontFamily: "Syne", fontSize: "0.88rem", fontWeight: 700 }}>
                Usuarios registrados
              </span>
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
                            <div style={{
                              width: 30, height: 30, borderRadius: "50%",
                              background: "var(--primary-lt)",
                              display: "grid", placeItems: "center", flexShrink: 0,
                            }}>
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
                          <span className={`badge ${u.rol === "admin" ? "badge-blue" : "badge-green"}`}>
                            {u.rol === "admin" ? "Admin" : "Personal salud"}
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
                          <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
                            {/* Activar / Desactivar */}
                            <button
                              className="btn-secondary"
                              style={{
                                padding: "0.3rem 0.65rem",
                                fontSize: "0.8rem",
                                opacity: esSelf ? 0.4 : 1,
                                cursor: esSelf ? "not-allowed" : "pointer",
                              }}
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
                              style={{
                                padding: "0.3rem 0.55rem",
                                fontSize: "0.8rem",
                                background: "var(--danger-lt)",
                                color: "var(--danger)",
                                border: "1px solid transparent",
                                borderRadius: 8,
                                cursor: esSelf ? "not-allowed" : "pointer",
                                opacity: esSelf ? 0.4 : 1,
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "0.35rem",
                                fontFamily: "DM Sans, sans-serif",
                                fontWeight: 500,
                                transition: "background 0.15s",
                              }}
                              onClick={() => !esSelf && setAEliminar(u)}
                              disabled={esSelf}
                              title={esSelf ? "No puedes eliminar tu propia cuenta" : "Eliminar usuario"}
                            >
                              <Trash2 size={13} />
                              Eliminar
                            </button>
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
          <div className="card">
            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "1.25rem" }}>
              <UserPlus size={18} color="var(--primary)" />
              <h3 style={{ fontFamily: "Syne", fontSize: "1rem", fontWeight: 700 }}>
                Nuevo usuario
              </h3>
            </div>

            {ultimoCreado && (
              <div style={{ marginBottom: "1.25rem" }}>
                <SuccessBanner nombre={ultimoCreado} />
              </div>
            )}

            <form onSubmit={handleCrear} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div className="form-group">
                <label className="input-label">Nombre completo</label>
                <div style={{ position: "relative" }}>
                  <User size={15} style={{
                    position: "absolute", left: "0.75rem", top: "50%",
                    transform: "translateY(-50%)", color: "var(--text-muted)", pointerEvents: "none",
                  }} />
                  <input
                    className="input-field"
                    type="text"
                    placeholder="Nombre completo"
                    value={form.nombre_completo}
                    onChange={(e) => setForm({ ...form, nombre_completo: e.target.value })}
                    style={{ paddingLeft: "2.25rem" }}
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="input-label">Usuario</label>
                <div style={{ position: "relative" }}>
                  <BadgeCheck size={15} style={{
                    position: "absolute", left: "0.75rem", top: "50%",
                    transform: "translateY(-50%)", color: "var(--text-muted)", pointerEvents: "none",
                  }} />
                  <input
                    className="input-field"
                    type="text"
                    placeholder="nombre_usuario"
                    value={form.username}
                    onChange={(e) => setForm({ ...form, username: e.target.value })}
                    style={{ paddingLeft: "2.25rem" }}
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="input-label">Contrasena</label>
                <div style={{ position: "relative" }}>
                  <KeyRound size={15} style={{
                    position: "absolute", left: "0.75rem", top: "50%",
                    transform: "translateY(-50%)", color: "var(--text-muted)", pointerEvents: "none",
                  }} />
                  <input
                    className="input-field"
                    type="password"
                    placeholder="••••••••"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    style={{ paddingLeft: "2.25rem" }}
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="input-label">Rol</label>
                <select
                  className="input-field"
                  value={form.rol}
                  onChange={(e) => setForm({ ...form, rol: e.target.value })}
                >
                  <option value="personal_salud">Personal de salud</option>
                  <option value="admin">Administrador</option>
                </select>
              </div>

              <button
                className="btn-primary"
                type="submit"
                disabled={loading}
                style={{ justifyContent: "center", marginTop: "0.25rem" }}
              >
                {loading
                  ? <><Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} /> Creando...</>
                  : <><UserPlus size={15} /> Crear usuario</>
                }
              </button>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}
