"use client";

// The last resort: it replaces the root layout, so it carries its own <html> and plain inline
// styles (the app's stylesheet is not loaded here). Like error.tsx it never prints the error.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100svh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
          background: "#f6f8f7",
          color: "#1c2733",
          textAlign: "center",
          padding: "1.5rem",
        }}
      >
        <main>
          <h1>Something went wrong</h1>
          <p>The application could not be shown. Please try again.</p>
          <button
            onClick={reset}
            style={{ padding: "0.6rem 1.2rem", border: 0, borderRadius: 8, background: "#0c6552", color: "#fff", cursor: "pointer" }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
