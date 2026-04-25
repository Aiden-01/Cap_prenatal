import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/axios";

export default function Pacientes() {
  const [pacientes, setPacientes] = useState([]);
  const [total, setTotal] = useState(0);
  const [buscar, setBuscar] = useState("");
  const [pagina, setPagina] = useState(1);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const LIMITE = 20;

  const cargar = () => {
    setLoading(true);
    api.get("/pacientes", { params: { buscar, pagina, limite: LIMITE } })
      .then(({ data }) => { setPacientes(data.data); setTotal(data.total); })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { cargar(); }, [buscar, pagina]);

  const totalPaginas = Math.ceil(total / LIMITE);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.75rem" }}>
        <div>
          <h1 style={{ fontSize: "1.6rem", fontWeight: 800 }}>Pacientes</h1>
          <p style={{ color: "var(--text-muted)", fontSize: "0.88rem", marginTop: 3 }}>{total} paciente(s) registradas</p>
        </div>
        <button className="btn-primary" onClick={() => navigate("/nuevo")}>+ Nueva paciente</button>
      </div>

      <div className="card" style={{ marginBottom: "1.25rem" }}>
        <input
          className="input-field"
          placeholder="Buscar por nombre o No. de historia clinica..."
          value={buscar}
          onChange={(e) => { setBuscar(e.target.value); setPagina(1); }}
          style={{ maxWidth: 400 }}
        />
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)" }}>Cargando...</div>
        ) : pacientes.length === 0 ? (
          <div style={{ padding: "2.5rem", textAlign: "center", color: "var(--text-muted)" }}>
            No se encontraron pacientes
          </div>
        ) : (
          <table className="tabla">
            <thead>
              <tr>
                <th>No. Historia</th>
                <th>Nombre</th>
                <th>Edad</th>
                <th>FUR</th>
                <th>FPP (est.)</th>
                <th>Registrada</th>
              </tr>
            </thead>
            <tbody>
              {pacientes.map((p) => {
                const fpp = p.fur ? new Date(new Date(p.fur).getTime() + 280 * 86400000) : null;
                return (
                  <tr key={p.id} onClick={() => navigate(`/pacientes/${p.id}`)}>
                    <td><span className="badge badge-blue">{p.no_historia_clinica}</span></td>
                    <td style={{ fontWeight: 500 }}>{p.nombre}</td>
                    <td>{p.edad ?? "—"}</td>
                    <td>{p.fur ? new Date(p.fur).toLocaleDateString("es-GT") : "—"}</td>
                    <td>{fpp ? fpp.toLocaleDateString("es-GT") : "—"}</td>
                    <td style={{ color: "var(--text-muted)", fontSize: "0.82rem" }}>
                      {new Date(p.created_at).toLocaleDateString("es-GT")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {totalPaginas > 1 && (
          <div style={{ padding: "1rem", display: "flex", gap: "0.5rem", justifyContent: "flex-end", borderTop: "1px solid var(--border)" }}>
            <button className="btn-secondary" onClick={() => setPagina((p) => Math.max(1, p - 1))} disabled={pagina === 1}>← Anterior</button>
            <span style={{ padding: "0.6rem 1rem", fontSize: "0.85rem", color: "var(--text-muted)" }}>{pagina} / {totalPaginas}</span>
            <button className="btn-secondary" onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))} disabled={pagina === totalPaginas}>Siguiente →</button>
          </div>
        )}
      </div>
    </div>
  );
}
