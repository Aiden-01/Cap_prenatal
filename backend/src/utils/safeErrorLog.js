function diagnosticCode(error) {
  const code = error?.code;
  return typeof code === 'string'
    && /^(?:[A-Z][A-Z0-9_]{0,79}|[0-9A-Z]{5})$/.test(code)
    && !/\d{7,}/.test(code)
    ? code
    : 'UNKNOWN_ERROR';
}

module.exports = { diagnosticCode };
