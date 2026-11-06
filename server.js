import { createServer } from "http";
import next from "next";

// Ensure NODE_ENV defaults to production for optimal performance and memory safety
if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = "production";
}

const dev = process.env.NODE_ENV === "development";
const hostname = "0.0.0.0";
const port = parseInt(process.env.PORT || "3141", 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// Listen on configured port 3141 (or process.env.PORT) and optional ALT_PORT
const requestedPorts = [
  port,
  ...(process.env.ALT_PORT ? [parseInt(process.env.ALT_PORT, 10)] : []),
];

const targetPorts = Array.from(new Set(requestedPorts));

app.prepare().then(() => {
  const requestHandler = (req, res) => {
    // Next.js 14/15 handle takes (req, res) directly without deprecated url.parse
    handle(req, res);
  };

  targetPorts.forEach((p) => {
    try {
      const server = createServer(requestHandler);
      server.listen(p, hostname, () => {
        console.log(`[HakimQzz POS] (${dev ? "development" : "production"}) Ready & listening on http://${hostname}:${p}`);
      });
      server.on("error", (err) => {
        if (err.code === "EACCES") {
          console.warn(`[HakimQzz POS] Port ${p} requires root/admin privileges on this OS.`);
        } else if (err.code === "EADDRINUSE") {
          console.warn(`[HakimQzz POS] Port ${p} is currently in use by another service.`);
        } else {
          console.warn(`[HakimQzz POS] Error on port ${p}:`, err.message);
        }
      });
    } catch (err) {
      console.warn(`[HakimQzz POS] Could not start server on port ${p}:`, err.message);
    }
  });
}).catch((err) => {
  console.error("[HakimQzz POS] Error starting Next.js application:", err);
  process.exit(1);
});
