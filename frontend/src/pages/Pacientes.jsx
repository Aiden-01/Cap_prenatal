import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, UserPlus } from "lucide-react";
import api from "../api/axios";

const LIMITE = 20;

export default function Pacientes() {
  const [pacientes, setPacientes] = useState([]);
  const [total, setTotal]         = useState(0);
  const [buscar, setBuscar]       = useState("");
  const [pagina, setPagina]       = useState(1);
  const [loading, setLoading]     = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelado = false;

    api.get("/pacientes", { params: { buscar, pagina, limite: LIMITE } })
      .then(({ data }) => {
        if (!cancelado) {
          setPacientes(data.data);
          setTotal(data.total);
        }
      })
      .catch(console.error)
      .finally(() => {
        if (!cancelado) setLoading(false);
      });

    return () => { cancelado = true; };
  }, [buscar, pagina]);

  const totalPaginas = Math.ceil(total / LIMITE);

  return (
    <div>
      {/* HEADER */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.75rem", flexWrap: "wrap", gap: "0.75rem" }}>
        <div>
          <h1 style={{ fontSize: "1.6rem", fontWeight: 800, color: "var(--text)" }}>Pacientes</h1>
          <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginTop: 3 }}>
            {total} paciente{total !== 1 ? "s" : ""} registrada{total !== 1 ? "s" : ""}
          </p>
        </div>
        <button className="btn-primary" onClick={() => navigate("/nuevo")}
          style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
          <UserPlus size={15} /> Nueva paciente
        </button>
      </div>

      {/* BÚSQUEDA */}
      <div className="card" style={{ marginBottom: "1.25rem", display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <Search size={16} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
        <input
          className="input-field"
          placeholder="Buscar por nombre, apellido, No. expediente o CUI..."
          value={buscar}
          onChange={(e) => { setBuscar(e.target.value); setPagina(1); }}
          style={{ maxWidth: 420, margin: 0 }}
        />
      </div>

      {/* TABLA */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: "2.5rem", textAlign: "center", color: "var(--text-muted)" }}>Cargando...</div>
        ) : pacientes.length === 0 ? (
          <div style={{ padding: "2.5rem", textAlign: "center", color: "var(--text-muted)" }}>
            No se encontraron pacientes.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="tabla">
              <thead>
                <tr>
                  <th>No. Expediente</th>
                  <th>Nombres</th>
                  <th>Apellidos</th>
                  <th>Municipio</th>
                  <th>FUR</th>
                  <th>FPP (est.)</th>
                  <th>Registrada</th>
                </tr>
              </thead>
              <tbody>
                {pacientes.map((p) => {
                  const fpp = p.fur
                    ? new Date(new Date(p.fur).getTime() + 280 * 86400000)
                    : null;
                  return (
                    <tr key={p.id} style={{ cursor: "pointer" }}
                      onClick={() => navigate(`/pacientes/${p.id}`)}>
                      <td>
                        <span className="badge badge-blue">{p.no_expediente}</span>
                      </td>
                      <td style={{ fontWeight: 600 }}>{p.nombres}</td>
                      <td>{p.apellidos}</td>
                      <td style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>{p.municipio || "—"}</td>
                      <td style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
                        {p.fur ? new Date(p.fur).toLocaleDateString("es-GT") : "—"}
                      </td>
                      <td style={{ color: "var(--accent)", fontWeight: 500, fontSize: "0.85rem" }}>
                        {fpp ? fpp.toLocaleDateString("es-GT") : "—"}
                      </td>
                      <td style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>
                        {new Date(p.created_at).toLocaleDateString("es-GT")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* PAGINACIÓN */}
        {totalPaginas > 1 && (
          <div style={{ padding: "1rem", display: "flex", gap: "0.5rem", justifyContent: "flex-end", borderTop: "1px solid var(--border)", alignItems: "center" }}>
            <button className="btn-secondary" onClick={() => setPagina((p) => Math.max(1, p - 1))} disabled={pagina === 1}>
              ← Anterior
            </button>
            <span style={{ padding: "0.5rem 0.75rem", fontSize: "0.83rem", color: "var(--text-muted)" }}>
              {pagina} / {totalPaginas}
            </span>
            <button className="btn-secondary" onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))} disabled={pagina === totalPaginas}>
              Siguiente →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
