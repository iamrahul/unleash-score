export default function Page() {
  return (
    <main
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--green)",
      }}
    >
      <h1
        style={{
          fontFamily: '"Archivo Black", sans-serif',
          fontSize: "clamp(28px, 6vw, 96px)",
          color: "var(--ink)",
          textTransform: "uppercase",
          letterSpacing: "0.01em",
        }}
      >
        Unleash Score
      </h1>
    </main>
  );
}
