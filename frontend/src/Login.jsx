import React, { useState } from "react";
import {
  loginUser,
  registerUser,
  resetPassword,
  updateUserProfile,
} from "./firebase";

// ============================================================
// API CONFIGURATION
// ============================================================
//
// Local:
// VITE_API_URL is not required.
// It will use:
// http://localhost:8000/api
//
// Cloudflare / production:
// Set VITE_API_URL in .env.production:
//
// VITE_API_URL=https://YOUR-TUNNEL.trycloudflare.com/api
//
// IMPORTANT:
// VITE_API_URL already contains /api.
// ============================================================

const API_URL =
  import.meta.env.VITE_API_URL ||
  "http://localhost:8000/api";

console.log("🌐 Login API URL:", API_URL);

// ============================================================
// BACKEND API HELPER
// ============================================================

async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});

  // Automatically send JSON when body is JSON
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

  const url = `${API_URL}${normalizedPath}`;

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
      `Unable to connect to backend at ${API_URL}`
    );
  }

  // ----------------------------------------------------------
  // Handle HTTP errors
  // ----------------------------------------------------------

  if (!response.ok) {
    let errorMessage = `Request failed with status ${response.status}`;

    try {
      const errorData = await response.json();

      errorMessage =
        errorData.detail ||
        errorData.message ||
        errorMessage;
    } catch {
      // Backend did not return JSON
    }

    console.error(
      "❌ API error:",
      response.status,
      errorMessage
    );

    throw new Error(errorMessage);
  }

  // ----------------------------------------------------------
  // 204 No Content
  // ----------------------------------------------------------

  if (response.status === 204) {
    return null;
  }

  // ----------------------------------------------------------
  // Return JSON
  // ----------------------------------------------------------

  return response.json();
}

// ============================================================
// FIREBASE USER -> BACKEND SYNC
// ============================================================
//
// This function creates/updates the Firebase user in your
// FastAPI database.
//
// Endpoint:
// POST /api/users/sync-firebase
//
// ============================================================

async function syncUserWithBackend(
  firebaseUser,
  displayName
) {
  if (!firebaseUser) {
    throw new Error(
      "Firebase user is missing."
    );
  }

  if (!firebaseUser.email) {
    throw new Error(
      "Firebase user does not have an email."
    );
  }

  const name =
    displayName?.trim() ||
    firebaseUser.displayName?.trim() ||
    firebaseUser.email.split("@")[0] ||
    "User";

  console.log(
    "🔄 Syncing Firebase user with backend:",
    firebaseUser.email
  );

  try {
    const syncedUser = await api(
      "/users/sync-firebase",
      {
        method: "POST",

        body: JSON.stringify({
          email: firebaseUser.email,
          name: name,
        }),
      }
    );

    console.log(
      "✅ Firebase user synced:",
      syncedUser
    );

    return syncedUser;
  } catch (error) {
    console.error(
      "❌ Firebase backend sync failed:",
      error
    );

    throw error;
  }
}

// ============================================================
// LOGIN COMPONENT
// ============================================================

