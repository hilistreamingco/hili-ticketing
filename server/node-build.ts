import path from "node:path";
import { createServer } from "./index";
import express from "express";

const app = createServer();
const port = process.env.PORT || 3000;
const __dirname = import.meta.dirname;
const distPath = path.join(__dirname, "../spa");

app.use(express.static(distPath));
app.get("*", (req, res) => {
  if (req.path.startsWith("/api/") || req.path.startsWith("/health")) return res.status(404).json({ error: "API endpoint not found" });
  res.sendFile(path.join(distPath, "index.html"));
});

app.listen(port, () => console.log(`Hili Ticketing server running on port ${port}`));
process.on("SIGTERM", () => process.exit(0));
process.on("SIGINT", () => process.exit(0));
