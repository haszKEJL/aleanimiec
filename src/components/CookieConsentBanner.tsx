"use client";

import { useEffect, useState } from "react";

type ConsentValue = "accept_all" | "decline_all" | "custom";

type CookiePreferences = {
  analytics: boolean;
};

const STORAGE_KEY = "aniguess_cookie_consent";
const COOKIE_NAME = "aniguess_cookie_consent";

function saveConsent(value: ConsentValue, preferences: CookiePreferences) {
  const payload = {
    value,
    preferences,
    updatedAt: Date.now(),
  };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // ignore storage errors
  }

  const maxAge = 60 * 60 * 24 * 180;
  document.cookie = `${COOKIE_NAME}=${encodeURIComponent(JSON.stringify(payload))}; path=/; max-age=${maxAge}; samesite=lax`;
}

export default function CookieConsentBanner() {
  const [visible, setVisible] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [analyticsEnabled, setAnalyticsEnabled] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        setVisible(true);
        return;
      }

      const parsed = JSON.parse(raw) as { preferences?: CookiePreferences };
      setAnalyticsEnabled(Boolean(parsed.preferences?.analytics));
      setVisible(false);
    } catch {
      setVisible(true);
    }
  }, []);

  if (!visible) {
    return null;
  }

  return (
    <aside className="cookie-banner" role="dialog" aria-live="polite" aria-label="Informacja o cookies">
      <p className="cookie-banner__text">
        Używamy cookies, aby zapewnić płynne działanie strony i zbierać anonimowe statystyki.
      </p>

      {manageOpen ? (
        <div className="cookie-banner__manage">
          <label className="cookie-banner__toggle">
            <input type="checkbox" checked={analyticsEnabled} onChange={(event) => setAnalyticsEnabled(event.target.checked)} />
            <span>Analityczne cookies</span>
          </label>
          <p className="cookie-banner__hint">Niezbędne cookies są zawsze aktywne.</p>
        </div>
      ) : null}

      <div className="cookie-banner__actions">
        <button type="button" className="cookie-btn cookie-btn--ghost" onClick={() => setManageOpen((open) => !open)}>
          Manage
        </button>
        <button
          type="button"
          className="cookie-btn cookie-btn--ghost"
          onClick={() => {
            saveConsent("decline_all", { analytics: false });
            setVisible(false);
          }}
        >
          Decline all
        </button>
        <button
          type="button"
          className="cookie-btn cookie-btn--primary"
          onClick={() => {
            const nextAnalytics = manageOpen ? analyticsEnabled : true;
            saveConsent(nextAnalytics ? "accept_all" : "custom", { analytics: nextAnalytics });
            setVisible(false);
          }}
        >
          Accept all
        </button>
      </div>
    </aside>
  );
}
