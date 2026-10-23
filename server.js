const express = require("express");
const path = require("path");
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "public"), {
  etag: true,
  maxAge: "1m"
}));

app.get("/controls", (_req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.get("/layout", (_req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

app.get("/health", (_req, res) => res.json({ ok: true, app: "KMIA VATSIM Landing Cam" }));

app.listen(PORT, "0.0.0.0", () => {
  console.log(`KMIA VATSIM Landing Cam listening on port ${PORT}`);
});
