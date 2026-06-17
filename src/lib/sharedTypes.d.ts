export type PMArticleSource = "readability" | "semantic" | "selection";

export type PMJsonPrimitive = null | boolean | number | string;
export type PMJsonValue = PMJsonPrimitive | PMJsonObject | PMJsonValue[];
export interface PMJsonObject {
  [key: string]: PMJsonValue;
}

export type PMScoreMap = Record<string, number>;
export type PMMatchTier = "strong" | "maybe" | "reject";

export interface PMArticleHeading {
  level: number;
  text: string;
}

export interface PMArticleMetadata {
  title: string;
  description: string;
  byline: string;
  publishedTime: string;
  siteName: string;
  canonicalUrl: string;
}

export interface PMArticleInput {
  title?: string;
  text?: string;
  cleanText?: string;
  excerpt?: string;
  byline?: string;
  siteName?: string;
  publishedTime?: string;
  canonicalUrl?: string;
  headings?: PMArticleHeading[];
  metadata?: PMArticleMetadata;
  selectionText?: string;
  wordCount?: number;
}

export interface PMUnreadableArticle {
  readable: false;
  error: string;
  title?: string;
  headings?: PMArticleHeading[];
  metadata?: PMArticleMetadata;
}

export interface PMReadableArticle {
  readable: true;
  source: PMArticleSource;
  title?: string;
  cleanText: string;
  text: string;
  excerpt: string;
  byline: string;
  siteName: string;
  publishedTime: string;
  canonicalUrl: string;
  headings: PMArticleHeading[];
  metadata: PMArticleMetadata;
  selectionText: string;
  wordCount: number;
}

export type PMExtractedArticle = PMReadableArticle | PMUnreadableArticle;

export interface PMKeywordFeatures {
  termFrequency: number;
  firstPosition: number;
  titleProminence: number;
  casingProminence: number;
  sentenceDispersion: number;
  sentenceCoverage: number;
  contextDiversity: number;
  phraseQuality?: number;
}

export interface PMKeyword {
  text: string;
  algorithm?: string;
  score?: number;
  localScore?: number;
  features?: PMKeywordFeatures;
}

export interface PMEntityCentrality {
  inTitle?: boolean;
  inLead?: boolean;
  inKeywords?: boolean;
  quoteOnly?: boolean;
}

export interface PMEntity {
  type: string;
  text: string;
  aliases?: string[];
  count?: number;
  weight?: number;
  centralityScore?: number;
  centrality?: PMEntityCentrality;
}

export interface PMEntityGroups {
  all?: PMEntity[];
  top?: PMEntity[];
  crypto?: PMEntity[];
  companies?: PMEntity[];
  tickers?: PMEntity[];
  people?: PMEntity[];
  institutions?: PMEntity[];
  sports?: PMEntity[];
  places?: PMEntity[];
  organizations?: PMEntity[];
  properNouns?: PMEntity[];
}

export interface PMTopicSummary {
  label: string;
  score?: number;
  scores?: PMScoreMap;
}

export interface PMClassifierMatchedTerm {
  term: string;
  score: number;
  title?: boolean;
  keyword?: boolean;
  occurrences?: number;
}

export interface PMClassifierMatchedEntityType {
  type: string;
  count: number;
  score: number;
}

export interface PMClassifierResult {
  modelVersion: string;
  topic: string;
  primaryTopic: string;
  subtopics: string[];
  marketAngles: string[];
  relevantEntityTypes: string[];
  excludeAngles: string[];
  confidence: number;
  queryHints: string[];
  scores: PMScoreMap;
  matchedTerms: PMClassifierMatchedTerm[];
  matchedEntityTypes: PMClassifierMatchedEntityType[];
  mode: "assistive" | "advisory";
}

export interface PMClassifierAngleDefinition {
  label: string;
  terms: string[];
  queries?: string[];
}

export interface PMClassifierLabelDefinition {
  topic: string;
  terms: string[];
  entityWeights?: Record<string, number>;
  angles?: PMClassifierAngleDefinition[];
  excludeAngles?: string[];
}

export interface PMClassifierModel {
  version?: string;
  labels: PMClassifierLabelDefinition[];
}

