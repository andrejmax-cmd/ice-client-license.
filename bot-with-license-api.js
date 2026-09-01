const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder
} = require("discord.js");
const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const GUILD_ID = process.env.DISCORD_GUILD_ID;
const OWNER_ID = process.env.OWNER_ID || "";
const DOWNLOAD_URL = process.env.DOWNLOAD_URL || "";

const PORT = Number(process.env.PORT || 3000);

const GITHUB_OWNER = process.env.GITHUB_OWNER || "andrejmax-cmd";
const GITHUB_REPO = process.env.GITHUB_REPO || "ice-client-license";
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || "main";
const GITHUB_PATH = process.env.GITHUB_PATH || "licenses.json";
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || "";

const LOCAL_FILE = path.join(__dirname, "licenses.json");

const app = express();
app.use(express.json({ limit: "16kb" }));

let data = { licenses: {} };
let githubSha = null;
let saveQueue = Promise.resolve();

function normalizeData(value) {
  if (!value || typeof value !== "object") return { licenses: {} };

  // Accept the old array format too, but convert it into the new key-based format.
  if (Array.isArray(value.licenses)) {
    return { licenses: {} };
  }

  if (!value.licenses || typeof value.licenses !== "object") {
    value.licenses = {};
  }

  return value;
}

function loadLocal() {
  try {
    if (!fs.existsSync(LOCAL_FILE)) return { licenses: {} };
    return normalizeData(JSON.parse(fs.readFileSync(LOCAL_FILE, "utf8")));
  } catch (err) {
    console.error("Could not read licenses.json:", err.message);
    return { licenses: {} };
  }
}

function writeLocal() {
  fs.writeFileSync(LOCAL_FILE, JSON.stringify(data, null, 2) + "\n", "utf8");
}

async function githubRequest(url, options = {}) {
  if (!GITHUB_TOKEN) return null;

  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub ${response.status}: ${body}`);
  }

  return response;
}

async function loadFromGitHub() {
  if (!GITHUB_TOKEN) {
    data = loadLocal();
    return;
  }

  try {
    const url =
      `https://api.github.com/repos/${encodeURIComponent(GITHUB_OWNER)}/` +
      `${encodeURIComponent(GITHUB_REPO)}/contents/${GITHUB_PATH}?ref=${encodeURIComponent(GITHUB_BRANCH)}`;

    const response = await githubRequest(url);
    const file = await response.json();

    githubSha = file.sha;
    const decoded = Buffer.from(file.content.replace(/\n/g, ""), "base64").toString("utf8");
    data = normalizeData(JSON.parse(decoded));
    writeLocal();

    console.log("Loaded licenses.json from GitHub.");
  } catch (err) {
    console.error("GitHub load failed, using local licenses.json:", err.message);
    data = loadLocal();
  }
}

