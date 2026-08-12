import React, { useState, useEffect, useCallback } from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import Login from "./Login.jsx";

import {
  auth,
  onAuthStateChanged,
  signOut,
  getCurrentUser,
} from "./firebase";

import "./styles.css";

// ============================================================
// BACKEND API
// ============================================================
//
// IMPORTANT:
// VITE_API_URL should contain ONLY the backend base URL.
//
// Local:
// VITE_API_URL=http://localhost:8000
//
// Cloudflare tunnel:
// VITE_API_URL=https://gamecube-liberty-port-teddy.trycloudflare.com
//
// The /api part is added automatically below.
//
// api("/users")
//      -> http://localhost:8000/api/users
//
// OR
//
// api("/users")
//      -> https://gamecube-liberty-port-teddy.trycloudflare.com/api/users
//
// ============================================================

const API_URL = (
  import.meta.env.VITE_API_URL || "http://localhost:8000"
).replace(/\/+$/, "");

// ============================================================
// BACKEND API HELPER
// ============================================================

async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});

  if (
    options.body &&
    !(options.body instanceof FormData) &&
    !headers.has("Content-Type")
  ) {
    headers.set("Content-Type", "application/json");
  }

  // Make sure path starts with /
  const normalizedPath = path.startsWith("/")
    ? path
    : `/${path}`;

  // /api is added HERE.
  const url = `${API_URL}/api${normalizedPath}`;

  console.log(
    `🌐 API Request: ${options.method || "GET"} ${url}`
  );

  let response;

  try {
    response = await fetch(url, {
      ...options,
      headers,
    });
  } catch (networkError) {
    console.error(
      "❌ Network error:",
      networkError
    );

    throw new Error(
      `Unable to connect to backend: ${url}`
    );
  }

  if (!response.ok) {
    let error = {
      detail: `Request failed with status ${response.status}`,
    };

    try {
      error = await response.json();
    } catch {
      // Response wasn't JSON.
    }

    throw new Error(
      error.detail ||
        `Request failed with status ${response.status}`
    );
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

// ============================================================
// ACTIVE WORKSPACE STORAGE
// ============================================================

const ACTIVE_WORKSPACE_KEY =
  "taskflow_active_workspace_id";

function getActiveWorkspaceId() {
  const stored = localStorage.getItem(
    ACTIVE_WORKSPACE_KEY
  );

  if (!stored) {
    return null;
  }

  const id = Number(stored);

  return Number.isNaN(id) ? null : id;
}

function saveActiveWorkspaceId(workspaceId) {
  if (
    workspaceId === null ||
    workspaceId === undefined
  ) {
    localStorage.removeItem(
      ACTIVE_WORKSPACE_KEY
    );

    return;
  }

  localStorage.setItem(
    ACTIVE_WORKSPACE_KEY,
    String(workspaceId)
  );
}

// ============================================================
// MAIN
// ============================================================

function Main() {
  const [user, setUser] = useState(null);

  const [loading, setLoading] = useState(true);

  const [authError, setAuthError] = useState(null);

  // ----------------------------------------------------------
  // WORKSPACES
  // ----------------------------------------------------------

  const [
    activeWorkspaceId,
    setActiveWorkspaceId,
  ] = useState(
    getActiveWorkspaceId()
  );

  // ==========================================================
  // WORKSPACE SELECTOR
  // ==========================================================

  const handleWorkspaceChange = useCallback(
    (workspaceId) => {
      const id =
        workspaceId === null ||
        workspaceId === undefined ||
        workspaceId === ""
          ? null
          : Number(workspaceId);

      if (
        id !== null &&
        Number.isNaN(id)
      ) {
        console.error(
          "Invalid workspace ID:",
          workspaceId
        );

        return;
      }

      setActiveWorkspaceId(id);

      saveActiveWorkspaceId(id);

      console.log(
        "🏢 Active workspace changed:",
        id
      );
    },
    []
  );

  // ==========================================================
  // LOAD WORKSPACES
  // ==========================================================

  const loadWorkspaces = useCallback(
    async () => {
      try {
        console.log(
          "🏢 Loading workspaces..."
        );

        const workspaces =
          await api("/workspaces");

        console.log(
          "🏢 Workspaces:",
          workspaces
        );

        if (
          !Array.isArray(workspaces) ||
          workspaces.length === 0
        ) {
          console.warn(
            "⚠️ No workspaces found."
          );

          setActiveWorkspaceId(null);
          saveActiveWorkspaceId(null);

          return [];
        }

        // ------------------------------------------------------
        // Try to restore previously selected workspace
        // ------------------------------------------------------

        const savedId =
          getActiveWorkspaceId();

        const savedWorkspace =
          workspaces.find(
            (workspace) =>
              Number(workspace.id) ===
              Number(savedId)
          );

        if (savedWorkspace) {
          setActiveWorkspaceId(
            savedWorkspace.id
          );

          saveActiveWorkspaceId(
            savedWorkspace.id
          );

          console.log(
            "🏢 Restored workspace:",
            savedWorkspace
          );

          return workspaces;
        }

        // ------------------------------------------------------
        // No valid saved workspace.
        // Select first workspace.
        // ------------------------------------------------------

        const firstWorkspace =
          workspaces[0];

        setActiveWorkspaceId(
          firstWorkspace.id
        );

        saveActiveWorkspaceId(
          firstWorkspace.id
        );

        console.log(
          "🏢 Selected default workspace:",
          firstWorkspace
        );

        return workspaces;
      } catch (error) {
        console.error(
          "❌ Failed to load workspaces:",
          error
        );

        throw error;
      }
    },
    []
  );

  // ==========================================================
  // FIREBASE AUTH LISTENER
  // ==========================================================

  useEffect(() => {
    const unsubscribe =
      onAuthStateChanged(
        auth,
        async (firebaseUser) => {
          try {
            if (firebaseUser) {
              console.log(
                "✅ Logged in:",
                firebaseUser.email
              );

              // ------------------------------------------------
              // STEP 1:
              // Load workspaces first.
              // ------------------------------------------------

              let workspaces = [];

              try {
                workspaces =
                  await loadWorkspaces();
              } catch (workspaceError) {
                console.error(
                  "❌ Workspace loading failed:",
                  workspaceError
                );
              }

              // ------------------------------------------------
              // STEP 2:
              // Determine active workspace.
              // ------------------------------------------------

              let workspaceId =
                getActiveWorkspaceId();

              if (
                !workspaceId &&
                Array.isArray(workspaces) &&
                workspaces.length > 0
              ) {
                workspaceId =
                  workspaces[0].id;

                setActiveWorkspaceId(
                  workspaceId
                );

                saveActiveWorkspaceId(
                  workspaceId
                );
              }

              console.log(
                "🏢 Workspace used for Firebase sync:",
                workspaceId
              );

              // ------------------------------------------------
              // STEP 3:
              // Sync Firebase user with backend.
              // ------------------------------------------------

              try {
                const syncedUser =
                  await api(
                    "/users/sync-firebase",
                    {
                      method: "POST",

                      body: JSON.stringify({
                        email:
                          firebaseUser.email,

                        name:
                          firebaseUser.displayName ||
                          firebaseUser.email?.split(
                            "@"
                          )[0] ||
                          "User",

                        workspace_id:
                          workspaceId,
                      }),
                    }
                  );

                console.log(
                  "✅ Firebase user synced:",
                  syncedUser
                );
              } catch (syncError) {
                console.error(
                  "❌ Backend sync failed:",
                  syncError
                );

                // Do not logout Firebase user
                // just because backend sync failed.
              }

              // ------------------------------------------------
              // STEP 4:
              // Set Firebase user.
              // ------------------------------------------------

              setUser(firebaseUser);

              setAuthError(null);
            } else {
              console.log(
                "👋 User logged out"
              );

              setUser(null);

              // Keep workspace selection.
              // It will be restored after login.
            }
          } catch (error) {
            console.error(
              "❌ Authentication error:",
              error
            );

            setAuthError(
              "Authentication error. Please login again."
            );

            setUser(null);
          } finally {
            setLoading(false);
          }
        }
      );

    return () => {
      unsubscribe();
    };
  }, [loadWorkspaces]);

  // ==========================================================
  // LOGIN CALLBACK
  // ==========================================================

  const handleLogin = (firebaseUser) => {
    console.log(
      "✅ Login successful:",
      firebaseUser?.email
    );

    setUser(firebaseUser);

    setAuthError(null);
  };

  // ==========================================================
  // LOGOUT
  // ==========================================================

  const handleLogout = async () => {
    try {
      setLoading(true);

      await signOut(auth);

      setUser(null);

      setAuthError(null);

      console.log(
        "✅ Logout successful"
      );
    } catch (error) {
      console.error(
        "❌ Logout error:",
        error
      );

      setAuthError(
        "Unable to logout. Try again."
      );
    } finally {
      setLoading(false);
    }
  };

  // ==========================================================
  // REFRESH FIREBASE TOKEN
  // ==========================================================

  const refreshToken = async () => {
    try {
      const currentUser =
        getCurrentUser();

      if (currentUser) {
        await currentUser.getIdToken(
          true
        );

        console.log(
          "🔄 Firebase token refreshed"
        );
      }
    } catch (error) {
      console.error(
        "❌ Token refresh failed:",
        error
      );
    }
  };

  // ==========================================================
  // AUTO REFRESH FIREBASE TOKEN
  // ==========================================================

  useEffect(() => {
    if (!user) {
      return;
    }

    const interval =
      setInterval(
        refreshToken,
        50 * 60 * 1000
      );

    return () => {
      clearInterval(interval);
    };
  }, [user]);

  // ==========================================================
  // CHECK TAB VISIBILITY
  // ==========================================================

  useEffect(() => {
    const handler = () => {
      if (
        document.visibilityState !==
        "visible"
      ) {
        return;
      }

      const currentUser =
        getCurrentUser();

      // Firebase session disappeared
      if (
        !currentUser &&
        user
      ) {
        setUser(null);

        setAuthError(
          "Session expired. Please login again."
        );

        return;
      }

      // Firebase session still exists
      if (
        currentUser &&
        user
      ) {
        refreshToken();
      }
    };

    document.addEventListener(
      "visibilitychange",
      handler
    );

    return () => {
      document.removeEventListener(
        "visibilitychange",
        handler
      );
    };
  }, [user]);

  // ==========================================================
  // LOADING SCREEN
  // ==========================================================

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner">
          <div className="spinner"></div>

          <p>
            Loading TaskFlow...
          </p>
        </div>
      </div>
    );
  }

  // ==========================================================
  // AUTH ERROR
  // ==========================================================

  if (authError) {
    return (
      <div className="loading-container">
        <div className="error-card glass-card">
          <h2>
            Authentication Error
          </h2>

          <p>
            {authError}
          </p>

          <button
            className="primary-btn login-btn"
            onClick={() => {
              setAuthError(null);

              window.location.reload();
            }}
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // ==========================================================
  // NOT LOGGED IN
  // ==========================================================

  if (!user) {
    return (
      <Login
        onLogin={handleLogin}
      />
    );
  }

  // ==========================================================
  // LOGGED IN
  // ==========================================================

  return (
    <App
      user={user}
      onLogout={handleLogout}
      activeWorkspaceId={
        activeWorkspaceId
      }
      onWorkspaceChange={
        handleWorkspaceChange
      }
      api={api}
    />
  );
}

// ============================================================
// REACT ROOT
// ============================================================

ReactDOM
  .createRoot(
    document.getElementById("root")
  )
  .render(
    <React.StrictMode>
      <Main />
    </React.StrictMode>
  );