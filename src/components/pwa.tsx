"use client";
import { useEffect, useState } from "react";
export function Pwa() {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const sync = () => setOffline(!navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* Installation is optional; online app continues normally. */
      });
    }
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);
  return offline ? (
    <div role="status" className="offline-banner">
      Du bist offline. Vereinsdaten werden aus Datenschutzgründen nicht offline
      gespeichert.
    </div>
  ) : null;
}