export interface PMAnalyzedArticle {
  title?: string;
  cleanText: string;
  text: string;
  analysisStrategy: string;
  keywordAlgorithm: string;
  keywords: PMKeyword[];
  namedEntities: PMEntityGroups;
  entities: PMEntityGroups;
  topic: PMTopicSummary;
  classifier: PMClassifierResult;
  centralEntities: PMEntity[];
  queries: string[];
  excerpt?: string;
  byline?: string;
  siteName?: string;
  publishedTime?: string;
  canonicalUrl?: string;
  headings?: PMArticleHeading[];
  metadata?: PMArticleMetadata;
  selectionText?: string;
  wordCount?: number;
}

export interface PMMovement {
  direction: "up" | "down" | "flat" | "unknown";
  value: number | null;
}

export interface PMOutcomeOption {
  label: string;
  price: number | null;
  percent: number | null;
  clobTokenId?: string;
}

export interface PMScoreBreakdown {
  entities: number;
  keywords: number;
  overlap: number;
  topic: number;
  classifier: number;
  classifierPenalty: number;
  classifierAngleHits: number;
  classifierExcludeHits: number;
  relevanceGate: number;
  relevanceGateCap: number | null;
  relevanceGateReasons: string[];
  candidateAngles: string[];
  centralEntityHits: string[];
  quality: number;
  trending: number;
  topicMismatch: number;
  strictTopicPenalty: number;
  speechPenalty: number;
  productSpecificityPenalty: number;
  placeOnlyPenalty: number;
  weakMatchPenalty: number;
}

export interface PMMarketCandidate {
  id: string;
  conditionId?: string;
  eventId?: string;
  type?: string;
  slug?: string;
  eventSlug?: string;
  title?: string;
  eventTitle?: string;
  groupItemTitle?: string;
  description?: string;
  category?: string;
  tags?: string[];
  coin?: string;
  symbol?: string;
  image?: string;
  url?: string;
  displayValue?: string;
  displayDetail?: string;
  marketSource?: string;
  sourceLabel?: string;
  source?: string;
  active?: boolean;
  closed?: boolean;
  unavailable?: boolean;
  volume?: number | null;
  volume24hr?: number | null;
  volume1wk?: number | null;
  liquidity?: number | null;
  traderCount?: number | null;
  traderCountCapped?: boolean;
  traderCountSource?: string;
  endDate?: string;
  movement?: PMMovement;
  sourceQueries?: string[];
  raw?: PMJsonObject;
  event?: PMJsonObject;
  outcomes?: string[];
  outcomePrices?: Array<number | null>;
  clobTokenIds?: string[];
  outcomeOptions?: PMOutcomeOption[];
  primaryOutcome?: string;
  secondaryOutcome?: string;
  primaryPrice?: number | null;
  secondaryPrice?: number | null;
  yesPrice?: number | null;
  noPrice?: number | null;
  upPrice?: number | null;
  downPrice?: number | null;
  primaryPercent?: number | null;
  confidence?: number | null;
  matchTier?: PMMatchTier;
  scoreBreakdown?: PMScoreBreakdown;
}

export interface PMMarketGroup {
  id: string;
  eventId?: string;
  eventSlug?: string;
  title?: string;
  eventTitle?: string;
  groupItemTitle?: string;
  type?: string;
  coin?: string;
  symbol?: string;
  image?: string;
  url?: string;
  displayValue?: string;
  displayDetail?: string;
  marketSource?: string;
  sourceLabel?: string;
  source?: string;
  confidence?: number | null;
  parentConfidence?: number | null;
  matchTier?: PMMatchTier;
  parentScoreBreakdown?: PMScoreBreakdown | null;
  markets: PMMarketCandidate[];
  volume?: number | null;
  volume24hr?: number | null;
  volume1wk?: number | null;
  liquidity?: number | null;
  traderCount?: number | null;
  traderCountCapped?: boolean;
  traderCountSource?: string;
  movement?: PMMovement;
  outcomeOptions?: PMOutcomeOption[];
  primaryOutcome?: string;
  secondaryOutcome?: string;
  primaryPrice?: number | null;
  secondaryPrice?: number | null;
  primaryPercent?: number | null;
  sourceQueries?: string[];
  raw?: PMJsonObject;
  event?: PMJsonObject;
  category?: string;
  tags?: string[];
  endDate?: string;
}
