/** The page layout loading state — a minimal branded skeleton. */
export default function RootLoading() {
  return (
    <main id="main" style={{ minHeight: '100dvh' }}>
      <section
        className="container"
        style={{
          paddingBlock: 'calc(var(--nav-h) + 120px) 0',
          display: 'grid',
          gap: 48,
        }}
      >
        <div style={{ display: 'grid', gap: 16 }}>
          <div
            className="skeleton"
            style={{ width: 'clamp(180px, 22%, 320px)', height: 14 }}
          />
          <div
            className="skeleton"
            style={{ width: 'clamp(260px, 48%, 600px)', height: 54 }}
          />
          <div
            className="skeleton"
            style={{ width: 'clamp(200px, 34%, 440px)', height: 24, marginTop: 8 }}
          />
        </div>
        <div
          className="skeleton"
          style={{ width: '100%', maxWidth: 1600, height: 'clamp(240px, 40vw, 520px)' }}
        />
      </section>
      <style>{`.skeleton{background:var(--line);border-radius:2px;animation:almasi-pulse 1.8s ease-in-out infinite}@keyframes almasi-pulse{0%,100%{opacity:0.08}50%{opacity:0.24}}`}</style>
    </main>
  );
}