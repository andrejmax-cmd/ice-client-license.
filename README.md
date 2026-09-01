Ice Client License API + Discord Bot
Lifetime-only licensing for Ice Client.
Discord commands
`/createkey` — owner-only, creates a Lifetime key.
`/redeemkey key:<key>` — redeems the key to the Discord account and sends the download link by DM.
Client API
`POST /api/license/activate`
```json
{
  "key": "ICE-LIFE-EXAMPLE",
  "deviceId": "installation-uuid"
}
```
The first activation binds the Lifetime key to the client's locally generated installation UUID. Later activations require the same UUID.
Render
Build Command:
`npm install`
Start Command:
`npm start`
Environment Variables
Set the values from `.env.example` in Render's Environment settings.
Never commit `DISCORD_TOKEN` or `GITHUB_TOKEN` to GitHub.
