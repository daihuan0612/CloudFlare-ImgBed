/**
 * 远程资源代理读取 API
 * 负责在鉴权后拉取请求体中指定 URL 的资源并透传响应内容
 */
import { dualAuthCheck } from '../utils/auth/dualAuth.js';
// SSRF 防护：仅允许 http/https，拒绝内网/回环/链路本地地址
const HOP_BY_HOP_HEADERS = [
    'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
    'te', 'trailer', 'transfer-encoding', 'upgrade',
];

function validateProxyUrl(raw) {
    let url;
    try {
        url = new URL(raw);
    } catch {
        return 'invalid url';
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        return 'protocol not allowed';
    }
    const host = url.hostname.toLowerCase();
    if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
        const a = host.split('.').map(Number)[0];
        const parts = host.split('.').map(Number);
        if (
            a === 0 || a === 10 || a === 127 ||
            (a === 169 && parts[1] === 254) ||
            (a === 172 && parts[1] >= 16 && parts[1] <= 31) ||
            (a === 192 && parts[1] === 168) ||
            a >= 224
        ) {
            return 'private/internal ip';
        }
    } else if (host === 'localhost' || host === '::1' || host === '0.0.0.0') {
        return 'local host';
    }
    return '';
}


export async function onRequest(context) {
    // 获取请求体中URL的内容
    const {
        request,
        env,
        params,
        waitUntil,
        next,
        data
    } = context;

    // 双重鉴权检查
    const url = new URL(request.url);
    const { authorized } = await dualAuthCheck(env, url, request);
    if (!authorized) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    const jsonRequest = await request.json();
    const targetUrl = jsonRequest.url;
    if (targetUrl === undefined) {
        return new Response('URL is required', { status: 400 })
    }
    const blockReason = validateProxyUrl(targetUrl);
    if (blockReason) {
        return new Response(JSON.stringify({ error: 'blocked: ' + blockReason }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        });
    }
    const response = await fetch(targetUrl);
    const headers = new Headers(response.headers);
    HOP_BY_HOP_HEADERS.forEach((h) => headers.delete(h));
    return new Response(response.body, {
        headers: headers
    })
}
