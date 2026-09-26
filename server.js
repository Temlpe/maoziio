/**
 * Steam 商店反代服务（Node.js 版）
 * -----------------------------------------------
 * 由 Cloudflare Worker (workers.js) 转换而来。
 * 需要 Node.js >= 18（使用内置 fetch / Headers / Request / URL）。
 *
 * 启动：npm start  或  node server.js
 * 端口：默认 8787，可用环境变量 PORT 覆盖。
 */
import http from 'node:http';

// ===================== 核心配置 =====================
const default_upstream = 'store.steampowered.com';
const default_upstream_mobile = 'store.steampowered.com';

const steamcmd_upstream = 'api.steamcmd.net';

const manifest_upstream = '20770407.xyz';
const manifest_base_path = 'kfcvme50manifest';

// ManifestDex 反代上游地址
const manifestdex_upstream = 'manifest.manifestdex.com';

const github_allowed_domains = ['github.com', 'githubusercontent.com'];

// 默认商店镜像路径映射（保持原逻辑：命中则改写 pathname）
const apiMappings = {
  '/api/storesearch': '/api/storesearch',
  '/api/appdetails': '/api/appdetails',
};

const blocked_region = ['KP', 'SY', 'PK', 'CU'];
const blocked_ip_address = [];

const https = true;

// 响应 HTML 中，把上游域名替换成自定义域名，保证页面资源可用
const replace_dict = {
  $upstream: '$custom_domain',
};

