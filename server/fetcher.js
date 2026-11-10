// Fetching pages and images for recipe import. Only public internet addresses
// are allowed, so the import box cannot be used to poke at devices on the LAN.
import dns from 'node:dns/promises';
import net from 'node:net';

const blocked = new net.BlockList();
for (const [prefix, bits] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.168.0.0', 16],
  ['224.0.0.0', 3],
]) {
  blocked.addSubnet(prefix, bits, 'ipv4');
}
for (const [prefix, bits] of [
  ['::', 127],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
]) {
  blocked.addSubnet(prefix, bits, 'ipv6');
}

function isBlockedAddress(address, family) {
  if (family === 6) {
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
    if (mapped) return blocked.check(mapped[1], 'ipv4');
    return blocked.check(address, 'ipv6');
  }
  return blocked.check(address, 'ipv4');
}

async function assertPublic(url) {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Only http and https links can be imported.');
  }
  if (process.env.ALLOW_PRIVATE_IMPORT === 'true') return;
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = net.isIP(host)
    ? [{ address: host, family: net.isIP(host) }]
    : await dns.lookup(host, { all: true }).catch(() => {
        throw new Error(`Could not find ${host}.`);
      });
  if (!addresses.length || addresses.some((a) => isBlockedAddress(a.address, a.family))) {
    throw new Error('That address is on a private network and cannot be imported.');
  }
}

/** GET a public URL, following redirects by hand so every hop is checked. */
export async function fetchPublic(rawUrl, { maxBytes, accept }) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('That does not look like a valid link.');
  }

  for (let hop = 0; hop < 6; hop++) {
    await assertPublic(url);
    const response = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(15000),
      headers: {
        Accept: accept,
        'Accept-Language': 'en-US,en;q=0.9',
        'User-Agent':
          'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
      },
    });

    if (response.status >= 300 && response.status < 400 && response.headers.get('location')) {
      url = new URL(response.headers.get('location'), url);
      continue;
    }
    if (!response.ok) {
      throw new Error(`The site answered with an error (${response.status}).`);
    }

    const chunks = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > maxBytes) throw new Error('That file is too large to import.');
      chunks.push(chunk);
    }
    return {
      body: Buffer.concat(chunks),
      contentType: response.headers.get('content-type') || '',
      url: url.href,
    };
  }
  throw new Error('Too many redirects.');
}
