"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    setLoading(false);
    if (res.ok) {
      router.push("/");
      router.refresh();
    } else {
      const data = await res.json();
      setError(data.error || "Eroare la autentificare.");
    }
  }

  return (
    <div style={styles.wrap} className="login-wrap">
      <form onSubmit={handleSubmit} style={styles.card} className="login-card">
        <h1 style={styles.title}>🧸 Planificare Grădiniță</h1>
        <p style={styles.subtitle}>Autentifică-te pentru a continua</p>

        <label style={styles.label}>Utilizator</label>
        <input
          style={styles.input}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="nume utilizator"
          autoFocus
        />

        <label style={styles.label}>Parolă</label>
        <input
          style={styles.input}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="parolă"
        />

        {error && <div style={styles.error}>{error}</div>}

        <button style={styles.button} type="submit" disabled={loading}>
          {loading ? "Se verifică..." : "Intră în cont"}
        </button>
      </form>
    </div>
  );
}

const styles: { [k: string]: React.CSSProperties } = {
  wrap: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "linear-gradient(135deg,#FDE68A,#A7F3D0)",
    fontFamily: "system-ui, sans-serif",
  },
  card: {
    background: "white",
    padding: "2.5rem",
    borderRadius: "16px",
    boxShadow: "0 10px 30px rgba(0,0,0,0.1)",
    width: "320px",
  },
  title: { margin: 0, fontSize: "1.4rem", textAlign: "center" },
  subtitle: {
    textAlign: "center",
    color: "#666",
    marginTop: "0.3rem",
    marginBottom: "1.5rem",
    fontSize: "0.9rem",
  },
  label: { fontSize: "0.85rem", fontWeight: 600, color: "#444" },
  input: {
    width: "100%",
    padding: "0.6rem 0.8rem",
    margin: "0.3rem 0 1rem 0",
    borderRadius: "8px",
    border: "1px solid #ddd",
    boxSizing: "border-box",
    fontSize: "1rem",
  },
  button: {
    width: "100%",
    padding: "0.7rem",
    borderRadius: "8px",
    border: "none",
    background: "#F59E0B",
    color: "white",
    fontWeight: 700,
    fontSize: "1rem",
    cursor: "pointer",
    marginTop: "0.5rem",
  },
  error: { color: "#DC2626", fontSize: "0.85rem", marginBottom: "0.5rem" },
};
