# Ice Client License API

Lifetime-only license activation API for the Ice Client.

## Render

- Runtime: Node
- Build Command: `npm install`
- Start Command: `npm start`

The server listens on Render's `PORT` and binds to `0.0.0.0`.

## API

`POST /api/license/activate`

Body:

```json
{
  "key": "ICE-LIFE-EXAMPLE",
  "deviceId": "installation-uuid"
}
```

A valid redeemed lifetime key is bound to the first installation UUID that activates it.

## Important

Do not put Discord tokens, GitHub tokens, or API secrets into this repository.
Use Render Environment Variables for secrets.

`licenses.json` is included as the local data file. For production persistence on Render, use a database or a server-side GitHub sync mechanism; Render's local filesystem is not durable across all redeploys/restarts.
