"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

export default function AccessPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();

    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/access-login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ password }),
      });

      if (!response.ok) {
        setError("Niepoprawne hasło dostępu.");
        return;
      }

      router.replace("/");
      router.refresh();
    } catch {
      setError("Błąd połączenia.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section style={{ minHeight: "70vh", display: "grid", placeItems: "center" }}>
      <form onSubmit={onSubmit} className="card" style={{ width: "100%", maxWidth: 420, display: "grid", gap: 10 }}>
        <input
          type="password"
          placeholder="Hasło dostępu"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          style={{
            padding: 10,
            borderRadius: 8,
            border: "1px solid #111111",
            background: "#050505",
            color: "#f3f4f6",
          }}
        />
        <button type="submit" className="btn" disabled={loading}>
          Wejdź
        </button>
        {error ? <p className="error" style={{ margin: 0 }}>{error}</p> : null}
      </form>
    </section>
  );
}
