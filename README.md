# SiteAPI: any website to JSON API

Paste a URL, describe what you want in plain English, and a TinyFish web agent
does it on the live site. Save the run and you get a reusable endpoint:
`GET /v1/<name>` (use `{{param}}` in the goal for caller-supplied values,
e.g. `/v1/stock-check?product=iphone`). Add `?cached=true` for the last result.

## Run it
```bash
pip install -r requirements.txt
cp .env.example .env        # then paste your key from agent.tinyfish.ai
uvicorn main:app --reload
# open http://localhost:8000
```

## First 10 minutes
1. Run the "hacker-news-top" example chip and watch the log in the page.
2. Open the terminal running uvicorn. If the result box stays empty, the agent's
   event field names differ from my guess: look at one raw event in the log and
   adjust `RESULT_KEYS` / `FINAL_TYPES` / `LIVE_VIEW_KEYS` at the top of `main.py`.
3. Save the endpoint, then `curl http://localhost:8000/v1/hacker-news-top`.

## Demo script (2 to 3 minutes)
1. Problem: most useful sites have no API.
2. Live: build 2 endpoints on real sites, with the agent log visible.
3. Call one from curl, then one with a `{{param}}`.
4. Close: "any website is now a function call."

## If you have spare time
- Scheduled refresh + change alerts to Telegram
- Run several endpoints in parallel
- Show the live browser view if TinyFish sends a stream URL
