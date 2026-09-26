 ===================== 核心配置 =====================
const default_upstream = 'store.steampowered.com'
const default_upstream_mobile = 'store.steampowered.com'

const steamcmd_upstream = 'api.steamcmd.net'

const manifest_upstream = '20770407.xyz'
const manifest_base_path = 'kfcvme50manifest'

 ManifestDex 反代上游地址
const manifestdex_upstream = 'manifest.manifestdex.com'

const github_allowed_domains = ['github.com', 'githubusercontent.com']

const apiMappings = {
    '' 'apistoresearch',
    'apiappdetails' 'apiappdetails',
    'apistoresearch' 'apistoresearch'
}

const blocked_region = ['KP', 'SY', 'PK', 'CU']
const blocked_ip_address = []

const https = true

const replace_dict = {
    '$upstream' '$custom_domain'
}

 ===================== 主逻辑 =====================
addEventListener('fetch', event = {
    event.respondWith(fetchAndApply(event.request).catch(err = {
        console.error('Error', err)
        return new Response('Error processing request', { status 500 })
    }))
})

async function fetchAndApply(request) {
    const region = request.headers.get('cf-ipcountry').toUpperCase()  'NULL';
    const ip_address = request.headers.get('cf-connecting-ip')  '';
    const user_agent = request.headers.get('user-agent')  '';

    if (blocked_region.includes(region)) {
        return new Response('Access denied This service is not available in your region.', { status 403 });
    }
    if (blocked_ip_address.includes(ip_address)) {
        return new Response('Access denied Your IP address is blocked.', { status 403 });
    }

    let url = new URL(request.url);
    const url_hostname = url.hostname;
    url.protocol = https  'https'  'http';
    let path = url.pathname;

    let upstream_domain;

     GitHub 代理
    if (path.startsWith('GitHub')  path === 'GitHub') {
        if (path === 'GitHub'  path === 'GitHub') {
            return new Response(
                'GitHub Proxy Usagen' +
                'GitHubhttpsgithub.comownerrepon' +
                'GitHubhttpsapi.github.comreposownerrepon' +
                'GitHubhttpsraw.githubusercontent.comownerrepobranchfilen' +
                'GitHubhttpsgist.github.comowneridn' +
                'GitHubhttpsavatars.githubusercontent.comuID',
                { status 200, headers { 'content-type' 'textplain; charset=utf-8' } }
            );
        }

        let targetUrl = path.substring(8);
        targetUrl = targetUrl.replace(^(https)([^]), '$1$2');
        if (url.search) {
            targetUrl += url.search;
        }

        try {
            const parsed = new URL(targetUrl);
            const hostname = parsed.hostname.toLowerCase();
            const isAllowed = github_allowed_domains.some(d =
                hostname === d  hostname.endsWith('.' + d)
            );
            if (!isAllowed) {
                return new Response(
                    'Access denied Only github.com and githubusercontent.com domains are allowed.',
                    { status 403 }
                );
            }
            url = new URL(parsed.toString());
            upstream_domain = parsed.hostname;
        } catch (e) {
            return new Response(
                'Invalid URL format. Usage GitHubhttpsgithub.compath',
                { status 400 }
            );
        }
    }
     ManifestDex 反代（路径前缀 Dex，强制 User-Agent ManifestDeX1.0）
    else if (path.startsWith('Dex')) {
        upstream_domain = manifestdex_upstream;
        if (path === 'Dex'  path === 'Dex') {
            url.pathname = '';
        } else {
            url.pathname = path.substring('Dex'.length);
        }
    }
     Manifest 反代
    else if (path.startsWith('Manifest')) {
        upstream_domain = manifest_upstream;
        if (path === 'Manifest'  path === 'Manifest') {
            url.pathname = manifest_base_path;
        } else {
            const subPath = path.substring('Manifest'.length);
            url.pathname = manifest_base_path + subPath.substring(1);
        }
    }
     SteamCMD 代理
    else if (path.startsWith('steamcmd')) {
        upstream_domain = steamcmd_upstream;
        if (path === 'steamcmd') {
            url.pathname = '';
        } else {
            url.pathname = path.substring(9);
        }
    }
     默认商店镜像
    else {
        const isDesktop = await isDesktopDevice(user_agent);
        upstream_domain = isDesktop  default_upstream  default_upstream_mobile;
        url.pathname = apiMappings[path]  path;
    }

    url.host = upstream_domain;

    try {
        const requestHeaders = new Headers(request.headers);
        if (!requestHeaders.has('referer')) {
            requestHeaders.set('referer', `https${upstream_domain}`);
        }

         ManifestDex 要求固定的 User-Agent
        if (upstream_domain === manifestdex_upstream) {
            requestHeaders.set('user-agent', 'ManifestDeX1.0');
        }

        [
            'cf-connecting-ip',
            'cf-ipcountry',
            'cf-ray',
            'cf-visitor',
            'cf-request-id'
        ].forEach(h = requestHeaders.delete(h));

        const fetchOpts = {
            method request.method,
            headers requestHeaders,
            redirect 'follow'
        };
        if (request.method === 'POST'  request.method === 'PUT') {
            fetchOpts.body = request.body;
        }
        const original_response = await fetch(url.toString(), fetchOpts);

        const response = new Response(original_response.body, {
            status original_response.status,
            statusText original_response.statusText,
            headers original_response.headers
        });

        const responseHeaders = response.headers;
        responseHeaders.set('access-control-allow-origin', '');
        [
            'content-security-policy',
            'content-security-policy-report-only',
            'x-frame-options',
            'clear-site-data'
        ].forEach(h = responseHeaders.delete(h));

        const contentType = responseHeaders.get('content-type')  '';
        if (contentType.includes('texthtml') && contentType.includes('utf-8')) {
            let text = await original_response.text();
            text = await replaceResponseText(text, upstream_domain, url_hostname);
            return new Response(text, { status response.status, headers responseHeaders });
        }

        return response;
    } catch (error) {
        console.error('Fetch error', error);
        return new Response(`Error fetching from upstream ${error.message}`, { status 502 });
    }
}

async function isDesktopDevice(userAgent) {
    const mobileIndicators = [
        'Android', 'iPhone', 'iPod', 'iPad',
        'Windows Phone', 'Mobile', 'Tablet',
        'BlackBerry', 'Opera Mini', 'SymbianOS'
    ];
    return !mobileIndicators.some(indicator = userAgent.includes(indicator));
}

async function replaceResponseText(text, upstreamDomain, customDomain) {
    let replacedText = text;
    for (const [searchValue, replaceValue] of Object.entries(replace_dict)) {
        let actualSearch = searchValue === '$upstream'  upstreamDomain 
                           searchValue === '$custom_domain'  customDomain  searchValue;
        let actualReplace = replaceValue === '$upstream'  upstreamDomain 
                            replaceValue === '$custom_domain'  customDomain  replaceValue;
        try {
            const regex = new RegExp(actualSearch.replace([.+^${}()[]]g, '$&'), 'g');
            replacedText = replacedText.replace(regex, actualReplace);
        } catch (e) {}
    }
    return replacedText;
}