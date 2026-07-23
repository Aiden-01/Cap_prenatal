const ipaddr = require('ipaddr.js');

function parseAllowedCidrs(value) {
  const entries = Array.isArray(value)
    ? value
    : String(value || '').split(',');

  return entries
    .map((entry) => String(entry).trim())
    .filter(Boolean)
    .map((entry) => {
      const [address, prefixLength] = ipaddr.parseCIDR(entry);
      return Object.freeze({
        source: entry,
        address,
        prefixLength,
      });
    });
}

function parseAddressCandidates(value) {
  const parsed = ipaddr.parse(String(value || '').trim());
  const candidates = [parsed];

  if (parsed.kind() === 'ipv6' && parsed.isIPv4MappedAddress()) {
    candidates.push(parsed.toIPv4Address());
  }

  return candidates;
}

function normalizedIp(value) {
  const parsed = ipaddr.process(String(value || '').trim());
  return parsed.kind() === 'ipv6' ? parsed.toNormalizedString() : parsed.toString();
}

function isIpAllowed(value, allowedCidrs) {
  let candidates;
  try {
    candidates = parseAddressCandidates(value);
  } catch {
    return false;
  }

  return allowedCidrs.some(({ address, prefixLength }) => candidates.some((candidate) => (
    candidate.kind() === address.kind() && candidate.match(address, prefixLength)
  )));
}

module.exports = {
  isIpAllowed,
  normalizedIp,
  parseAddressCandidates,
  parseAllowedCidrs,
};
