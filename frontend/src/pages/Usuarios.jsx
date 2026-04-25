import { useEffect, useState } from "react";
import api from "../api/axios";
import { useGlobalToast } from "../components/Layout";

const INIT = { nombre_completo: "", username: "", password: "", rol: "personal_salud" };

export default function Usuarios() {
  const [usuarios, setUsuarios] = useState([]);
  const [form, setForm] = useState(INIT);
  const [loading, setLoading] = useState(false);
  const toast = useGlobalToast();

  const cargar = () => api.get("/usuarios").then(({ data }) => setUsuarios(data));
  useEffect(() => { cargar(); }, []);

  const handleCrear = async (e) => {
    e.preventDefault(); setLoading(true);
    try {
      await api.post("/usuarios", form);
      toast("Usuario creado exitosamente", "success");
      setForm(INIT); cargar();
    } catch (err) { toast(err.response?.data?.error || "Error", "error"); }
    finally { setLoading(false); }
  };

  const toggleActivo = async (u) => {
    await api.put(`/usuarios/${u.id}`, { ...u, activo: !u.activo });
    cargar();
  };

  return (
    <div>
      <h1 style={{ fontSize: "1.6rem", fontWeight: 800, marginBottom: "1.75rem" }}>GestiÃ³n de Usuarios</h1>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: "1.5rem", alignItems: "start" }}>
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table className="tabla">
            <thead><tr><th>Nombre</th><th>Usuario</th><th>Rol</th><th>Estado</th><th></th></tr></thead>
            <tbody>
              {usuarios.map((u) => (
                <tr key={u.id}>
                  <td style={{ fontWeight: 500 }}>{u.nombre_completo}</td>
                  <td style={{ color: "var(--text-muted)" }}>{u.username}</td>
                  <td><span className={`badge ${u.rol === "admin" ? "badge-blue" : "badge-green"}`}>{u.rol}</span></td>
                  <td>{u.activo ? <span className="badge badge-green">Activo</span> : <span className="badge badge-red">Inactivo</span>}</td>
                  <td>
                    <button className="btn-secondary" style={{ padding: "0.3rem 0.7rem", fontSize: "0.8rem" }} onClick={() => toggleActivo(u)}>
                      {u.activo ? "Desactivar" : "Activar"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <h3 style={{ fontFamily: "Syne", marginBottom: "1.25rem", fontSize: "1rem" }}>Nuevo usuario</h3>
          <form onSubmit={handleCrear} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {[["Nombre completo","nombre_completo","text"],["Usuario","username","text"],["ContraseÃ±a","password","password"]].map(([l,k,t]) => (
              <div className="form-group" key={k}>
                <label className="input-label">{l}</label>
                <input className="input-field" type={t} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} required />
              </div>
            ))}
            <div className="form-group">
              <label className="input-label">Rol</label>
              <select className="input-field" value={form.rol} onChange={(e) => setForm({ ...form, rol: e.target.value })}>
                <option value="personal_salud">Personal de salud</option>
                <option value="admin">Administrador</option>
              </select>
            </div>
            <button className="btn-primary" type="submit" disabled={loading} style={{ justifyContent: "center" }}>
              {loading ? "Creando..." : "Crear usuario"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
