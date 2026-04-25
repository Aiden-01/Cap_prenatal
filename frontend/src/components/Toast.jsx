export default function Toast({ toasts }) {
  const icons = { success: "✓", error: "✕", info: "i" };
  return (
    <div className="toast-container">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.type}`}>
          <span style={{ fontWeight: 700, fontSize: "1rem" }}>{icons[t.type] ?? "i"}</span>
          {t.message}
        </div>
      ))}
    </div>
  );
}
