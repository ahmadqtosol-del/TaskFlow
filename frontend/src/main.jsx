import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import Login from "./Login.jsx";

import {
  auth,
  onAuthStateChanged,
  signOut,
  getCurrentUser
} from "./firebase";
import "./styles.css";


// Backend API helper
async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});

  if (
    options.body &&
    !(options.body instanceof FormData) &&
    !headers.has("Content-Type")
  ) {
    headers.set("Content-Type", "application/json");
  }

  const API_URL =
    "https://gamecube-liberty-port-teddy.trycloudflare.com/api";

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ detail: "Request failed" }));

    throw new Error(error.detail || "Request failed");
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}



function Main() {

  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(null);



  // Firebase auth listener
  useEffect(() => {

    const unsubscribe = onAuthStateChanged(
      auth,
      async (firebaseUser) => {

        try {

          if (firebaseUser) {

            console.log(
              "✅ Logged in:",
              firebaseUser.email
            );


            // Sync user with backend
            try {

              await api(
                "/users/sync-firebase",
                {
                  method: "POST",

                  body: JSON.stringify({
                    email: firebaseUser.email,

                    name:
                      firebaseUser.displayName ||
                      firebaseUser.email.split("@")[0]
                  })
                }
              );


              console.log(
                "✅ User synced"
              );


            } catch(syncError){

              console.error(
                "Backend sync failed:",
                syncError
              );

            }


            setUser(firebaseUser);
            setAuthError(null);


          } else {

            console.log(
              "👋 User logged out"
            );

            setUser(null);

          }


        } catch(error){

          console.error(
            "Auth error:",
            error
          );


          setAuthError(
            "Authentication error. Please login again."
          );

          setUser(null);


        }
        finally {

          setLoading(false);

        }


      }
    );


    return () => unsubscribe();


  }, []);






  // Login callback
  const handleLogin = (firebaseUser)=>{

    console.log(
      "✅ Login successful"
    );

    setUser(firebaseUser);
    setAuthError(null);

  };






  // Logout
  const handleLogout = async()=>{

    try {

      setLoading(true);


      await signOut(auth);


      setUser(null);
      setAuthError(null);


      console.log(
        "✅ Logout successful"
      );


    } catch(error){

      console.error(
        "Logout error:",
        error
      );


      setAuthError(
        "Unable to logout. Try again."
      );


    }
    finally{

      setLoading(false);

    }

  };






  // Refresh Firebase token
  const refreshToken = async()=>{

    try {

      const currentUser =
        getCurrentUser();


      if(currentUser){

        await currentUser.getIdToken(true);


        console.log(
          "🔄 Token refreshed"
        );

      }


    } catch(error){

      console.error(
        "Token refresh failed:",
        error
      );

    }

  };







  // Auto refresh token
  useEffect(()=>{


    if(!user)
      return;


    const interval =
      setInterval(
        refreshToken,
        50 * 60 * 1000
      );


    return ()=>clearInterval(interval);


  },[user]);







  // Check tab visibility
  useEffect(()=>{


    const handler = ()=>{


      if(document.visibilityState==="visible"){

        const currentUser =
          getCurrentUser();



        if(!currentUser && user){

          setUser(null);


          setAuthError(
            "Session expired. Please login again."
          );


        }


        if(currentUser && user){

          refreshToken();

        }


      }


    };


    document.addEventListener(
      "visibilitychange",
      handler
    );


    return ()=>{

      document.removeEventListener(
        "visibilitychange",
        handler
      );

    };


  },[user]);








  // Loading screen
  if(loading){

    return (

      <div className="loading-container">

        <div className="loading-spinner">

          <div className="spinner"></div>

          <p>
            Loading...
          </p>

        </div>

      </div>

    );

  }
  // Error screen
  if(authError){

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
            onClick={()=>{

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








  // Not logged in
  if(!user){

    return (
      <Login
        onLogin={handleLogin}
      />
    );

  }






  // Logged in
  return (

    <App
      user={user}
      onLogout={handleLogout}
    />

  );


}






ReactDOM
.createRoot(
  document.getElementById("root")
)
.render(

  <React.StrictMode>

    <Main />

  </React.StrictMode>

);