async function saveToGitHub() {
  if (!GITHUB_TOKEN) {
    writeLocal();
    return;
  }

  const run = async () => {
    const content = Buffer.from(
      JSON.stringify(data, null, 2) + "\n",
      "utf8"
    ).toString("base64");

    const url =
      `https://api.github.com/repos/${encodeURIComponent(GITHUB_OWNER)}/` +
      `${encodeURIComponent(GITHUB_REPO)}/contents/${GITHUB_PATH}`;

    // Get the current SHA so updates continue to work after external commits.
    let sha = githubSha;
    try {
      const getResponse = await githubRequest(
        `${url}?ref=${encodeURIComponent(GITHUB_BRANCH)}`
      );
      const current = await getResponse.json();
      sha = current.sha;
    } catch {
      // File may not exist yet.
    }

    const body = {
      message: "Update Ice Client licenses",
      content,
      branch: GITHUB_BRANCH
    };
    if (sha) body.sha = sha;

    const response = await githubRequest(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    const result = await response.json();
    githubSha = result.content?.sha || sha || null;
    writeLocal();
    console.log("Saved licenses.json to GitHub.");
  };

  saveQueue = saveQueue.then(run, run);
  return saveQueue;
}

function createKey() {
  return "ICE-LIFE-" + crypto.randomBytes(12).toString("hex").toUpperCase();
}

function isOwner(userId) {
  return userId === OWNER_ID;
}

const commands = [
  new SlashCommandBuilder()
    .setName("createkey")
    .setDescription("Create a Lifetime Ice Client license key."),

  new SlashCommandBuilder()
    .setName("redeemkey")
    .setDescription("Redeem a Lifetime Ice Client license key.")
    .addStringOption(option =>
      option
        .setName("key")
        .setDescription("Your Lifetime license key")
        .setRequired(true)
    )
].map(command => command.toJSON());

async function registerCommands() {
  if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
    console.log("Discord variables missing; Discord bot registration skipped.");
    return;
  }

  const rest = new REST({ version: "10" }).setToken(TOKEN);

  await rest.put(
    Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
    { body: commands }
  );

  console.log("Discord slash commands registered.");
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

client.once("ready", () => {
  console.log(`Discord bot logged in as ${client.user.tag}`);
});

client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  try {
    if (interaction.commandName === "createkey") {
      if (!isOwner(interaction.user.id)) {
        return interaction.reply({
          content: "❌ You are not allowed to create keys.",
          ephemeral: true
        });
      }

      const key = createKey();

      data.licenses[key] = {
        active: true,
        lifetime: true,
        durationDays: null,
        redeemed: false,
        redeemedBy: null,
        redeemedAt: null,
        deviceId: null,
        boundAt: null,
        createdAt: new Date().toISOString(),
        createdBy: interaction.user.id
      };

      await saveToGitHub();

      return interaction.reply({
        content: `🔑 **Lifetime Key created**\n\`${key}\``,
        ephemeral: true
      });
    }

    if (interaction.commandName === "redeemkey") {
      const key = interaction.options.getString("key", true).trim().toUpperCase();
      const license = data.licenses[key];

      if (!license) {
        return interaction.reply({
          content: "❌ Invalid Lifetime key.",
          ephemeral: true
        });
      }

      if (license.active === false) {
        return interaction.reply({
          content: "❌ This key is disabled.",
          ephemeral: true
        });
      }

      if (license.lifetime !== true) {
        return interaction.reply({
          content: "❌ This key is not a Lifetime key.",
          ephemeral: true
        });
      }

      if (license.redeemed) {
        return interaction.reply({
          content: "❌ This key has already been redeemed.",
          ephemeral: true
        });
      }

      license.redeemed = true;
      license.redeemedBy = interaction.user.id;
      license.redeemedAt = new Date().toISOString();

      await saveToGitHub();

      let dmText =
        "✅ Your Ice Client Lifetime key has been redeemed.\n\n" +
        "You can now activate the client with this key.";

      if (DOWNLOAD_URL) {
        dmText += `\n\n📥 Download: ${DOWNLOAD_URL}`;
      }

      try {
        await interaction.user.send(dmText);
      } catch {
        // DMs can be disabled; don't fail the redemption.
      }

      return interaction.reply({
        content: "✅ Lifetime key redeemed. Check your DMs for the download.",
        ephemeral: true
      });
    }
  } catch (err) {
    console.error("Discord command error:", err);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: "❌ Server error. Check the bot logs.",
        ephemeral: true
      });
    }
  }
});

// Client activation endpoint.
// The client sends only its Lifetime key and its locally generated installation UUID.
app.post("/api/license/activate", async (req, res) => {
  try {
    const key = String(req.body?.key || "").trim().toUpperCase();
    const deviceId = String(req.body?.deviceId || "").trim();

    if (!key || !deviceId || key.length > 128 || deviceId.length > 128) {
      return res.status(400).json({
        valid: false,
        error: "Missing or invalid key/deviceId"
      });
    }

    const license = data.licenses[key];

    if (!license) {
      return res.json({ valid: false, error: "Invalid license key" });
    }

    if (license.active === false) {
      return res.json({ valid: false, error: "License disabled" });
    }

    if (license.lifetime !== true) {
      return res.json({ valid: false, error: "Lifetime license required" });
    }

    if (license.redeemed !== true) {
      return res.json({ valid: false, error: "License has not been redeemed" });
    }

    if (!license.deviceId) {
      license.deviceId = deviceId;
      license.boundAt = new Date().toISOString();
      await saveToGitHub();

      return res.json({
        valid: true,
        lifetime: true,
        message: "License activated and device bound"
      });
    }

    if (license.deviceId !== deviceId) {
      return res.json({
        valid: false,
        error: "License is bound to another device"
      });
    }

    return res.json({
      valid: true,
      lifetime: true,
      message: "License valid"
    });
  } catch (err) {
    console.error("Activation error:", err);
    return res.status(500).json({
      valid: false,
      error: "Internal server error"
    });
  }
});

app.get("/", (_req, res) => {
  res.json({
    ok: true,
    service: "Ice Client License API",
    lifetimeOnly: true
  });
});

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

async function start() {
  await loadFromGitHub();

  app.listen(PORT, "0.0.0.0", async () => {
    console.log(`Ice Client License API listening on port ${PORT}`);

    if (TOKEN && CLIENT_ID && GUILD_ID) {
      try {
        await registerCommands();
        await client.login(TOKEN);
      } catch (err) {
        console.error("Discord startup failed:", err);
      }
    }
  });
}

start().catch(err => {
  console.error("Startup failed:", err);
  process.exit(1);
});
