---
name: news-aggregator
description: "Comprehensive news aggregator that fetches, filters, and deeply analyzes real-time content from 8 major sources: Hacker News, GitHub Trending, Product Hunt, 36Kr, Tencent News, WallStreetCN, V2EX, and Weibo. Best for 'daily scans', 'tech news briefings', 'finance updates', and 'deep interpretations' of hot topics."
---

# News Aggregator Skill

Fetch real-time hot news from multiple sources.

## Tools

### fetch_news.py

**Usage:**

```bash
# Single Source (Limit 10)
python3 scripts/fetch_news.py --source hackernews --limit 10

# Global Scan - Broad Fetch Strategy (catches all trends)
python3 scripts/fetch_news.py --source all --limit 15 --deep

# Single Source with Keyword Expansion
python3 scripts/fetch_news.py --source hackernews --limit 20 --keyword "AI,LLM,GPT,DeepSeek,Agent" --deep

# Specific Keyword Search
python3 scripts/fetch_news.py --source all --limit 10 --keyword "DeepSeek" --deep
```

**Arguments:**

- `--source`: `hackernews`, `weibo`, `github`, `36kr`, `producthunt`, `v2ex`, `tencent`, `wallstreetcn`, `all`
- `--limit`: Max items per source (default 10)
- `--keyword`: Comma-separated filters (e.g. "AI,GPT")
- `--deep`: Enable deep fetching. Downloads and extracts main text content of articles.

**Output:**
JSON array. If `--deep` is used, items contain a `content` field.

## Smart Keyword Expansion (CRITICAL)

User simple keywords MUST be automatically expanded to cover the entire domain field:
- User: "AI" → Agent uses: `--keyword "AI,LLM,GPT,Claude,Generative,Machine Learning,RAG,Agent"`
- User: "Android" → Agent uses: `--keyword "Android,Kotlin,Google,Mobile,App"`
- User: "Finance" → Agent uses: `--keyword "Finance,Stock,Market,Economy,Crypto,Gold"`

## Smart Time Filtering & Reporting

If user requests a specific time window and results are sparse (< 5 items):
1. **Prioritize User Window**: List all items that strictly fall within requested time
2. **Smart Fill**: Include high-value/high-heat items from wider range (e.g. past 24h)
3. **Annotation**: Mark older items clearly (e.g. "⚠️ 18h ago", "🔥 24h Hot")
4. **High Value**: Always prioritize "SOTA", "Major Release", or "High Heat" items

### GitHub Trending Exception
For GitHub Trending, strictly return valid items from fetched list. **List ALL fetched items**. Do **NOT** perform "Smart Fill".
- **Deep Analysis Required**: For EACH item, analyze:
  - **Core Value**: What specific problem does it solve? Why is it trending?
  - **Inspiration**: What technical or product insights can be drawn?
  - **Scenarios**: 3-5 keywords (e.g. `#RAG #LocalFirst #Rust`)

## Response Guidelines

**Format & Style:**
- **Language**: Simplified Chinese (简体中文)
- **Style**: Magazine/Newsletter style. Professional, concise, engaging.
- **Structure**:
  - **Global Headlines**: Top 3-5 most critical stories
  - **Tech & AI**: Specific section for AI, LLM, Tech items
  - **Finance / Social**: Other strong categories if relevant

**Item Format:**
- **Title**: **MUST be a Markdown Link** to original URL
  - ✅ Correct: `### 1. [OpenAI Releases GPT-5](https://...)`
  - ❌ Incorrect: `### 1. OpenAI Releases GPT-5`
- **Metadata Line**: Source, **Time/Date**, Heat/Score
- **1-Liner Summary**: Punchy "so what?" summary
- **Deep Interpretation (Bulleted)**: 2-3 bullets explaining why it matters (required for "Deep Scan")

## Output Artifact

Always save the full report to `reports/` directory with timestamped filename:
```
reports/hn_news_YYYYMMDD_HHMM.md
```

Present the full report content to the user in chat.
