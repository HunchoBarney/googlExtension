(function attachArticleSignals(global, factory) {
  "use strict";

  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  global.PMArticleSignals = api;
})(typeof window !== "undefined" ? window : globalThis, function createArticleSignals() {
  "use strict";

  const STOPWORDS = new Set([
    "a", "about", "above", "after", "again", "against", "all", "also", "am", "an", "and", "any", "are", "as", "at",
    "be", "because", "been", "before", "being", "below", "between", "both", "but", "by", "can", "could", "did", "do",
    "does", "doing", "down", "during", "each", "few", "for", "from", "further", "had", "has", "have", "having", "he",
    "her", "here", "hers", "him", "his", "how", "i", "if", "in", "into", "is", "it", "its", "itself", "just", "more",
    "most", "my", "no", "nor", "not", "now", "of", "off", "on", "once", "only", "or", "other", "our", "out", "over",
    "own", "same", "she", "should", "so", "some", "such", "than", "that", "the", "their", "them", "then", "there",
    "these", "they", "this", "those", "through", "to", "too", "under", "until", "up", "very", "was", "we", "were",
    "what", "when", "where", "which", "while", "who", "whom", "why", "will", "with", "would", "you", "your"
  ]);

  const MONTHS = "January February March April May June July August September October November December Jan Feb Mar Apr Jun Jul Aug Sep Sept Oct Nov Dec";
  const COUNTRY_NAMES = [
    "United States", "U.S.", "US", "America", "China", "Russia", "Ukraine", "Israel", "Iran", "Gaza", "Taiwan",
    "India", "Japan", "Germany", "France", "United Kingdom", "Britain", "Canada", "Mexico", "Brazil", "Argentina",
    "Turkey", "Saudi Arabia", "South Korea", "North Korea", "Venezuela", "Poland", "Italy", "Spain", "Australia"
  ];
  const INSTITUTIONS = [
    "Federal Reserve", "Fed", "FOMC", "ECB", "Bank of Japan", "Bank of England", "SEC", "CFTC", "Supreme Court",
    "White House", "Congress", "Senate", "House", "NATO", "UN", "European Union", "EU", "Treasury", "OPEC"
  ];
  const CRYPTO = [
    ["Bitcoin", "BTC"], ["Ethereum", "ETH"], ["Solana", "SOL"], ["Dogecoin", "DOGE"], ["XRP", "XRP"],
    ["Cardano", "ADA"], ["Tether", "USDT"], ["USDC", "USDC"], ["Binance Coin", "BNB"], ["Hyperliquid", "HYPE"]
  ];
  const COMPANIES = [
    ["Nvidia", "NVDA"], ["Apple", "AAPL"], ["Microsoft", "MSFT"], ["Alphabet", "GOOGL"], ["Google", "GOOGL"],
    ["Amazon", "AMZN"], ["Meta", "META"], ["Tesla", "TSLA"], ["Netflix", "NFLX"], ["Coinbase", "COIN"],
    ["MicroStrategy", "MSTR"], ["Strategy", "MSTR"], ["AMD", "AMD"], ["Intel", "INTC"], ["Palantir", "PLTR"],
    ["OpenAI", "OPENAI"], ["Anthropic", "ANTHROPIC"], ["Broadcom", "AVGO"], ["Taiwan Semiconductor", "TSM"]
  ];
  const PEOPLE = [
    "Donald Trump", "Trump", "Joe Biden", "Biden", "Kamala Harris", "JD Vance", "Jerome Powell", "Powell",
    "Vladimir Putin", "Putin", "Volodymyr Zelensky", "Zelensky", "Xi Jinping", "Benjamin Netanyahu", "Netanyahu",
    "Elon Musk", "Sam Altman", "Taylor Swift", "Gavin Newsom", "Ron DeSantis", "Rishi Sunak"
  ];
  const SPORTS = [
    "NBA", "NFL", "MLB", "NHL", "EPL", "Champions League", "World Cup", "Super Bowl", "March Madness",
    "Lakers", "Celtics", "Knicks", "Warriors", "Yankees", "Dodgers", "Mets", "Chiefs", "Bills", "Eagles",
    "Cowboys", "49ers", "Arsenal", "Chelsea", "Liverpool", "Manchester City", "Real Madrid", "Barcelona"
  ];
  const TICKER_ALIASES = new Map(COMPANIES.map(([name, ticker]) => [ticker, name]));
  for (const [, ticker] of CRYPTO) {
    TICKER_ALIASES.set(ticker, ticker);
  }

  const TOPIC_RULES = {
    "politics/elections": [
      "election", "poll", "president", "senate", "house", "congress", "campaign", "primary", "vote", "ballot",
      "trump", "biden", "harris", "vance", "approval", "tariff"
    ],
    crypto: [
      "bitcoin", "btc", "ethereum", "eth", "crypto", "token", "blockchain", "solana", "dogecoin", "xrp",
      "coinbase", "stablecoin", "etf", "binance"
    ],
    "economy/markets": [
      "fed", "federal reserve", "inflation", "cpi", "pce", "jobs report", "unemployment", "rate cut", "rates",
      "treasury", "gdp", "recession", "tariff", "yield", "market", "stocks"
    ],
    "companies/earnings": [
      "earnings", "revenue", "profit", "guidance", "shares", "stock", "nasdaq", "nyse", "quarter", "sales",
      "nvidia", "tesla", "apple", "microsoft", "amazon", "meta", "google"
    ],
    "AI/technology": [
      "ai", "artificial intelligence", "chip", "semiconductor", "gpu", "model", "openai", "anthropic", "data center",
      "software", "robot", "technology"
    ],
    sports: [
      "nba", "nfl", "mlb", "nhl", "game", "match", "season", "playoffs", "championship", "score", "league",
      "super bowl", "world cup"
    ],
    geopolitics: [
      "war", "ceasefire", "sanction", "missile", "nato", "ukraine", "russia", "china", "taiwan", "israel", "iran",
      "gaza", "military", "border", "diplomat"
    ],
    entertainment: [
      "movie", "film", "film festival", "cannes", "palme d'or", "album", "box office", "oscar", "grammy",
      "celebrity", "tv", "show", "series", "actor", "actress", "james bond", "streaming", "netflix", "disney", "music", "studio", "bidding war", "trailer", "release"
    ],
    "weather/climate": [
      "hurricane", "storm", "temperature", "rain", "snow", "wildfire", "climate", "weather", "heat", "flood",
      "noaa", "tornado", "aurora", "geomagnetic"
    ]
  };

  let FILE_CLASSIFIER_MODEL = null;
  try {
    if (typeof require === "function") {
      FILE_CLASSIFIER_MODEL = require("./articleAngleClassifierData.json");
    }
  } catch (error) {
    FILE_CLASSIFIER_MODEL = null;
  }

  const FALLBACK_CLASSIFIER_MODEL = {
    version: "local-json-v1-fallback",
    labels: Object.entries(TOPIC_RULES).map(([topic, terms]) => ({
      topic,
      terms,
      entityWeights: {},
      angles: [],
      excludeAngles: []
    }))
  };

  function normalizeWhitespace(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function canonicalKey(value) {
    return normalizeWhitespace(value)
      .toLowerCase()
      .replace(/[^\w$.\s-]/g, "")
      .replace(/\s+/g, " ");
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function tokenize(value) {
    const matches = normalizeWhitespace(value.toLowerCase()).match(/[a-z0-9][a-z0-9'$-]*/g);
    return matches ? matches : [];
  }

  function tokenSequenceIncludes(haystackTokens, needleTokens) {
    if (!haystackTokens.length || !needleTokens.length || needleTokens.length > haystackTokens.length) {
      return false;
    }
    for (let index = 0; index <= haystackTokens.length - needleTokens.length; index += 1) {
      let matched = true;
      for (let offset = 0; offset < needleTokens.length; offset += 1) {
        if (haystackTokens[index + offset] !== needleTokens[offset]) {
          matched = false;
          break;
        }
      }
      if (matched) {
        return true;
      }
    }
    return false;
  }

  function textHasTerm(text, term) {
    const needleTokens = tokenize(term).filter((token) => !STOPWORDS.has(token) && token.length > 1);
    if (!needleTokens.length) {
      return false;
    }
    const haystackTokens = tokenize(text).filter((token) => !STOPWORDS.has(token) && token.length > 1);
    return tokenSequenceIncludes(haystackTokens, needleTokens);
  }

  function entitySearchKeys(entity) {
    return Array.from(new Set([entity && entity.text, ...((entity && entity.aliases) || [])]
      .map(canonicalKey)
      .filter((key) => key && key.length >= 2)));
  }

  function textHasEntity(text, entity) {
    return entitySearchKeys(entity).some((key) => textHasTerm(text, key));
  }

  function detailedTokens(value, sentenceIndex, startPosition = 0) {
    const matches = normalizeWhitespace(value).match(/[A-Za-z0-9][A-Za-z0-9'$-]*/g) || [];
    return matches.map((raw, index) => {
      const text = raw.toLowerCase();
      const isStopword = STOPWORDS.has(text);
      return {
        raw,
        text,
        sentenceIndex,
        position: startPosition + index,
        isStopword,
        isCandidate: text.length > 1 && !isStopword && !/^\d+$/.test(text),
        isProminentCase: /^[A-Z]/.test(raw) || /^[A-Z0-9$-]{2,}$/.test(raw)
      };
    });
  }

  function sentences(value) {
    return normalizeWhitespace(value)
      .split(/(?<=[.!?])\s+|\n+/)
      .map((sentence) => sentence.trim())
      .filter(Boolean);
  }

  function titleCasePhrase(tokens) {
    return tokens.join(" ").replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
  }

  function extractKeywords(text, title = "") {
    const titleTokenSet = new Set(tokenize(title).filter((token) => !STOPWORDS.has(token)));
    const sourceSentences = [
      normalizeWhitespace(title),
      ...sentences(text).slice(0, 160)
    ].filter(Boolean);
    const sentenceTokens = [];
    const allTokens = [];
    let absolutePosition = 0;

    for (let sentenceIndex = 0; sentenceIndex < sourceSentences.length; sentenceIndex += 1) {
      const tokens = detailedTokens(sourceSentences[sentenceIndex], sentenceIndex, absolutePosition);
      sentenceTokens.push(tokens);
      allTokens.push(...tokens);
      absolutePosition += tokens.length;
    }

    const wordStats = new Map();
    function ensureWord(token) {
      const current = wordStats.get(token.text) || {
        text: token.text,
        count: 0,
        firstPosition: token.position,
        titleHits: 0,
        casedHits: 0,
        sentences: new Set(),
        leftContexts: new Set(),
        rightContexts: new Set()
      };
      current.count += 1;
      current.firstPosition = Math.min(current.firstPosition, token.position);
      current.titleHits += titleTokenSet.has(token.text) ? 1 : 0;
      current.casedHits += token.isProminentCase ? 1 : 0;
      current.sentences.add(token.sentenceIndex);
      wordStats.set(token.text, current);
      return current;
    }

    for (const tokens of sentenceTokens) {
      for (let index = 0; index < tokens.length; index += 1) {
        const token = tokens[index];
        if (!token.isCandidate) {
          continue;
        }
        const stat = ensureWord(token);
        for (let offset = 1; offset <= 2; offset += 1) {
          const left = tokens[index - offset];
          const right = tokens[index + offset];
          if (left && left.isCandidate) {
            stat.leftContexts.add(left.text);
          }
          if (right && right.isCandidate) {
            stat.rightContexts.add(right.text);
          }
        }
      }
    }

    const totalPositions = Math.max(1, allTokens.length - 1);
    const totalSentences = Math.max(1, sourceSentences.length);
    const wordScores = new Map();

    for (const stat of wordStats.values()) {
      const sentenceIndexes = Array.from(stat.sentences);
      const minSentence = Math.min(...sentenceIndexes);
      const maxSentence = Math.max(...sentenceIndexes);
      const sentenceSpan = maxSentence - minSentence + 1;
      const sentenceCoverage = sentenceIndexes.length / totalSentences;
      const sentenceDispersion = sentenceSpan / totalSentences;
      const contextDiversity = stat.leftContexts.size + stat.rightContexts.size;
      const frequencyFactor = 1 / Math.log2(stat.count + 2);
      const positionFactor = 0.65 + (stat.firstPosition / totalPositions);
      const titleProminence = stat.titleHits > 0 ? Math.min(1, stat.titleHits / Math.max(1, stat.count)) : 0;
      const titleFactor = titleProminence > 0 ? 0.48 / (1 + titleProminence) : 1;
      const casingProminence = stat.casedHits / Math.max(1, stat.count);
      const casingFactor = casingProminence > 0 ? 0.82 / (1 + casingProminence * 0.25) : 1;
      const sentenceFactor = 1 / Math.sqrt(sentenceIndexes.length);
      const dispersionPenalty = 1 + Math.max(0, sentenceDispersion - 0.65) * 0.45 + Math.max(0, sentenceCoverage - 0.5) * 0.35;
      const relatednessFactor = 1 + Math.min(0.7, contextDiversity / Math.max(4, stat.count * 5));
      const score = frequencyFactor * positionFactor * titleFactor * casingFactor * sentenceFactor * dispersionPenalty * relatednessFactor;
      wordScores.set(stat.text, {
        score,
        features: {
          termFrequency: stat.count,
          firstPosition: stat.firstPosition,
          titleProminence,
          casingProminence,
          sentenceDispersion,
          sentenceCoverage,
          contextDiversity
        }
      });
    }

    const phraseMap = new Map();
    for (const tokens of sentenceTokens) {
      for (let index = 0; index < tokens.length; index += 1) {
        for (let size = 1; size <= 4; size += 1) {
          const slice = tokens.slice(index, index + size);
          if (slice.length !== size) {
            continue;
          }
          if (!slice[0].isCandidate || !slice[slice.length - 1].isCandidate) {
            continue;
          }
          const candidateTokens = slice.filter((token) => token.isCandidate);
          if (!candidateTokens.length || candidateTokens.every((token) => token.text.length < 3)) {
            continue;
          }
          const key = slice.map((token) => token.text).join(" ");
          const current = phraseMap.get(key) || {
            text: key,
            count: 0,
            firstPosition: slice[0].position,
            titleHits: 0,
            casedHits: 0,
            sentences: new Set(),
            wordCount: slice.length,
            candidateWordCount: candidateTokens.length,
            internalStopwords: Math.max(0, slice.filter((token) => token.isStopword).length),
            repeatedWords: 0
          };
          current.count += 1;
          current.firstPosition = Math.min(current.firstPosition, slice[0].position);
          current.titleHits += candidateTokens.filter((token) => titleTokenSet.has(token.text)).length;
          current.casedHits += candidateTokens.filter((token) => token.isProminentCase).length;
          current.sentences.add(slice[0].sentenceIndex);
          current.repeatedWords = Math.max(current.repeatedWords, candidateTokens.length - new Set(candidateTokens.map((token) => token.text)).size);
          phraseMap.set(key, current);
        }
      }
    }

    return Array.from(phraseMap.values())
      .map((phrase) => {
        const words = phrase.text.split(" ").filter((word) => !STOPWORDS.has(word));
        const wordScoreValues = words.map((word) => wordScores.get(word)).filter(Boolean);
        const wordMean = wordScoreValues.reduce((sum, item) => sum + item.score, 0) / Math.max(1, wordScoreValues.length);
        const sentenceIndexes = Array.from(phrase.sentences);
        const sentenceSpan = Math.max(...sentenceIndexes) - Math.min(...sentenceIndexes) + 1;
        const sentenceDispersion = sentenceSpan / totalSentences;
        const sentenceCoverage = sentenceIndexes.length / totalSentences;
        const titleProminence = phrase.titleHits / Math.max(1, phrase.candidateWordCount * phrase.count);
        const casingProminence = phrase.casedHits / Math.max(1, phrase.candidateWordCount * phrase.count);
        const frequencyFactor = 1 / (1 + Math.log2(phrase.count + 1) * 0.35);
        const positionFactor = 0.7 + (phrase.firstPosition / totalPositions);
        const titleFactor = titleProminence > 0 ? 0.55 / (1 + titleProminence) : 1;
        const casingFactor = casingProminence > 0 ? 0.92 / (1 + casingProminence * 0.15) : 1;
        const dispersionPenalty = 1 + Math.max(0, sentenceDispersion - 0.7) * 0.35 + Math.max(0, sentenceCoverage - 0.4) * 0.3;
        const lengthFactor = phrase.wordCount === 1 ? 1.2 : 0.78 + Math.abs(phrase.wordCount - 2) * 0.08;
        const stopwordPenalty = 1 + phrase.internalStopwords * 0.08;
        const repetitionPenalty = 1 + phrase.repeatedWords * 0.25;
        const phraseQuality = 1 / (lengthFactor * stopwordPenalty * repetitionPenalty);
        const localScore = wordMean * frequencyFactor * positionFactor * titleFactor * casingFactor * dispersionPenalty * lengthFactor * stopwordPenalty * repetitionPenalty;
        const score = 100 / (1 + localScore * 10);
        const contextDiversity = wordScoreValues.reduce((sum, item) => sum + item.features.contextDiversity, 0);
        return {
          text: phrase.text,
          algorithm: "local-keyword",
          score,
          localScore,
          features: {
            termFrequency: phrase.count,
            firstPosition: phrase.firstPosition,
            titleProminence,
            casingProminence,
            sentenceDispersion,
            sentenceCoverage,
            contextDiversity,
            phraseQuality
          }
        };
      })
      .filter((phrase) => phrase.score > 8 && phrase.text.length <= 70)
      .sort((a, b) => b.score - a.score || a.text.length - b.text.length || a.text.localeCompare(b.text))
      .slice(0, 24);
  }

  function normalizeAnalysisStrategy(value) {
    const key = canonicalKey(value || "classifier");
    if (
      key === "classifier" ||
      key === "classifier assisted" ||
      key === "classifier-assisted" ||
      key === "local classifier" ||
      key === "local model" ||
      key === "model"
    ) {
      return "classifier";
    }
    return "classifier";
  }

  function normalizeKeywordAlgorithm(value) {
    return "local-keyword";
  }

  function extractKeywordsByAlgorithm(text, title = "") {
    return extractKeywords(text, title);
  }

  function compareKeywordAlgorithms(article) {
    const cleanText = normalizeWhitespace(article.cleanText || article.text || "");
    const title = normalizeWhitespace(article.title || "");
    return {
      localModel: extractKeywords(cleanText, title)
    };
  }

  function countOccurrences(text, phrase) {
    const pattern = new RegExp(`\\b${escapeRegExp(phrase)}\\b`, "gi");
    const matches = text.match(pattern);
    return matches ? matches.length : 0;
  }

  function createEntityStore() {
    const map = new Map();

    function add(type, text, weight = 1, alias = "") {
      const clean = normalizeWhitespace(text);
      if (!clean || clean.length < 2) {
        return;
      }
      const key = `${type}:${canonicalKey(alias || clean)}`;
      const current = map.get(key) || {
        type,
        text: clean,
        aliases: new Set(),
        count: 0,
        weight: 0
      };
      current.count += 1;
      current.weight += weight;
      if (alias) {
        current.aliases.add(alias);
      }
      map.set(key, current);
    }

    function values() {
      return Array.from(map.values()).map((entity) => ({
        type: entity.type,
        text: entity.text,
        aliases: Array.from(entity.aliases),
        count: entity.count,
        weight: entity.weight
      }));
    }

    return { add, values };
  }

  function extractKnownEntities(store, text, list, type, baseWeight = 6) {
    for (const item of list) {
      const name = Array.isArray(item) ? item[0] : item;
      const alias = Array.isArray(item) ? item[1] : "";
      const count = countOccurrences(text, name);
      if (count) {
        store.add(type, name, baseWeight + count * 2, alias);
      }
      if (alias && alias !== name) {
        const aliasCount = countOccurrences(text, alias);
        if (aliasCount) {
          store.add(type, name, baseWeight + aliasCount * 2, alias);
        }
      }
    }
  }

  function extractPatternEntities(store, text) {
    const datePattern = new RegExp(`\\b(?:${MONTHS.replace(/ /g, "|")})\\.?\\s+\\d{1,2}(?:,\\s*\\d{4})?|\\b20\\d{2}\\b`, "g");
    for (const match of text.match(datePattern) || []) {
      store.add("date", match, 4);
    }

    for (const match of text.match(/\$[A-Z]{1,5}\b|\(([A-Z]{1,5})\)/g) || []) {
      const ticker = match.replace(/[$()]/g, "");
      store.add("ticker", TICKER_ALIASES.get(ticker) || ticker, 7, ticker);
    }

    const capitalizedPattern = /\b(?:[A-Z][a-z]{2,}|[A-Z]{2,})(?:\s+(?:[A-Z][a-z]{2,}|[A-Z]{2,}|of|and|&)){0,4}\b/g;
    for (const match of text.match(capitalizedPattern) || []) {
      const clean = normalizeWhitespace(match);
      const lower = clean.toLowerCase();
      if (clean.length < 4 || STOPWORDS.has(lower) || /^\d+$/.test(clean)) {
        continue;
      }
      if (/(inc|corp|co|ltd|llc|bank|university|committee|commission|department|ministry|foundation)$/i.test(clean)) {
        store.add("organization", clean, 4);
      } else if (clean.split(/\s+/).length >= 2 && !/^(The|This|That|When|While|After|Before)\b/.test(clean)) {
        store.add("properNoun", clean, 2);
      }
    }
  }

  function extractEntities(text, title = "") {
    const combined = `${title}\n${text}`.slice(0, 30000);
    const store = createEntityStore();

    extractKnownEntities(store, combined, PEOPLE, "person", 8);
    extractKnownEntities(store, combined, COMPANIES, "company", 8);
    extractKnownEntities(store, combined, CRYPTO, "crypto", 9);
    extractKnownEntities(store, combined, COUNTRY_NAMES, "place", 7);
    extractKnownEntities(store, combined, INSTITUTIONS, "institution", 7);
    extractKnownEntities(store, combined, SPORTS, "sports", 8);
    extractPatternEntities(store, combined);

    const all = store.values().sort((a, b) => b.weight - a.weight || b.count - a.count);
    const byType = all.reduce((acc, entity) => {
      acc[entity.type] = acc[entity.type] || [];
      acc[entity.type].push(entity);
      return acc;
    }, {});

    return {
      all,
      top: all.slice(0, 12),
      people: byType.person || [],
      companies: byType.company || [],
      crypto: byType.crypto || [],
      places: byType.place || [],
      institutions: byType.institution || [],
      tickers: byType.ticker || [],
      sports: byType.sports || [],
      dates: byType.date || [],
      organizations: byType.organization || [],
      properNouns: byType.properNoun || []
    };
  }

  function classifyTopic(text, title, entities, keywords) {
    const haystack = canonicalKey(`${title} ${text.slice(0, 12000)} ${keywords.map((keyword) => keyword.text).join(" ")} ${entities.top.map((entity) => entity.text).join(" ")}`);
    const scores = {};

    for (const [topic, terms] of Object.entries(TOPIC_RULES)) {
      scores[topic] = terms.reduce((score, term) => {
        const matches = countOccurrences(haystack, canonicalKey(term));
        return score + matches * (term.includes(" ") ? 4 : 2);
      }, 0);
    }

    scores.crypto += entities.crypto.length * 10;
    scores["companies/earnings"] += entities.companies.length * 5 + entities.tickers.length * 3;
    scores.sports += entities.sports.length * 9;
    scores.geopolitics += entities.places.length * 2 + entities.institutions.filter((entity) => ["NATO", "UN", "EU"].includes(entity.text)).length * 6;
    scores["economy/markets"] += entities.institutions.filter((entity) => ["Fed", "Federal Reserve", "FOMC", "ECB", "Treasury"].includes(entity.text)).length * 8;

    const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    const [label, score] = sorted[0];
    return {
      label: score > 0 ? label : "general",
      score,
      scores
    };
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function classifierModelFromOptions(options = {}) {
    const model = options.classifierModel || FILE_CLASSIFIER_MODEL || FALLBACK_CLASSIFIER_MODEL;
    if (!model || !Array.isArray(model.labels)) {
      return FALLBACK_CLASSIFIER_MODEL;
    }
    return model;
  }

  function keywordSetForClassifier(keywords) {
    const set = new Set();
    for (const keyword of keywords || []) {
      for (const token of tokenize(keyword.text || "")) {
        set.add(token);
      }
      const key = canonicalKey(keyword.text || "");
      if (key) {
        set.add(key);
      }
    }
    return set;
  }

  function scoreClassifierTerms(terms, haystack, titleKey, keywordSet) {
    const matched = [];
    let score = 0;

    for (const rawTerm of terms || []) {
      const term = canonicalKey(rawTerm);
      if (!term || term.length < 2) {
        continue;
      }

      const occurrences = countOccurrences(haystack, term);
      const inTitle = textHasTerm(titleKey, term);
      const inKeywords = keywordSet.has(term) || tokenize(term).some((token) => keywordSet.has(token));
      if (!occurrences && !inTitle && !inKeywords) {
        continue;
      }

      const phraseWeight = term.includes(" ") ? 0.14 : 0.08;
      const cappedOccurrences = Math.min(4, occurrences);
      const termScore = cappedOccurrences * phraseWeight + (inTitle ? 0.16 : 0) + (inKeywords ? 0.08 : 0);
      score += termScore;
      matched.push({
        term: rawTerm,
        score: Number(termScore.toFixed(3)),
        title: inTitle,
        keyword: inKeywords,
        occurrences
      });
    }

    return {
      score,
      matched
    };
  }

  function scoreClassifierEntities(label, entities) {
    const weights = label.entityWeights || {};
    let score = 0;
    const matched = [];

    for (const [type, weight] of Object.entries(weights)) {
      const items = entities[type] || [];
      if (!items.length || !weight) {
        continue;
      }
      const typeScore = Math.min(0.4, items.length * weight);
      score += typeScore;
      matched.push({
        type,
        count: items.length,
        score: Number(typeScore.toFixed(3))
      });
    }

    return {
      score,
      matched
    };
  }

  function classifyMarketAngles(label, haystack, titleKey, keywordSet) {
    return (label.angles || [])
      .map((angle) => {
        const scored = scoreClassifierTerms(angle.terms || [], haystack, titleKey, keywordSet);
        return {
          label: angle.label,
          score: scored.score,
          matchedTerms: scored.matched,
          queries: angle.queries || []
        };
      })
      .filter((angle) => angle.score >= 0.12)
      .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
  }

  function classifyArticleAngle(text, title, entities, keywords, topic, options = {}) {
    const model = classifierModelFromOptions(options);
    const haystack = canonicalKey(`${title} ${text.slice(0, 16000)} ${(keywords || []).map((keyword) => keyword.text).join(" ")} ${(entities.top || []).map((entity) => entity.text).join(" ")}`);
    const titleKey = canonicalKey(title);
    const keywordSet = keywordSetForClassifier(keywords);
    const topicLabel = topic && topic.label;
    const labelScores = [];

    for (const label of model.labels) {
      const termScore = scoreClassifierTerms(label.terms || [], haystack, titleKey, keywordSet);
      const entityScore = scoreClassifierEntities(label, entities);
      const topicBoost = topicLabel === label.topic ? 0.22 : 0;
      const angles = classifyMarketAngles(label, haystack, titleKey, keywordSet);
      const angleBoost = Math.min(0.28, angles.reduce((sum, angle) => sum + angle.score, 0) * 0.25);
      const score = termScore.score + entityScore.score + topicBoost + angleBoost;

      labelScores.push({
        topic: label.topic,
        score,
        matchedTerms: termScore.matched,
        matchedEntityTypes: entityScore.matched,
        angles,
        excludeAngles: label.excludeAngles || []
      });
    }

    labelScores.sort((a, b) => b.score - a.score || a.topic.localeCompare(b.topic));
    const best = labelScores[0] || { topic: "general", score: 0, angles: [], excludeAngles: [] };
    const second = labelScores[1] || { score: 0 };
    const margin = Math.max(0, best.score - second.score);
    const strongEnough = best.score >= 0.28 || (topicLabel && topicLabel !== "general" && best.score >= 0.2);
    const confidence = strongEnough
      ? clamp(0.34 + (best.score / (best.score + 1.25)) * 0.54 + Math.min(0.12, margin * 0.16), 0.35, 0.96)
      : clamp(best.score / 0.8, 0, 0.34);
    const marketAngles = strongEnough
      ? (best.angles.length ? best.angles.map((angle) => angle.label) : ["general"])
      : [];
    const subtopics = Array.from(new Set([
      ...best.angles.flatMap((angle) => angle.matchedTerms.map((term) => canonicalKey(term.term)).filter(Boolean)),
      ...(entities.top || []).slice(0, 4).map((entity) => canonicalKey(entity.text)).filter(Boolean)
    ])).slice(0, 8);
    const relevantEntityTypes = Array.from(new Set([
      ...best.matchedEntityTypes.map((item) => item.type),
      ...(entities.top || []).slice(0, 5).map((entity) => entity.type)
    ])).slice(0, 8);
    const queryHints = Array.from(new Set(best.angles.flatMap((angle) => angle.queries || []))).slice(0, 8);

    return {
      modelVersion: model.version || "local-json-v1",
      topic: strongEnough ? best.topic : "general",
      primaryTopic: strongEnough ? best.topic : "general",
      subtopics,
      marketAngles,
      relevantEntityTypes,
      excludeAngles: best.excludeAngles || [],
      confidence: Number(confidence.toFixed(3)),
      queryHints,
      scores: Object.fromEntries(labelScores.map((item) => [item.topic, Number(item.score.toFixed(3))])),
      matchedTerms: best.matchedTerms.slice(0, 12),
      matchedEntityTypes: best.matchedEntityTypes,
      mode: options.assistive ? "assistive" : "advisory"
    };
  }

  function compactQuery(parts) {
    return normalizeWhitespace(parts.filter(Boolean).join(" "))
      .replace(/[^\w$.\s/-]/g, "")
      .slice(0, 80)
      .trim();
  }

  function stableQuoteAssetKey(entity) {
    const keys = entitySearchKeys(entity);
    if (keys.includes("tether") || keys.includes("usdt")) {
      return "usdt";
    }
    if (keys.includes("usdc")) {
      return "usdc";
    }
    return "";
  }

  function isQuoteAssetOnlyMention(entity, title, text) {
    if (!entity || entity.type !== "crypto") {
      return false;
    }
    const quote = stableQuoteAssetKey(entity);
    if (!quote) {
      return false;
    }
    if (textHasEntity(title, entity) || /\bstablecoin\b/i.test(title)) {
      return false;
    }

    const pairPattern = new RegExp(`\\b[A-Z0-9]{2,10}\\s*(?:/|-)?\\s*${quote}\\b|\\b${quote}\\s+pair\\b`, "gi");
    const stripped = String(text || "").replace(pairPattern, " ");
    return !textHasEntity(stripped, entity) && !/\bstablecoin\b/i.test(stripped);
  }

  function deriveCentralEntities(article, entities, topic, keywords) {
    const cleanText = article.cleanText || article.text || "";
    const title = article.title || "";
    const lead = cleanText.slice(0, 1400);
    const keywordText = (keywords || []).slice(0, 12).map((keyword) => keyword.text).join(" ");
    const topicLabel = topic && topic.label;
    const candidates = entities && entities.all ? entities.all : ((entities && entities.top) || []);
    const centralTypes = new Set(["crypto", "person", "company", "ticker", "institution", "sports", "place", "organization", "properNoun"]);

    return candidates
      .filter((entity) => centralTypes.has(entity.type))
      .map((entity) => {
        const inTitle = textHasEntity(title, entity);
        const inLead = textHasEntity(lead, entity);
        const inKeywords = textHasEntity(keywordText, entity);
        const quoteOnly = isQuoteAssetOnlyMention(entity, title, cleanText);
        let score = entity.weight || 0;

        if (inTitle) {
          score += 46;
        }
        if (inLead) {
          score += 16;
        }
        if (inKeywords) {
          score += 12;
        }
        if (quoteOnly) {
          score -= 70;
        }
        if (entity.type === "company" && topicLabel === "crypto" && !inTitle && !inLead) {
          score -= 24;
        }
        if (entity.type === "person" && !inTitle && !inLead) {
          score -= 18;
        }
        if (entity.type === "place" && !inTitle && !["geopolitics", "weather/climate"].includes(topicLabel)) {
          score -= 16;
        }
        if (entity.type === "properNoun" && !inTitle && !inLead) {
          score -= 14;
        }

        return {
          ...entity,
          centralityScore: Number(score.toFixed(2)),
          centrality: {
            inTitle,
            inLead,
            inKeywords,
            quoteOnly
          }
        };
      })
      .filter((entity) => !entity.centrality.quoteOnly && (
        entity.centralityScore >= 30 ||
        entity.centrality.inTitle ||
        entity.centrality.inLead ||
        entity.centrality.inKeywords
      ))
      .sort((a, b) => b.centralityScore - a.centralityScore || b.weight - a.weight || a.text.localeCompare(b.text))
      .slice(0, 12);
  }

  function addQuery(queries, value) {
    const query = compactQuery(Array.isArray(value) ? value : [value]);
    if (query.length < 3) {
      return;
    }
    const key = canonicalKey(query);
    if (!queries.some((existing) => canonicalKey(existing) === key)) {
      queries.push(query);
    }
  }

  function generateQueries(article) {
    const queries = [];
    const title = article.title || "";
    const titleKey = canonicalKey(title);
    const articleKey = canonicalKey(`${title} ${article.cleanText || article.text || ""}`);
    const keywords = article.keywords || [];
    const entities = article.entities || { top: [] };
    const centralEntities = article.centralEntities || [];
    const topEntities = (centralEntities.length ? centralEntities : (entities.top || [])).slice(0, 6);
    const cryptoEntities = topEntities.filter((entity) => entity.type === "crypto");
    const companyEntities = topEntities.filter((entity) => entity.type === "company");
    const topKeywords = keywords.slice(0, 8);
    const hasCryptoEntities = Boolean(cryptoEntities.length || (entities.crypto && entities.crypto.length));
    const topicLabel = article.topic && article.topic.label;
    const classifier = article.classifier || article.localClassifier || null;
    const classifierStrong = classifier && classifier.confidence >= 0.45 && classifier.topic && classifier.topic !== "general";
    const titleHasCryptoAngle = /\b(bitcoin|btc|ethereum|eth|crypto|token|blockchain|defi|stablecoin)\b/i.test(titleKey);
    const hasElectionLanguage = /\b(election|by-election|vote|voter|poll|campaign|ballot|primary|debate)\b/i.test(articleKey);
    const genericSoloEntities = new Set(["house", "senate", "congress", "us", "u.s.", "un", "eu"]);

    function entityAppearsInTitle(entity) {
      return textHasEntity(titleKey, entity);
    }

    function shouldUseEntityQuery(entity) {
      const inTitle = entityAppearsInTitle(entity);
      if (hasCryptoEntities && entity.type === "company" && !entityAppearsInTitle(entity)) {
        return false;
      }
      if (entity.type === "crypto" && !inTitle && !titleHasCryptoAngle) {
        return false;
      }
      if (entity.type === "person" && !inTitle) {
        return false;
      }
      if (entity.type === "place" && !inTitle && !["geopolitics", "weather/climate"].includes(topicLabel)) {
        return false;
      }
      if ((entity.type === "properNoun" || entity.type === "organization") && !inTitle) {
        return false;
      }
      if (genericSoloEntities.has(canonicalKey(entity.text))) {
        return false;
      }
      return true;
    }

    for (const cryptoEntity of cryptoEntities.filter(shouldUseEntityQuery).slice(0, 2)) {
      addQuery(queries, [cryptoEntity.text]);
      addQuery(queries, [cryptoEntity.text, "price"]);
    }

    if (entities.institutions && entities.institutions.some((entity) => /fed|fomc|federal reserve/i.test(entity.text))) {
      addQuery(queries, "Fed interest rates");
      addQuery(queries, "CPI inflation");
    }

    if (entities.people && entities.people[0] && entityAppearsInTitle(entities.people[0])) {
      addQuery(queries, [entities.people[0].text, topKeywords[0] && topKeywords[0].text]);
    }

    if (companyEntities[0] && (!hasCryptoEntities || entityAppearsInTitle(companyEntities[0]))) {
      addQuery(queries, [companyEntities[0].text, "earnings"]);
      addQuery(queries, [companyEntities[0].text, topKeywords[0] && topKeywords[0].text]);
    }

    if (entities.sports && entities.sports[0]) {
      addQuery(queries, [entities.sports[0].text, entities.sports[1] && entities.sports[1].text]);
    }

    if (classifierStrong) {
      const primaryEntity = topEntities.find((entity) => shouldUseEntityQuery(entity));
      for (const hint of (classifier.queryHints || []).slice(0, 4)) {
        addQuery(queries, [primaryEntity && primaryEntity.text, hint]);
      }
      for (const angle of (classifier.marketAngles || []).slice(0, 3)) {
        if (angle !== "general") {
          addQuery(queries, [primaryEntity && primaryEntity.text, angle]);
        }
      }
    }

    for (const entity of topEntities.filter(shouldUseEntityQuery).slice(0, 4)) {
      addQuery(queries, entity.text);
    }

    for (const keyword of topKeywords.slice(0, 5)) {
      addQuery(queries, keyword.text);
    }

    const titleTokens = tokenize(title).filter((token) => !STOPWORDS.has(token) && token.length > 2).slice(0, 5);
    if (titleTokens.length >= 2) {
      addQuery(queries, titleTokens.join(" "));
    }

    if (article.topic && article.topic.label === "geopolitics" && entities.places && entities.places[0]) {
      addQuery(queries, [entities.places[0].text, "war"]);
    }
    if (article.topic && article.topic.label === "politics/elections" && hasElectionLanguage) {
      addQuery(queries, "election");
    }

    return queries.slice(0, 9);
  }

  function analyzeArticle(article, options = {}) {
    const cleanText = normalizeWhitespace(article.cleanText || article.text || "");
    const title = normalizeWhitespace(article.title || "");
    const analysisStrategy = normalizeAnalysisStrategy(options.analysisStrategy || options.keywordAlgorithm);
    const keywordAlgorithm = normalizeKeywordAlgorithm(analysisStrategy);
    const keywords = extractKeywordsByAlgorithm(cleanText, title, keywordAlgorithm);
    const entities = extractEntities(cleanText, title);
    const topic = classifyTopic(cleanText, title, entities, keywords);
    const classifier = classifyArticleAngle(cleanText, title, entities, keywords, topic, {
      classifierModel: options.classifierModel,
      assistive: analysisStrategy === "classifier"
    });
    const enriched = {
      ...article,
      cleanText,
      text: cleanText,
      analysisStrategy,
      keywordAlgorithm,
      keywords,
      namedEntities: entities,
      entities,
      topic,
      classifier,
      localClassifier: classifier
    };
    enriched.centralEntities = deriveCentralEntities(enriched, entities, topic, keywords);
    enriched.queries = generateQueries(enriched);
    return enriched;
  }

  return {
    STOPWORDS,
    TOPIC_RULES,
    analyzeArticle,
    extractKeywords,
    extractKeywordsByAlgorithm,
    compareKeywordAlgorithms,
    normalizeAnalysisStrategy,
    normalizeKeywordAlgorithm,
    extractEntities,
    classifyTopic,
    classifyArticleAngle,
    deriveCentralEntities,
    generateQueries,
    tokenize,
    canonicalKey,
    normalizeWhitespace
  };
});
