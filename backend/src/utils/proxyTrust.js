const {
  isIpAllowed,
  parseAllowedCidrs,
} = require('./ipAllowlist');

function createStrictTrustProxy(allowedCidrs = []) {
  const parsedCidrs = parseAllowedCidrs(allowedCidrs);

  return (address) => isIpAllowed(address, parsedCidrs);
}

module.exports = {
  createStrictTrustProxy,
};
