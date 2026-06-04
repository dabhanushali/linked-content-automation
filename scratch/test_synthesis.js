const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { OpenAI } = require('openai');

// Load environment variables from .env in project root
const envPath = path.resolve(__dirname, '../.env');
dotenv.config({ path: envPath });

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function testSynthesis() {
  const query = "pet care app development service";
  const persona = "EnactOn focuses on custom software development, mobile apps, and SaaS platforms.";
  const icp = "Pet business owners, vet clinic managers, and startup founders wanting to build pet sitting, tracking, or scheduling apps.";
  
  const redditSources = [
    { subreddit: "Entrepreneur", title: "My pet care experiences led me to build an app to solve the issues I faced and many others.", url: "https://reddit.com/r/Entrepreneur/comments/u5jy67" },
    { subreddit: "Entrepreneur", title: "$20k/month with a dog leash that attaches to your bicycle.", url: "https://reddit.com/r/Entrepreneur/comments/dk5mux" },
    { subreddit: "startup", title: "Simple steps to generate and validate pet business ideas", url: "https://reddit.com/r/startup/comments/9qntl8" },
    { subreddit: "petcare", title: "Looking for an app to manage pet health records and scheduling", url: "https://reddit.com/r/petcare/comments/1abc123" }
  ];

  const scrapedPAAQuestions = [
    "How do I start a pet care app?",
    "How much does it cost to build a dog walking app like Rover?",
    "What features should a pet care app have?"
  ];

  const autocompleteSuggestions = [
    "pet care app development cost",
    "pet care app development agency",
    "dog walking app development cost",
    "pet sitting app builder",
    "how to make a pet care app",
    "pet care app template free",
    "pet sitting app features list",
    "best payment gateway for pet services"
  ];

  const actualThreadsAnalyzed = redditSources.length;

  const synthesisPrompt = `You are an expert SEO and content strategist. 
Our Brand Persona Profile: "${persona}"
Our Target Customer (ICP): "${icp}"

The user's business niche query is: "${query}"
We have fetched these Reddit discussions:
${JSON.stringify(redditSources, null, 2)}

We scraped the following real questions, organic search result titles, and Google related searches searchers ask about "${query}":
${JSON.stringify(scrapedPAAQuestions, null, 2)}

We also fetched these Google Autocomplete search suggestions representing actual queries real users typed into Google:
${JSON.stringify(autocompleteSuggestions, null, 2)}`;

  const fullSynthesisPrompt = `${synthesisPrompt}

Your task is to generate a comprehensive, structured response matching this exact schema:
{
  "business": "string",
  "cached": false,
  "status": "complete",
  "threads_analyzed": ${actualThreadsAnalyzed},
  "subreddits": ["string"],
  "sources": [{ "subreddit": "string", "title": "string", "url": "string" }],
  "grounded_questions": [
    {
      "source_type": "reddit | paa | related_search | autocomplete",
      "source_title": "string",
      "pain_point": "string",
      "question": "string",
      "search_intent": "string",
      "geo_strategy": "string",
      "category_bucket": "Pricing | Timeline | Hiring | Vendor Selection | Validation | Competition | Maintenance | Features | Launch | Risk"
    }
  ],
  "bonus_topics": ["string"]
}

Rules:
1. Generate between 35 and 40 distinct questions in the 'grounded_questions' array. Ensure they cover multiple different concerns. Our backend filters will select and deduplicate them down to a final set of 20-25 questions, so generate a rich candidate list.
2. Every generated question MUST be directly inspired by and grounded in a specific Reddit thread title, Google PAA question, Google related search, or Autocomplete suggestion provided in the context. Map these sources in the "source_type" and "source_title" fields.
3. Enforce natural, conversational customer voice. Banish generic, robotic, and consultant-like templates.
   - STRICTLY REJECT questions containing these phrases unless the exact wording literally exists in the source evidence: 'role of', 'importance of', 'benefits of', 'latest trends', 'best practices', 'methodology', 'framework', 'technology stack', 'optimization', 'user engagement', 'retention metrics', 'implementation strategy'.
   - PREFER natural queries typed by real customers/buyers.
     * Bad (PM/Consultant style): "What criteria should I consider when choosing a mobile app development company?"
       Good (Customer style): "What Questions Should I Ask Before Hiring an App Developer?" or "How Do I Know If an App Developer Is Qualified?"
     * Bad: "What are the benefits of outsourcing mobile app development?"
       Good: "Should I Hire an App Developer or an Agency?" or "Should I Hire a Startup or Established App Development Company?"
     * Bad: "What are the costs associated with maintaining a mobile app?"
       Good: "How Much Should I Budget for App Development?" or "How to Negotiate App Development Costs"
     * Bad: "How to optimize pet care app for better user experience?"
       Good: "What features does a successful pet care app need?" or "How to build a dog walking app like Rover?"
     * Bad: "What is the difference between native and hybrid development?"
       Good: "What's the Difference Between Native and Cross-Platform App Development?"
   - Do NOT pollute the general questions with custom brand offerings (like "AI and machine learning features", "LMS", etc.) unless the user's business query specifically relates to them. Focus purely on the niche itself.
4. STRICTLY NO REPETITION / REDUNDANCY: Keep only the single strongest version of any semantically similar questions (concept similarity > 80%).
5. Category Diversity: Classify questions into the 10 buckets specified in the schema. Limit any single bucket to approximately 15% of the total questions (e.g., max 3-4 questions in any single category) to force broad coverage across pricing, timelines, hiring, mistakes, validation, maintenance, and alternatives.
6. Generate exactly 10 bonus_topics. These MUST be derived ONLY from recurring Reddit pain points, PAA questions, or related searches in the context.
   - NEVER generate generic SEO/agency blog categories (e.g., 'The Role of AI in...', 'Best Practices for...', 'Industry Trends...', 'Importance of Testing...').
   - Instead, make them reflect real, practical user problems and operational details (e.g. 'pet care app monetization strategies', 'building trust in pet care marketplaces', 'app development payment structures (fixed vs. hourly)', 'portfolio review tips for evaluating developers', 'how to manage an app development project as a non-technical founder', 'how to brief a developer on your app idea', 'remote app development team management').
7. Return ONLY raw JSON. No markdown, no code fences.`;

  console.log("Calling OpenAI GPT-4o-mini...");
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "user", content: fullSynthesisPrompt }
    ],
    response_format: { type: "json_object" }
  });

  const content = response.choices[0].message.content;
  console.log("\n--- LLM RAW RESPONSE ---");
  console.log(content);

  const parsedReport = JSON.parse(content);

  // Re-run normalizer and filter code
  const stopWords = new Set([
    "how", "much", "does", "what", "are", "the", "with", "using", "really", "associated",
    "what", "where", "when", "why", "who", "whom", "this", "that", "these", "those",
    "should", "would", "could", "will", "shall", "can", "may", "might", "must",
    "have", "has", "had", "been", "being", "were", "was", "are", "is", "was",
    "and", "but", "for", "out", "off", "our", "your", "their", "about", "there",
    "here", "some", "any", "all", "more", "most", "less", "least", "best", "good",
    "bad", "better", "worse", "like", "such", "than", "then", "very", "too", "own"
  ]);

  const dynamicStopWords = new Set([...stopWords]);
  const queryAndEntityWords = `${query}`.toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter(w => w.length > 2);
  queryAndEntityWords.forEach(w => {
    dynamicStopWords.add(w);
    if (w.endsWith("s")) dynamicStopWords.add(w.slice(0, -1));
    if (["pet", "pets", "dog", "dogs", "cat", "cats", "vet", "veterinary", "animal", "animals"].includes(w)) {
      dynamicStopWords.add("pet_root");
    }
    if (["builder", "builders", "build", "building", "develop", "developing", "development", "create", "creating", "make", "making"].includes(w)) {
      dynamicStopWords.add("build_root");
    }
  });

  const getNormalizedTokens = (str) => {
    const words = str.toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .split(/\s+/)
      .filter(w => w.length > 2 && !dynamicStopWords.has(w));
    
    const normalized = words.map(w => {
      if (["cost", "costs", "price", "prices", "pricing", "budget", "budgeting", "rate", "rates", "fee", "fees", "charge", "charges", "expensive", "cheap", "cheapest", "pay", "paying"].includes(w)) {
        return "cost_root";
      }
      if (["alternative", "alternatives", "vs", "compare", "comparison", "comparisons", "comparable", "competitor", "competitors", "replace", "replacement"].includes(w)) {
        return "alt_root";
      }
      if (["builder", "builders", "build", "building", "develop", "developing", "development", "create", "creating", "make", "making", "setup", "setting", "start", "starting"].includes(w)) {
        return "build_root";
      }
      if (["freelancer", "freelancers", "agency", "agencies", "company", "companies", "firm", "firms", "developer", "developers", "contractor", "contractors", "hire", "hiring", "team", "teams", "someone"].includes(w)) {
        return "hire_root";
      }
      if (["pet", "pets", "dog", "dogs", "cat", "cats", "vet", "veterinary", "animal", "animals"].includes(w)) {
        return "pet_root";
      }
      return w;
    });

    return new Set(normalized);
  };

  const calculateSimilarity = (str1, str2) => {
    const s1 = getNormalizedTokens(str1);
    const s2 = getNormalizedTokens(str2);
    if (s1.size === 0 || s2.size === 0) return 0;
    const intersection = new Set([...s1].filter(x => s2.has(x)));
    const union = new Set([...s1, ...s2]);
    return intersection.size / union.size;
  };

  const bannedKeywords = [
    "role of",
    "importance of",
    "benefits of",
    "latest trends",
    "current trends",
    "best practices",
    "methodology",
    "framework",
    "technology stack",
    "optimization",
    "user engagement",
    "retention metrics",
    "implementation strategy",
    "key stages",
    "essential features",
    "innovative features",
    "step-by-step guide",
    "what criteria",
    "what factors",
    "process of building",
    "steps involved",
    "current state"
  ];

  const sourceEvidenceText = [
    ...redditSources.map(s => `${s.title} ${s.subreddit}`),
    ...scrapedPAAQuestions,
    ...autocompleteSuggestions
  ].join(" ").toLowerCase();

  const validatedQuestions = [];
  const bucketCounts = {};

  const rawGrounded = parsedReport.grounded_questions || parsedReport.questions || [];
  
  for (const gq of rawGrounded) {
    if (!gq || typeof gq !== 'object') continue;
    
    const questionText = gq.question || gq.q || gq.title || "";
    if (!questionText || !questionText.includes("?")) continue;

    // Banned keywords check
    let hasBannedWord = false;
    const qLower = questionText.toLowerCase();
    for (const banned of bannedKeywords) {
      if (qLower.includes(banned)) {
        if (!sourceEvidenceText.includes(banned)) {
          hasBannedWord = true;
          break;
        }
      }
    }
    if (hasBannedWord) {
      console.log(`  [Reject Banned Phrase] "${questionText}"`);
      continue;
    }

    // Deduplication check
    let isDuplicate = false;
    for (const aq of validatedQuestions) {
      if (calculateSimilarity(questionText, aq.question) > 0.35) {
        isDuplicate = true;
        break;
      }
    }
    if (isDuplicate) {
      console.log(`  [Reject Duplicate] "${questionText}"`);
      continue;
    }

    // Diversity check
    const bucket = gq.category_bucket || "General";
    const currentCount = bucketCounts[bucket] || 0;
    if (currentCount >= 2) {
      console.log(`  [Reject Bucket Cap] "${questionText}" in bucket "${bucket}"`);
      continue;
    }

    bucketCounts[bucket] = currentCount + 1;
    validatedQuestions.push({
      question: questionText,
      search_intent: gq.search_intent || "Informational / General Query",
      geo_strategy: gq.geo_strategy || "Structure your answer using a direct definition paragraph."
    });
  }

  // Fallback pass
  if (validatedQuestions.length < 20) {
    console.log(`  [Post-processing] Only ${validatedQuestions.length} questions passed strict filters. Running fallback pass...`);
    for (const gq of rawGrounded) {
      if (validatedQuestions.length >= 25) break;
      
      const questionText = gq.question || gq.q || gq.title || "";
      if (!questionText || !questionText.includes("?")) continue;

      if (validatedQuestions.some(vq => vq.question === questionText)) continue;

      let hasBannedWord = false;
      const qLower = questionText.toLowerCase();
      for (const banned of bannedKeywords) {
        if (qLower.includes(banned)) {
          if (!sourceEvidenceText.includes(banned)) {
            hasBannedWord = true;
            break;
          }
        }
      }
      if (hasBannedWord) continue;

      let isDuplicate = false;
      for (const aq of validatedQuestions) {
        if (calculateSimilarity(questionText, aq.question) > 0.45) {
          isDuplicate = true;
          break;
        }
      }
      if (isDuplicate) continue;

      const bucket = gq.category_bucket || "General";
      const currentCount = bucketCounts[bucket] || 0;
      if (currentCount >= 3) continue;

      bucketCounts[bucket] = currentCount + 1;
      validatedQuestions.push({
        question: questionText,
        search_intent: gq.search_intent || "Informational / General Query",
        geo_strategy: gq.geo_strategy || "Structure your answer using a direct definition paragraph."
      });
    }
  }

  const finalReport = {
    business: query,
    cached: false,
    status: "complete",
    threads_analyzed: actualThreadsAnalyzed,
    subreddits: [],
    sources: redditSources.slice(0, 8),
    questions: validatedQuestions.slice(0, 25),
    bonus_topics: parsedReport.bonus_topics || []
  };

  const idealSubs = (parsedReport.subreddits || []).map((sub) => sub.replace(/^r\//i, ""));
  const combinedSubs = [];
  const seenSubs = new Set();
  const getNormKey = (sub) => sub.toLowerCase().trim();

  redditSources.forEach(src => {
    const key = getNormKey(src.subreddit);
    if (src.subreddit && !seenSubs.has(key)) {
      seenSubs.add(key);
      combinedSubs.push(src.subreddit);
    }
  });

  idealSubs.forEach((sub) => {
    const key = getNormKey(sub);
    if (sub && !seenSubs.has(key)) {
      seenSubs.add(key);
      combinedSubs.push(sub);
    }
  });

  finalReport.subreddits = combinedSubs.map(s => s.startsWith("r/") ? s : `r/${s}`).slice(0, 8);

  console.log("\n--- FINAL NORMALIZED REPORT ---");
  console.log(JSON.stringify(finalReport, null, 2));
}

testSynthesis().catch(err => console.error(err));
