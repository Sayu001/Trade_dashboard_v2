# Trade dashboard (Next.js -> Vercel), now on the "100k funded account" Notion database
1. notion.so/profile/integrations -> internal integration -> copy the secret. Open "100k funded account" in Notion -> ... -> Connections -> add that integration.
2. Vercel -> your project -> Settings -> Environment Variables: set NOTION_TOKEN, NOTION_DS_ID (8cf9975a-11dd-48c8-a6ac-3580b12d76b8), ACCOUNT_SIZE, DASH_USER, DASH_PASS.
3. Push these files to your GitHub repo (replace the old ones) and Vercel redeploys. Press Sync on the site.
