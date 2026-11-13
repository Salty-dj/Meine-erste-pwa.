export default function Loading() {
  return (
    <div className="loading-state" role="status">
      <div className="skeleton skeleton-title" />
      <p>Vereinsdaten werden geladen …</p>
      <div className="stat-grid">
        {[1, 2, 3, 4].map((n) => (
          <div key={n} className="skeleton skeleton-card" />
        ))}
      </div>
    </div>
  );
}
