#!/usr/bin/env node
/**
 * Everygen OAuth token helper for the dsh MCP client.
 *
 * Everygen's MCP endpoint (https://everygen.ai/api/mcp) authenticates with an
 * OAuth bearer token issued by viewmax.io. It has no dashboard API-key page;
 * Claude/ChatGPT/Cursor connect through an OAuth flow. This script runs that
 * same flow for a custom client:
 *
 *   node everygen-auth.mjs login    # one-time: register + browser login + save tokens
 *   node everygen-auth.mjs refresh  # later: exchange the refresh token for a new access token
 *
 * Tokens are saved to ~/.everygen/tokens.json (outside this repo; it holds
 * secrets). The MCP bundle reads the access token from that file when it starts.
 *
 * Uses only Node built-ins (no npm installs).
 */
import { createHash, randomBytes } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'

const runFile = promisify(execFile)

const ISSUER = 'https://www.viewmax.io'
const AUTHORIZE = `${ISSUER}/api/auth/mcp/authorize`
const TOKEN = `${ISSUER}/api/auth/mcp/token`
const REGISTER = `${ISSUER}/api/auth/mcp/register`
const RESOURCE = 'https://everygen.ai/api/mcp'
const REDIRECT = 'http://127.0.0.1:8765/callback'
const PORT = 8765
const SCOPES = 'openid profile email offline_access media:upload image:generate video:generate voice:change voiceover:generate audio:generate generation:read'
const TOKEN_FILE = path.join(os.homedir(), '.everygen', 'tokens.json')

const b64url = (buf) => buf.toString('base64url')

async function registerClient() {
  const res = await fetch(REGISTER, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      client_name: 'dsh-viralclip (local MCP bridge)',
      redirect_uris: [REDIRECT],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      scope: SCOPES,
    }),
  })
  if (!res.ok) {
    throw new Error(`Dynamic client registration failed: HTTP ${res.status}\n${await res.text()}\n` +
      'If registration is closed, ask Everygen support for an API key or a manually registered client_id.')
  }
  const meta = await res.json()
  if (!meta.client_id) throw new Error(`Registration returned no client_id: ${JSON.stringify(meta)}`)
  return meta
}

function waitForCallback(state) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, REDIRECT)
      if (url.pathname !== '/callback') { res.writeHead(404).end(); return }
      const error = url.searchParams.get('error')
      const code = url.searchParams.get('code')
      const returnedState = url.searchParams.get('state')
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end(error
        ? `<h2>Login failed: ${error}</h2><script>setTimeout(close,4000)</script>`
        : '<h2>Everygen login complete — you can close this tab.</h2><script>setTimeout(close,1500)</script>')
      server.close()
      if (error) return reject(new Error(`Authorization failed: ${error} (${url.searchParams.get('error_description') ?? 'no details'})`))
      if (returnedState !== state) return reject(new Error('State mismatch — aborting (possible CSRF). Run the script again.'))
      if (!code) return reject(new Error('No authorization code in callback.'))
      resolve(code)
    })
    server.on('error', (err) => reject(new Error(`Cannot listen on ${REDIRECT} (is port ${PORT} busy?): ${err.message}`)))
    server.listen(PORT, '127.0.0.1', () => console.log(`Waiting for login on ${REDIRECT} ...`))
  })
}

async function exchange(body) {
  const res = await fetch(TOKEN, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`Token exchange failed: HTTP ${res.status}\n${text}`)
  return JSON.parse(text)
}

function save(record) {
  fs.mkdirSync(path.dirname(TOKEN_FILE), { recursive: true })
  fs.writeFileSync(TOKEN_FILE, JSON.stringify(record, null, 2), { mode: 0o600 })
}

async function announce(tokens) {
  const expires = tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000).toISOString() : 'unknown'
  console.log(`\nAccess token received (expires: ${expires}).`)
  console.log(`Tokens saved to ${TOKEN_FILE}`)
  console.log('Restart or reload the MCP bundle to make it read the fresh token.')
  if (!tokens.refresh_token) {
    console.log('\nNOTE: no refresh token was issued. When the access token expires, run "login" again.')
  } else {
    console.log('\nLater, when the token expires, refresh without logging in again:')
    console.log('  node everygen-auth.mjs refresh')
  }
}

async function login() {
  console.log('Registering this machine as an OAuth client with Everygen (viewmax.io) ...')
  const client = await registerClient()
  console.log(`Registered client_id: ${client.client_id}`)

  const verifier = b64url(randomBytes(48))
  const challenge = b64url(createHash('sha256').update(verifier).digest())
  const state = b64url(randomBytes(16))
  const url = new URL(AUTHORIZE)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', client.client_id)
  url.searchParams.set('redirect_uri', REDIRECT)
  url.searchParams.set('scope', SCOPES)
  url.searchParams.set('state', state)
  url.searchParams.set('code_challenge', challenge)
  url.searchParams.set('code_challenge_method', 'S256')
  url.searchParams.set('resource', RESOURCE)

  console.log('\nOpening your browser — log in to Everygen and approve access.')
  console.log(`(If it does not open, paste this URL into a browser:\n${url.toString()})\n`)
  const opener = process.platform === 'win32' ? ['cmd.exe', ['/c', 'start', '', url.toString()]]
    : process.platform === 'darwin' ? ['open', [url.toString()]]
    : process.platform === 'linux' ? ['xdg-open', [url.toString()]] : undefined
  if (opener) {
    try { await runFile(opener[0], opener[1]) }
    catch (error) { console.warn(`Could not open browser automatically: ${error.message}; open the URL above manually.`) }
  } else console.log('Open the URL above in a browser on this system.')

  const code = await waitForCallback(state)
  console.log('Authorization code received; exchanging for tokens ...')
  const tokens = await exchange({
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT,
    client_id: client.client_id,
    code_verifier: verifier,
  })
  save({ client_id: client.client_id, saved_at: new Date().toISOString(), ...tokens })
  await announce(tokens)
}

async function refresh() {
  if (!fs.existsSync(TOKEN_FILE)) {
    throw new Error(`No tokens at ${TOKEN_FILE} — run "node everygen-auth.mjs login" first.`)
  }
  const saved = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'))
  if (!saved.refresh_token) throw new Error('Saved tokens include no refresh_token — run "login" again.')
  console.log('Refreshing tokens ...')
  const tokens = await exchange({
    grant_type: 'refresh_token',
    refresh_token: saved.refresh_token,
    client_id: saved.client_id,
  })
  save({ ...saved, ...tokens, saved_at: new Date().toISOString() })
  await announce(tokens)
}

const command = process.argv[2] ?? 'login'
if (command === 'login') await login()
else if (command === 'refresh') await refresh()
else {
  console.error('Usage: node everygen-auth.mjs [login|refresh]')
  process.exit(1)
}
