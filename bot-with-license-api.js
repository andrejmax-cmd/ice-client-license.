const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(express.json({ limit: "16kb" }));

const PORT = Number(process.env.PORT || 3000);
const API_SECRET = process.env.API_SECRET || "";

const LICENSE_FILE = path.join(__dirname, "licenses.json");

function loadLicenses() {
  try {
    if (!fs.existsSync(LICENSE_FILE)) {
      return { licenses: {} };
    }
    const data = JSON.parse(fs.readFileSync(LICENSE_FILE, "utf8"));
    if (!data.licenses) data.licenses = {};
    return data;
  } catch {
    return { licenses: {} };
  }
}

function saveLicenses(data) {
  fs.writeFileSync(LICENSE_FILE, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function authorized(req) {
  if (!API_SECRET) return true;
  return req.get("x-api-secret") === API_SECRET;
}

app.get("/", (_req, res) => {
  res.json({ ok: true, service: "Ice Client License API" });
});

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/license/activate", (req, res) => {
  if (!authorized(req)) {
    return res.status(401).json({ valid: false, error: "Unauthorized" });
  }

  const key = String(req.body?.key || "").trim().toUpperCase();
  const deviceId = String(req.body?.deviceId || "").trim();

  if (!key || !deviceId) {
    return res.status(400).json({ valid: false, error: "Missing key or deviceId" });
  }

  const data = loadLicenses();
  const license = data.licenses[key];

  if (!license) {
    return res.status(200).json({ valid: false, error: "Invalid license key" });
  }

  if (license.active === false) {
    return res.status(200).json({ valid: false, error: "License disabled" });
  }

  if (license.lifetime !== true) {
    return res.status(200).json({ valid: false, error: "Lifetime license required" });
  }

  if (license.redeemed !== true) {
    return res.status(200).json({ valid: false, error: "License has not been redeemed" });
  }

  // First activation binds the lifetime key to this installation UUID.
  if (!license.deviceId) {
    license.deviceId = deviceId;
    license.boundAt = new Date().toISOString();
    saveLicenses(data);

    return res.json({
      valid: true,
      lifetime: true,
      message: "License activated and device bound"
    });
  }

  // A bound key can only be used by the same installation.
  if (license.deviceId !== deviceId) {
    return res.status(200).json({
      valid: false,
      error: "License is bound to another device"
    });
  }

  return res.json({
    valid: true,
    lifetime: true,
    message: "License valid"
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Ice Client License API listening on port ${PORT}`);
});
