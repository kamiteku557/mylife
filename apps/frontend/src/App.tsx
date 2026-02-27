import { useEffect, useState } from "react";

interface Health {
  status: string;
  service: string;
  env: string;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

export function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    const loadHealth = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/v1/health`);
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const data = (await res.json()) as Health;
        setHealth(data);
      } catch (e) {
        const message = e instanceof Error ? e.message : "Unknown error";
        setError(message);
      }
    };

    void loadHealth();
  }, []);

  return (
    <main className="app">
      <h1>mylife</h1>
      <p>React + FastAPI initial setup</p>
      <section className="card">
        <h2>Backend health</h2>
        {health ? <pre>{JSON.stringify(health, null, 2)}</pre> : <p>Loading...</p>}
        {error ? <p className="error">Error: {error}</p> : null}
      </section>
    </main>
  );
}
