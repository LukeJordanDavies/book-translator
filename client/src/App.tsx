import { useEffect, useState } from "react";

function App() {
  const [message, setMessage] = useState("Connecting to server...");

  useEffect(() => {
    fetch("/api/health")
      .then((response) => response.json())
      .then((data) => setMessage(data.message))
      .catch(() => setMessage("Could not connect to server"));
  }, []);

  return (
    <main>
      <h1>Book Translator</h1>
      <p>{message}</p>
    </main>
  );
}

export default App;