// ===================== 主逻辑 =====================
async function fetchAndApply(request) {
  const region = (request.headers.get('cf-ipcountry') || 'NULL').toUpperCase();
  const ip_address = request.headers.get('cf-connecting-ip') || '';
  const user_agent = request.headers.get('user-agent') || '';

  if (blocked_region.includes(region)) {
    return new Response('Access denied: This service is not available in your region.', { status: 403 });
  }
  if (blocked_ip_address.includes(ip_address)) {
    return new Response('Access denied: Your IP address is blocked.', { status: 403 });
  }

  let url = new URL(request.url);
  const url_hostname = url.hostname;
  url.protocol = https ? 'https' : 'http';
  let path = url.pathname;

  let upstream_domain;

  // --- GitHub 代理 ---
  if (path.startsWith('/GitHub/') || path === '/GitHub') {
    if (path === '/GitHub/' || path === '/GitHub') {
      return new Response(
        'GitHub Proxy Usage:\n' +
          '/GitHub/https://github.com/owner/repo\n' +
          '/GitHub/https://api.github.com/repos/owner/repo\n' +
          '/GitHub/https://raw.githubusercontent.com/owner/repo/branch/file\n' +
          '/GitHub/https://gist.github.com/owner/id\n' +
          '/GitHub/https://avatars.githubusercontent.com/u/ID',
        { status: 200, headers: { 'content-type': 'text/plain; charset=utf-8' } }
      );
    }

    let targetUrl = path.substring('/GitHub/'.length);
    targetUrl = targetUrl.replace(/^(https?):\/\//, '$1://');
    if (url.search) {
      targetUrl += url.search;
    }

    try {
      const parsed = new URL(targetUrl);
      const hostname = parsed.hostname.toLowerCase();
      const isAllowed = github_allowed_domains.some(
        (d) => hostname === d || hostname.endsWith('.' + d)
      );
      if (!isAllowed) {
        return new Response(
          'Access denied: Only github.com and githubusercontent.com domains are allowed.',
          { status: 403 }
        );
      }
      url = new URL(parsed.toString());
      upstream_domain = parsed.hostname;
    } catch (e) {
      return new Response(
        'Invalid URL format. Usage /GitHub/https://github.com/path',
        { status: 400 }
      );
    }
  }
  // --- ManifestDex 反代（路径前缀 /Dex，强制 User-Agent ManifestDeX1.0）---
  else if (path.startsWith('/Dex')) {
    upstream_domain = manifestdex_upstream;
    if (path === '/Dex' || path === '/Dex/') {
      url.pathname = '';
    } else {
      url.pathname = path.substring('/Dex'.length);
    }
  }
  // --- Manifest 反代 ---
  else if (path.startsWith('/Manifest')) {
    upstream_domain = manifest_upstream;
    if (path === '/Manifest' || path === '/Manifest/') {
      url.pathname = manifest_base_path;
    } else {
      const subPath = path.substring('/Manifest'.length);
      url.pathname = manifest_base_path + subPath.substring(1);
    }
  }
  // --- SteamCMD 代理 ---
  else if (path.startsWith('/steamcmd')) {
    upstream_domain = steamcmd_upstream;
    if (path === '/steamcmd') {
      url.pathname = '';
    } else {
      url.pathname = path.substring('/steamcmd'.length);
    }
  }
  // --- 默认商店镜像 ---
  else {
    const isDesktop = await isDesktopDevice(user_agent);
    upstream_domain = isDesktop ? default_upstream : default_upstream_mobile;
    url.pathname = apiMappings[path] || path;
  }

  // Node 的 URL.host 赋值会保留原端口(如 8787)，需显式清空；同时覆写上游 Host 头
  url.hostname = upstream_domain;
  url.port = '';

  try {
    const requestHeaders = new Headers(request.headers);
    if (!requestHeaders.has('referer')) {
      requestHeaders.set('referer', `https://${upstream_domain}`);
    }
    requestHeaders.set('host', upstream_domain);

    // ManifestDex 要求固定的 User-Agent
    if (upstream_domain === manifestdex_upstream) {
      requestHeaders.set('user-agent', 'ManifestDeX1.0');
    }

    // 清掉仅 Cloudflare 才有的请求头
    ['cf-connecting-ip', 'cf-ipcountry', 'cf-ray', 'cf-visitor', 'cf-request-id'].forEach((h) =>
      requestHeaders.delete(h)
    );

    const fetchOpts = {
      method: request.method,
      headers: requestHeaders,
      redirect: 'follow',
    };
    if (request.method === 'POST' || request.method === 'PUT') {
      fetchOpts.body = request.body;
    }
    const original_response = await fetch(url.toString(), fetchOpts);

    const response = new Response(original_response.body, {
      status: original_response.status,
      statusText: original_response.statusText,
      headers: original_response.headers,
    });

    const responseHeaders = response.headers;
    responseHeaders.set('access-control-allow-origin', '*');
    [
      'content-security-policy',
      'content-security-policy-report-only',
      'x-frame-options',
      'clear-site-data',
    ].forEach((h) => responseHeaders.delete(h));

    const contentType = responseHeaders.get('content-type') || '';
    if (contentType.includes('text/html') && contentType.includes('utf-8')) {
      let text = await original_response.text();
      text = await replaceResponseText(text, upstream_domain, url_hostname);
      return new Response(text, { status: response.status, headers: responseHeaders });
    }

    return response;
  } catch (error) {
    console.error('Fetch error', error);
    return new Response(`Error fetching from upstream: ${error.message}`, { status: 502 });
  }
}

async function isDesktopDevice(userAgent) {
  const mobileIndicators = [
    'Android',
    'iPhone',
    'iPod',
    'iPad',
    'Windows Phone',
    'Mobile',
    'Tablet',
    'BlackBerry',
    'Opera Mini',
    'SymbianOS',
  ];
  return !mobileIndicators.some((indicator) => userAgent.includes(indicator));
}

async function replaceResponseText(text, upstreamDomain, customDomain) {
  let replacedText = text;
  for (const [searchValue, replaceValue] of Object.entries(replace_dict)) {
    const actualSearch =
      searchValue === '$upstream'
        ? upstreamDomain
        : searchValue === '$custom_domain'
        ? customDomain
        : searchValue;
    const actualReplace =
      replaceValue === '$upstream'
        ? upstreamDomain
        : replaceValue === '$custom_domain'
        ? customDomain
        : replaceValue;
    try {
      const regex = new RegExp(actualSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
      replacedText = replacedText.replace(regex, actualReplace);
    } catch (e) {
      /* 忽略单个替换项的异常 */
    }
  }
  return replacedText;
}

// ===================== HTTP 服务入口 =====================
const PORT = process.env.PORT || 8787;

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const protocol = https ? 'https' : 'http';
    const host = req.headers.host || 'localhost';
    const url = new URL(req.url, `${protocol}://${host}`);

    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v !== undefined) headers.set(k, v);
    }

    let body = undefined;
    if (req.method === 'POST' || req.method === 'PUT') {
      body = await readBody(req);
    }

    const request = new Request(url.toString(), {
      method: req.method,
      headers,
      body,
    });

    const response = await fetchAndApply(request);

    res.writeHead(
      response.status,
      response.statusText || undefined,
      Object.fromEntries(response.headers.entries())
    );
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (err) {
    console.error('Server error', err);
    if (!res.headersSent) res.writeHead(500);
    res.end('Internal Server Error');
  }
});

server.listen(PORT, () => {
  console.log(`Steam store proxy listening on http://0.0.0.0:${PORT}`);
});
//（注：内容由AI生成）
