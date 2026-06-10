import type { NextApiRequest, NextApiResponse } from 'next'
import axios, { Method } from 'axios'
import { NextResponse } from 'next/server'
import { getPublicEnv } from 'config/publicEnv'

const PUBLIC_GET_PATHS = new Set(['/settings', '/settings/logo', '/registry'])

export const config = {
  api: {
    bodyParser: false, // stream
    responseLimit: false
  },
}

function getPathSegments(req: NextApiRequest): string[] {
  const raw = req.query.path
  if (!raw) return []
  return Array.isArray(raw) ? raw : [raw]
}

function buildTargetUrl(req: NextApiRequest, base: string): string {
  const segments = getPathSegments(req)
  const cleanBase = base.replace(/\/+$/, '')
  const path = segments.map(encodeURIComponent).join('/')
  const url = new URL(`${cleanBase}/${path}`)
  
  // copy querystring except the catch-all param
  for (const [k, v] of Object.entries(req.query)) {
    if (k === 'path') continue
    if (Array.isArray(v)) for (const item of v) url.searchParams.append(k, String(item))
    else url.searchParams.append(k, String(v))
  }
  return url.toString()
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const apiBase = getPublicEnv().NEXT_PUBLIC_BASE_SERVER_URL
    if (!apiBase) {
      res.status(500).json({ error: 'Missing API_BASE' })
      return
    }

    const segments = getPathSegments(req)
    const path = `/${segments.join('/')}`
    const method = ((req.method || 'GET').toUpperCase()) as Method
    const isPublic = (method === 'GET' || method === 'HEAD') && PUBLIC_GET_PATHS.has(path)

    const url = buildTargetUrl(req, apiBase)

    const headers: Record<string, string> = {}

    // Forward user session token for downstream identity/authorization
    const authHeader = req.headers['authorization']
    const fwdAuth = Array.isArray(authHeader) ? authHeader[0] : authHeader
    // Optional alternative header name support
    const userTokenHeader = req.headers['x-user-token']
    const userToken = Array.isArray(userTokenHeader) ? userTokenHeader[0] : userTokenHeader

    if (!isPublic && !fwdAuth && !userToken) {
      res.status(401).json({ error: 'Missing bearer token' })
      return
    }

    if (typeof fwdAuth === 'string' && fwdAuth) headers['Authorization'] = fwdAuth
    if (typeof userToken === 'string' && userToken) headers['X-User-Token'] = userToken

    const mode = req.headers['sec-fetch-mode'] // 'navigate' for address bar
    const dest = req.headers['sec-fetch-dest'] // 'document' for pages
    console.log(mode,dest, (mode === 'navigate' || dest === 'document'))
    if (mode === 'navigate' || dest === 'document') {
      return new NextResponse('Forbidden', { status: 403 })
    }
    
    const ct = req.headers['content-type']
    if (ct && !['GET','HEAD'].includes(method))
      headers['Content-Type'] = String(ct)

    // Forward Content-Length so the upstream receives a fixed-length body instead
    // of a chunked stream — this lets the backend reject oversized uploads cleanly
    // (413) rather than stalling the connection.
    const cl = req.headers['content-length']
    if (cl && !['GET', 'HEAD'].includes(method))
      headers['Content-Length'] = String(cl)
    
    const accept = req.headers['accept']; if (accept) headers['Accept'] = String(accept)
    
    // stream upload body
    const data = (method === 'GET' || method === 'HEAD') ? undefined : (req as any)

    const upstream = await axios({
      url,
      method,
      headers,
      data,
      responseType: 'stream',
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      validateStatus: () => true, // forward status code
    })

    // mirror status & headers
    res.status(upstream.status)
    for (const [key, value] of Object.entries(upstream.headers)) {
      const k = key.toLowerCase()
      
      if (k === 'transfer-encoding' || k === 'content-encoding') continue
      
      if (typeof value === 'string') res.setHeader(key, value)
      else if (Array.isArray(value)) res.setHeader(key, value)
    }

    // stream response back
    ;(upstream.data as NodeJS.ReadableStream).pipe(res)

  } catch (e: any) {
    res.status(e?.response?.status || 502).json({
      error: 'Proxy error',
      detail: e?.message || String(e),
      upstreamStatus: e?.response?.status,
    })
  }
}
