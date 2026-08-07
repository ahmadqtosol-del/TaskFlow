import React, { useState } from "react";
import {
  loginUser,
  registerUser,
  resetPassword,
  updateUserProfile,
} from "./firebase";

// API function
async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});

  if (
    options.body &&
    !(options.body instanceof FormData) &&
    !headers.has("Content-Type")
  ) {
    headers.set("Content-Type", "application/json");
  }

const API_URL = "https://rogers-telecom-bacteria-whose.trycloudflare.com/api";
const res = await fetch(`${API_URL}${path}`, {
  ...options,
  headers,
});

  if (!res.ok) {
    const err = await res.json().catch(() => ({
      detail: "Request failed",
    }));
    throw new Error(err.detail || "Request failed");
  }

  if (res.status === 204) return null;

  return res.json();
}

function Login({ onLogin }) {
  const [isLogin, setIsLogin] = useState(true);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [showResetPassword, setShowResetPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetMessage, setResetMessage] = useState("");

  const syncUserWithBackend = async (firebaseUser, displayName) => {
    return api("/users/sync-firebase", {
      method: "POST",
      body: JSON.stringify({
        email: firebaseUser.email,
        name:
          displayName ||
          firebaseUser.displayName ||
          firebaseUser.email.split("@")[0],
      }),
    });
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();

    setLoading(true);
    setError("");
    setResetMessage("");

    try {
      await resetPassword(resetEmail);

      setResetMessage("Password reset email sent.");
      setShowResetPassword(false);
      setResetEmail("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    setLoading(true);
    setError("");

    try {
      let userCredential;

      if (isLogin) {
        userCredential = await loginUser(email, password);
      } else {
        userCredential = await registerUser(email, password);

        if (name.trim()) {
          await updateUserProfile(name.trim());
        }
      }

      await syncUserWithBackend(userCredential.user, name);

      onLogin(userCredential.user);
    } catch (err) {
      console.error(err);

      switch (err.code) {
        case "auth/email-already-in-use":
          setError("This email is already registered.");
          break;

        case "auth/user-not-found":
          setError("No account found with this email.");
          break;

        case "auth/wrong-password":
          setError("Incorrect password.");
          break;

        case "auth/invalid-email":
          setError("Invalid email address.");
          break;

        case "auth/invalid-credential":
          setError("Invalid email or password.");
          break;

        case "auth/weak-password":
          setError("Password must be at least 6 characters.");
          break;

        case "auth/too-many-requests":
          setError("Too many requests. Please try again later.");
          break;

        default:
          setError(err.message || "Authentication failed.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card glass-card">
        <div className="login-header">
          <div className="brand-icon">◫</div>
          <h1>QTO.sol</h1>
          <p className="login-subtitle">Task Management System</p>
        </div>

        {showResetPassword ? (
          <form onSubmit={handleResetPassword} className="login-form">
            <div className="form-group">
              <label>Email</label>

              <input
                type="email"
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
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
              {loading ? "Sending..." : "Send Reset Email"}
            </button>

            <button
              type="button"
              className="switch-btn"
              onClick={() => {
                setShowResetPassword(false);
                setError("");
              }}
            >
              ← Back to Sign In
            </button>
          </form>
        ) : (
          <form onSubmit={handleSubmit} className="login-form">

            {!isLogin && (
              <div className="form-group">
                <label>Full Name</label>

                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
            )}

            <div className="form-group">
              <label>Email</label>

              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label>Password</label>

              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={6}
                required
              />
            </div>

            {isLogin && (
              <button
                type="button"
                className="forgot-password-btn"
                onClick={() => {
                  setResetEmail(email);
                  setShowResetPassword(true);
                }}
              >
                Forgot Password?
              </button>
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
                ? "Loading..."
                : isLogin
                ? "Sign In"
                : "Create Account"}
            </button>

            <button
              type="button"
              className="switch-btn"
              onClick={() => {
                setIsLogin(!isLogin);
                setError("");
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