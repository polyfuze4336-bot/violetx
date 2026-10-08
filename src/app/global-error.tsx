"use client";

// Last-resort boundary (errors in the root layout). Must render its own <html>.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", textAlign: "center", padding: 24 }}>
        <div>
          <h1 style={{ fontSize: 20 }}>Something went wrong</h1>
          <p style={{ color: "#666" }}>Please try again.</p>
          <button onClick={() => reset()} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #ccc", cursor: "pointer" }}>
            Try again
          </button>{" "}
          <a href="/signin" style={{ marginLeft: 8 }}>
            Back to sign in
          </a>
        </div>
      </body>
    </html>
  );
}
