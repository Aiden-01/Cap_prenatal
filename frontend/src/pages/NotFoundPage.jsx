import { ArrowLeft, HeartPulse, Home } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import doctorIllustration from "../assets/not-found-doctor.png";
import "./not-found-page.css";

const DASHBOARD_PATH = "/dashboard";

export default function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <main className="not-found-page">
      <div className="not-found-glow not-found-glow-one" aria-hidden="true" />
      <div className="not-found-glow not-found-glow-two" aria-hidden="true" />

      <header className="not-found-header">
        <div className="not-found-brand" aria-label="CAP Prenatal">
          <span className="not-found-brand-mark" aria-hidden="true">
            <HeartPulse size={30} strokeWidth={1.8} />
          </span>
          <span>
            <strong>CAP Prenatal</strong>
            <small>Cuidamos hoy el mañana</small>
          </span>
        </div>

        <p className="not-found-slogan">
          Salud materna,<br />futuros más fuertes.
        </p>
      </header>

      <section className="not-found-content" aria-labelledby="not-found-title">
        <div className="not-found-visual" aria-hidden="true">
          <div className="not-found-orbit not-found-orbit-large" />
          <div className="not-found-orbit not-found-orbit-small">?</div>
          <span className="not-found-spark">✦</span>
          <img src={doctorIllustration} alt="" />
        </div>

        <div className="not-found-copy">
          <span className="not-found-badge">ERROR 404</span>
          <h1 id="not-found-title">
            Esta sección
            <span>no está disponible.</span>
          </h1>
          <p>
            Verifica la dirección o vuelve al inicio para continuar navegando de forma
            segura dentro del sistema.
          </p>

          <nav className="not-found-actions" aria-label="Opciones de navegación">
            <Link className="not-found-action not-found-action-primary" to={DASHBOARD_PATH}>
              <Home size={21} aria-hidden="true" />
              Inicio
            </Link>
            <button
              className="not-found-action not-found-action-secondary"
              type="button"
              onClick={() => navigate(-1)}
            >
              <ArrowLeft size={22} aria-hidden="true" />
              Regresar
            </button>
          </nav>
        </div>
      </section>

      <footer className="not-found-footer">
        <div><span aria-hidden="true" />Sistema CAP Prenatal<span aria-hidden="true" /></div>
        <p><HeartPulse size={16} aria-hidden="true" />Por una mejor etapa, juntos.</p>
      </footer>
    </main>
  );
}