function Login({ onLogin }) {
  const [isLogin, setIsLogin] = useState(true);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [showResetPassword, setShowResetPassword] =
    useState(false);

  const [resetEmail, setResetEmail] = useState("");
  const [resetMessage, setResetMessage] = useState("");

  // ==========================================================
  // RESET PASSWORD
  // ==========================================================

  const handleResetPassword = async (e) => {
    e.preventDefault();

    setLoading(true);
    setError("");
    setResetMessage("");

    try {
      if (!resetEmail.trim()) {
        throw new Error(
          "Please enter your email address."
        );
      }

      await resetPassword(
        resetEmail.trim()
      );

      setResetMessage(
        "Password reset email sent."
      );

      setError("");
    } catch (err) {
      console.error(
        "❌ Password reset error:",
        err
      );

      setError(
        err.message ||
          "Unable to send password reset email."
      );
    } finally {
      setLoading(false);
    }
  };

  // ==========================================================
  // LOGIN / REGISTER
  // ==========================================================

  const handleSubmit = async (e) => {
    e.preventDefault();

    setLoading(true);
    setError("");

    try {
      let userCredential;

      // --------------------------------------------------------
      // LOGIN
      // --------------------------------------------------------

      if (isLogin) {
        console.log(
          "🔐 Signing in:",
          email
        );

        userCredential =
          await loginUser(
            email.trim(),
            password
          );

        console.log(
          "✅ Firebase login successful:",
          userCredential.user.email
        );
      }

      // --------------------------------------------------------
      // REGISTER
      // --------------------------------------------------------

      else {
        console.log(
          "📝 Creating Firebase account:",
          email
        );

        userCredential =
          await registerUser(
            email.trim(),
            password
          );

        // Update Firebase display name
        if (name.trim()) {
          await updateUserProfile(
            name.trim()
          );
        }

        console.log(
          "✅ Firebase registration successful:",
          userCredential.user.email
        );
      }

      // --------------------------------------------------------
      // SYNC FIREBASE USER WITH FASTAPI
      // --------------------------------------------------------
      //
      // This calls:
      //
      // POST /api/users/sync-firebase
      //
      // through the same API URL used by the application.
      //
      // Local:
      // http://localhost:8000/api/users/sync-firebase
      //
      // Tunnel:
      // https://YOUR-TUNNEL.trycloudflare.com/api/users/sync-firebase
      //
      // --------------------------------------------------------

      try {
        await syncUserWithBackend(
          userCredential.user,
          name
        );
      } catch (syncError) {
        // Do NOT destroy the Firebase login if backend
        // synchronization temporarily fails.
        //
        // The Main component can retry synchronization
        // after authentication.

        console.warn(
          "⚠️ Firebase login succeeded, but backend sync failed."
        );

        console.warn(
          "⚠️ Backend sync error:",
          syncError
        );
      }

      // --------------------------------------------------------
      // Tell Main.jsx that login succeeded
      // --------------------------------------------------------

      if (onLogin) {
        onLogin(
          userCredential.user
        );
      }
    } catch (err) {
      console.error(
        "❌ Authentication error:",
        err
      );

      switch (err.code) {
        case "auth/email-already-in-use":
          setError(
            "This email is already registered."
          );
          break;

        case "auth/user-not-found":
          setError(
            "No account found with this email."
          );
          break;

        case "auth/wrong-password":
          setError(
            "Incorrect password."
          );
          break;

        case "auth/invalid-email":
          setError(
            "Invalid email address."
          );
          break;

        case "auth/invalid-credential":
          setError(
            "Invalid email or password."
          );
          break;

        case "auth/weak-password":
          setError(
            "Password must be at least 6 characters."
          );
          break;

        case "auth/too-many-requests":
          setError(
            "Too many requests. Please try again later."
          );
          break;

        case "auth/network-request-failed":
          setError(
            "Network error. Please check your internet connection."
          );
          break;

        default:
          setError(
            err.message ||
              "Authentication failed."
          );
      }
    } finally {
      setLoading(false);
    }
  };

  // ==========================================================
  // UI
  // ==========================================================

  return (
    <div className="login-container">
      <div className="login-card glass-card">

        {/* ================================================== */}
        {/* HEADER */}
        {/* ================================================== */}

        <div className="login-header">
          <div className="brand-icon">
            ◫
          </div>

          <h1>QTO.sol</h1>

          <p className="login-subtitle">
            Task Management System
          </p>
        </div>

        {/* ================================================== */}
        {/* PASSWORD RESET */}
        {/* ================================================== */}

        {showResetPassword ? (
          <form
            onSubmit={handleResetPassword}
            className="login-form"
          >
            <div className="form-group">
              <label>
                Email
              </label>

              <input
                type="email"
                value={resetEmail}
                onChange={(e) =>
                  setResetEmail(
                    e.target.value
                  )
                }
                required
              />
            </div>

            {resetMessage && (
              <div className="success-message">
                {resetMessage}
              </div>
            )}

            {error && (
              <div className="error-message">
                {error}
              </div>
            )}

            <button
              type="submit"
              className="primary-btn login-btn"
              disabled={loading}
            >
              {loading
                ? "Sending..."
                : "Send Reset Email"}
            </button>

            <button
              type="button"
              className="switch-btn"
              onClick={() => {
                setShowResetPassword(false);
                setError("");
                setResetMessage("");
              }}
            >
              ← Back to Sign In
            </button>
          </form>
        ) : (

          /* ================================================== */
          /* LOGIN / REGISTER FORM */
          /* ================================================== */

          <form
            onSubmit={handleSubmit}
            className="login-form"
          >

            {/* FULL NAME */}
            {!isLogin && (
              <div className="form-group">
                <label>
                  Full Name
                </label>

                <input
                  type="text"
                  value={name}
                  onChange={(e) =>
                    setName(
                      e.target.value
                    )
                  }
                  required
                />
              </div>
            )}

            {/* EMAIL */}
            <div className="form-group">
              <label>
                Email
              </label>

              <input
                type="email"
                value={email}
                onChange={(e) =>
                  setEmail(
                    e.target.value
                  )
                }
                required
              />
            </div>

            {/* PASSWORD */}
            <div className="form-group">
              <label>
                Password
              </label>

              <input
                type="password"
                value={password}
                onChange={(e) =>
                  setPassword(
                    e.target.value
                  )
                }
                minLength={6}
                required
              />
            </div>

            {/* FORGOT PASSWORD */}
            {isLogin && (
              <button
                type="button"
                className="forgot-password-btn"
                onClick={() => {
                  setResetEmail(email);
                  setShowResetPassword(true);
                  setError("");
                }}
              >
                Forgot Password?
              </button>
            )}

            {/* ERROR */}
            {error && (
              <div className="error-message">
                {error}
              </div>
            )}

            {/* SUBMIT */}
            <button
              type="submit"
              className="primary-btn login-btn"
              disabled={loading}
            >
              {loading
                ? "Loading..."
                : isLogin
                ? "Sign In"
                : "Create Account"}
            </button>

            {/* SWITCH LOGIN / REGISTER */}
            <button
              type="button"
              className="switch-btn"
              onClick={() => {
                setIsLogin(
                  !isLogin
                );

                setError("");
                setResetMessage("");
              }}
            >
              {isLogin
                ? "Don't have an account? Sign Up"
                : "Already have an account? Sign In"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default Login;