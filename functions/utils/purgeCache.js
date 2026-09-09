import { fetchOthersConfig } from "./sysConfig";

let othersConfig = {};
let cfZoneId = "";
let cfEmail = "";
let cfApiKey = "";

export async function purgeCFCache(env, cdnUrl) {
    try {
        // 读取其他设置
        othersConfig = await fetchOthersConfig(env);
        cfZoneId = othersConfig.cloudflareApiToken.CF_ZONE_ID;
        cfEmail = othersConfig.cloudflareApiToken.CF_EMAIL;
        cfApiKey = othersConfig.cloudflareApiToken.CF_API_KEY;

        // 如果没有配置Cloudflare API，跳过缓存清除
        if (!cfZoneId || !cfEmail || !cfApiKey) {
            return;
        }

        // 清除CDN缓存
        const options = {
            method: 'POST',
            headers: {'Content-Type': 'application/json', 'X-Auth-Email': `${cfEmail}`, 'X-Auth-Key': `${cfApiKey}`},
            body: `{"files":["${ cdnUrl }"]}`
        };
        await fetch(`https://api.cloudflare.com/client/v4/zones/${ cfZoneId }/purge_cache`, options);
    } catch (error) {
        console.error('Failed to purge CF cache:', error.message || error);
    }
}

// 尽力清除边缘节点(caches.default)中指定 URL 的缓存，不依赖 Cloudflare API Token
// 注意：这只能清除 Worker 数据中心级缓存，浏览器/客户端本地缓存仍需靠 no-store 响应头避免
export async function purgeEdgeCache(cdnUrl) {
    try {
        if (typeof caches === 'undefined' || !caches.default) {
            return;
        }
        // cache.delete 在部分运行时有兼容问题，写入一个 max-age=0 的响应使其立即过期
        const expiredResponse = new Response(null, {
            headers: { 'Cache-Control': 'max-age=0' },
        });
        await caches.default.put(cdnUrl, expiredResponse);
    } catch (error) {
        console.error('Failed to purge edge cache:', error.message || error);
    }
}

export async function purgePublicFileListCache(origin, ...dirs) {
    try {
        if (typeof caches === 'undefined' || !caches.default) {
            return;
        }
        const cache = caches.default;
        // cache.delete有bug，通过写入一个max-age=0的response来清除缓存
        const nullResponse = new Response(null, {
            headers: { 'Cache-Control': 'max-age=0' },
        });

        for (const dir of dirs) {
            // 清除递归和非递归两种缓存
            await cache.put(`${origin}/api/publicFileList?dir=${dir}&recursive=false`, nullResponse);
            await cache.put(`${origin}/api/publicFileList?dir=${dir}&recursive=true`, nullResponse);
        }
    } catch (error) {
        console.error('Failed to clear publicFileList cache:', error);
    }
}