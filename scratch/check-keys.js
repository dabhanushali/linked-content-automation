const fs = require("fs");
const path = require("path");

// Helper to mask sensitive keys
function maskKey(key) {
  if (!key || typeof key !== "string") return "\x1b[31m[Not Configured]\x1b[0m";
  const trimmed = key.trim();
  if (trimmed.length <= 8) return "\x1b[32m[Configured] (Short Key)\x1b[0m";
  return `\x1b[32m[Configured]\x1b[0m (starts with: "${trimmed.slice(0, 7)}...", length: ${trimmed.length} chars)`;
}

async function run() {
  console.log("\x1b[36m=== Harvey API Key & Database Settings Audit ===\x1b[0m\n");

  // 1. Read .env file
  const envPath = path.join(__dirname, "../.env");
  const envVars = {};
  if (fs.existsSync(envPath)) {
    console.log(`\x1b[32m✔ Found .env file at:\x1b[0m ${envPath}`);
    const envContent = fs.readFileSync(envPath, "utf-8");
    envContent.split("\n").forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return;
      const index = trimmed.indexOf("=");
      if (index > 0) {
        const key = trimmed.slice(0, index).trim();
        const val = trimmed.slice(index + 1).trim();
        envVars[key] = val;
      }
    });
  } else {
    console.log("\x1b[31m✘ No .env file found in root directory!\x1b[0m");
  }

  // Merging with system process.env just in case
  const finalEnv = { ...envVars, ...process.env };

  console.log("\n\x1b[35m--- 1. Environment Config (.env) ---\x1b[0m");
  console.log("Supabase URL:    ", finalEnv.NEXT_PUBLIC_SUPABASE_URL || "\x1b[31m[Missing]\x1b[0m");
  console.log("Supabase Key:    ", maskKey(finalEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY));
  console.log("OpenAI Key:      ", maskKey(finalEnv.OPENAI_API_KEY));
  console.log("Anthropic Key:   ", maskKey(finalEnv.ANTHROPIC_API_KEY));
  console.log("OpenRouter Key:  ", maskKey(finalEnv.OPENROUTER_API_KEY));
  console.log("Apify Token:     ", maskKey(finalEnv.APIFY_API_TOKEN));
  console.log("Firecrawl Key:   ", maskKey(finalEnv.FIRECRAWL_API_KEY));
  console.log("Tavily Key:      ", maskKey(finalEnv.TAVILY_API_KEY));

  // 2. Database Checks (Direct REST API request to bypass Node 20 WebSocket issues)
  const supabaseUrl = finalEnv.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = finalEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.log("\n\x1b[31m✘ Cannot run database settings check: Supabase URL or Anon Key is missing.\x1b[0m");
    return;
  }

  console.log("\n\x1b[35m--- 2. Database settings Check (Supabase Cloud via REST) ---\x1b[0m");
  try {
    console.log("Connecting to Supabase REST API...");
    // Direct fetch call
    const response = await fetch(`${supabaseUrl}/rest/v1/settings?id=eq.1`, {
      headers: {
        "apikey": supabaseKey,
        "Authorization": `Bearer ${supabaseKey}`,
        "Accept": "application/json"
      }
    });

    if (!response.ok) {
      console.error(`\x1b[31m✘ Failed to query 'settings' table. Status: ${response.status} ${response.statusText}\x1b[0m`);
      return;
    }

    const data = await response.json();
    const settings = Array.isArray(data) ? data[0] : data;

    if (!settings) {
      console.log("\x1b[31m✘ Settings row with id=1 not found in database.\x1b[0m");
      return;
    }

    console.log("\x1b[32m✔ Settings row retrieved successfully!\x1b[0m");
    console.log("Selected AI Provider:       ", `\x1b[33m${settings.ai_provider || "default"}\x1b[0m`);
    console.log("Default Content Language:   ", settings.default_language || "en");
    
    // Check reddit_services_config field
    const redditConfig = settings.reddit_services_config || {};
    console.log("\n\x1b[35m--- 3. Database Scraper Credentials (reddit_services_config) ---\x1b[0m");
    console.log("Apify Key in DB:   ", maskKey(redditConfig.apify_key || redditConfig.apify));
    console.log("Firecrawl in DB:   ", maskKey(redditConfig.firecrawl_key || redditConfig.firecrawl));
    console.log("Tavily Key in DB:  ", maskKey(redditConfig.tavily_key || redditConfig.tavily));

    // Summary Advice
    console.log("\n\x1b[36m=== Final Verdict ===\x1b[0m");
    const hasScraperEnv = finalEnv.APIFY_API_TOKEN || finalEnv.FIRECRAWL_API_KEY || finalEnv.TAVILY_API_KEY;
    const hasScraperDb = redditConfig.apify_key || redditConfig.firecrawl_key || redditConfig.tavily_key;

    if (hasScraperEnv || hasScraperDb) {
      console.log("\x1b[32m✔ Setup is ready! Scraper keys are loaded and configured.\x1b[0m");
      if (hasScraperDb) {
        console.log("  -> Database scraping credentials will be used as primary or fallback.");
      } else {
        console.log("  -> Scrapers are configured via local .env environment variables.");
      }
    } else {
      console.log("\x1b[33m⚠ Warning: No scraper API keys found in either .env or Database settings.\x1b[0m");
      console.log("  -> Please populate APIFY_API_TOKEN, FIRECRAWL_API_KEY, or TAVILY_API_KEY in your .env");
      console.log("  -> Or add them in the admin dashboard settings GUI.");
    }

  } catch (err) {
    console.error("\x1b[31m✘ Error during database connection/verification:\x1b[0m", err.message);
  }
}

run();
