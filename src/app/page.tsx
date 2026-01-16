import Link from "next/link";

export default function HomePage() {
  return (
    <main style={{ maxWidth: 760, margin: "80px auto", padding: 24 }}>
      <h1 style={{ fontSize: 34, marginBottom: 10 }}>The Aura Algo is coming soon</h1>
      <p style={{ opacity: 0.8, marginBottom: 28 }}>
        This will become the public Aura homepage later.
      </p>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Link href="/sign-in" style={btnStyleOutline}>
          Sign in
        </Link>
        <Link href="/sign-up" style={btnStyleOutline}>
          Sign up
        </Link>
        <Link href="/app" style={btnStyleSolid}>
          Go to Dashboard
        </Link>
      </div>
    </main>
  );
}

const btnStyleOutline: React.CSSProperties = {
  padding: "12px 16px",
  borderRadius: 10,
  border: "1px solid #111",
  textDecoration: "none",
  color: "#111",
};

const btnStyleSolid: React.CSSProperties = {
  padding: "12px 16px",
  borderRadius: 10,
  border: "1px solid #111",
  background: "#111",
  color: "white",
  textDecoration: "none",
};
