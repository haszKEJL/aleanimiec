"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type ChatMessage = {
  id: string;
  username: string;
  text: string;
  createdAt: number;
};

type ChatState = {
  messages: ChatMessage[];
  onlineUsers: string[];
};

type ChatSidebarProps = {
  episodeId: string;
};

const USERNAME_KEY = "aleanimiec_username";

export default function ChatSidebar({ episodeId }: ChatSidebarProps) {
  const [username, setUsername] = useState("");
  const [usernameInput, setUsernameInput] = useState("");
  const [messageInput, setMessageInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);
  const [error, setError] = useState("");

  const hasUsername = useMemo(() => Boolean(username), [username]);

  useEffect(() => {
    const existing = localStorage.getItem(USERNAME_KEY)?.trim() || "";
    if (existing) {
      setUsername(existing);
      setUsernameInput(existing);
    }
  }, []);

  useEffect(() => {
    if (!episodeId || !hasUsername) {
      return;
    }

    let cancelled = false;

    const refreshState = async () => {
      try {
        const response = await fetch(
          `/api/chat?episodeId=${encodeURIComponent(episodeId)}&username=${encodeURIComponent(username)}`,
          { cache: "no-store" },
        );

        if (!response.ok) {
          setError("Nie udało się pobrać danych czatu.");
          return;
        }

        const payload = (await response.json()) as ChatState;
        if (!cancelled) {
          setMessages(payload.messages || []);
          setOnlineUsers(payload.onlineUsers || []);
          setError("");
        }
      } catch {
        if (!cancelled) {
          setError("Błąd połączenia z czatem.");
        }
      }
    };

    void refreshState();
    const interval = setInterval(() => {
      void refreshState();
    }, 5000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [episodeId, hasUsername, username]);

  const handleSaveUsername = (event: FormEvent) => {
    event.preventDefault();
    const value = usernameInput.trim().slice(0, 24);
    if (!value) {
      setError("Podaj poprawny UserName.");
      return;
    }

    localStorage.setItem(USERNAME_KEY, value);
    setUsername(value);
    setError("");
  };

  const sendMessage = async (event: FormEvent) => {
    event.preventDefault();

    const text = messageInput.trim();
    if (!text) {
      return;
    }

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          episodeId,
          username,
          message: text,
        }),
      });

      if (!response.ok) {
        setError("Nie udało się wysłać wiadomości.");
        return;
      }

      const payload = (await response.json()) as ChatState;
      setMessages(payload.messages || []);
      setOnlineUsers(payload.onlineUsers || []);
      setMessageInput("");
      setError("");
    } catch {
      setError("Błąd połączenia podczas wysyłania.");
    }
  };

  return (
    <aside className="card" style={{ display: "grid", gap: 12, minHeight: 500 }}>
      <h2 style={{ margin: 0 }}>Czat</h2>

      {!hasUsername ? (
        <form onSubmit={handleSaveUsername} style={{ display: "grid", gap: 8 }}>
          <label htmlFor="username" className="muted">
            Podaj UserName, żeby dołączyć
          </label>
          <input
            id="username"
            value={usernameInput}
            onChange={(event) => setUsernameInput(event.target.value)}
            placeholder="np. Maciek"
            maxLength={24}
            style={{
              padding: 10,
              borderRadius: 8,
              border: "1px solid #202b4b",
              background: "#0f162d",
              color: "#f3f4f6",
            }}
          />
          <button type="submit" className="btn">
            Zapisz UserName
          </button>
        </form>
      ) : (
        <p className="muted" style={{ margin: 0 }}>
          Zalogowany jako: <strong>{username}</strong>
        </p>
      )}

      <section className="card" style={{ padding: 10 }}>
        <h3 style={{ marginTop: 0 }}>Online ({onlineUsers.length})</h3>
        {onlineUsers.length ? (
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {onlineUsers.map((onlineUser) => (
              <li key={onlineUser}>{onlineUser}</li>
            ))}
          </ul>
        ) : (
          <p className="muted" style={{ margin: 0 }}>
            Nikt nie jest online.
          </p>
        )}
      </section>

      <section className="card" style={{ padding: 10, display: "grid", gap: 8 }}>
        <h3 style={{ margin: 0 }}>Wiadomości</h3>
        <div style={{ maxHeight: 250, overflow: "auto", display: "grid", gap: 6 }}>
          {messages.length ? (
            messages.map((message) => (
              <div key={message.id} style={{ background: "#0f162d", borderRadius: 8, padding: 8 }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{message.username}</div>
                <div style={{ fontSize: 14 }}>{message.text}</div>
              </div>
            ))
          ) : (
            <p className="muted" style={{ margin: 0 }}>
              Brak wiadomości.
            </p>
          )}
        </div>

        <form onSubmit={sendMessage} style={{ display: "grid", gap: 8 }}>
          <input
            value={messageInput}
            onChange={(event) => setMessageInput(event.target.value)}
            placeholder="Napisz wiadomość..."
            maxLength={400}
            disabled={!hasUsername}
            style={{
              padding: 10,
              borderRadius: 8,
              border: "1px solid #202b4b",
              background: "#0f162d",
              color: "#f3f4f6",
            }}
          />
          <button type="submit" className="btn" disabled={!hasUsername}>
            Wyślij
          </button>
        </form>
      </section>

      {error ? <p className="error" style={{ margin: 0 }}>{error}</p> : null}
    </aside>
  );
}
