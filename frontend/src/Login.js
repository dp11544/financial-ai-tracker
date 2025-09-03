import React from "react";

function Login() {
  const handleLogin = () => {
    // Redirect to backend Google login
    window.location.href = "http://localhost:5000/auth/google";
  };

  return (
    <div className="relative flex items-center justify-center h-screen bg-gradient-to-br from-gray-900 via-black to-gray-800 text-white">
      {/* Background overlay */}
      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/asfalt-dark.png')] opacity-20"></div>

      {/* Card */}
      <div className="relative z-10 bg-black/70 backdrop-blur-md p-10 rounded-2xl shadow-2xl w-full max-w-md text-center">
        <h1 className="text-4xl font-extrabold mb-6 tracking-wide text-red-600 drop-shadow-lg">
          Finance Tracker
        </h1>
        <p className="text-gray-300 mb-8">
          Manage your expenses with style. Sign in securely with Google.
        </p>
        <button
          onClick={handleLogin}
          className="flex items-center justify-center w-full bg-red-600 text-lg font-semibold py-3 px-6 rounded-lg hover:bg-red-700 transition duration-300 ease-in-out shadow-lg hover:shadow-red-700/50"
        >
          <svg
            className="w-6 h-6 mr-3"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 48 48"
          >
            <path
              fill="#4285F4"
              d="M24 9.5c3.3 0 6.2 1.1 8.5 3.2l6.3-6.3C34.8 2.6 29.7.5 24 .5 14.6.5 6.4 6.8 2.7 15.5l7.6 5.9C12.5 15.7 17.8 9.5 24 9.5z"
            />
            <path
              fill="#34A853"
              d="M46.5 24c0-1.6-.1-3.2-.4-4.7H24v9h12.7c-.6 3-2.3 5.6-4.8 7.3l7.4 5.7c4.3-3.9 7.2-9.8 7.2-17.3z"
            />
            <path
              fill="#FBBC05"
              d="M10.3 28.7c-1.1-3.1-1.1-6.5 0-9.6l-7.6-5.9C.9 17.7 0 20.8 0 24c0 3.2.9 6.3 2.7 9.1l7.6-5.9z"
            />
            <path
              fill="#EA4335"
              d="M24 48c6.5 0 12-2.1 16-5.7l-7.4-5.7c-2.1 1.4-4.7 2.3-8.6 2.3-6.2 0-11.5-4.2-13.4-9.9l-7.6 5.9C6.4 41.2 14.6 47.5 24 47.5z"
            />
          </svg>
          Sign in with Google
        </button>
      </div>
    </div>
  );
}

export default Login;
