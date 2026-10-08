const { types } = require('pg');

// PostgreSQL DATE is a civil day, not an instant. Keep its wire representation
// instead of letting pg create local midnight and JSON convert it to UTC.
// Pool-scoped: timestamp/timestamptz and other pools retain pg's parsers.
module.exports = {
  getTypeParser(oid, format = 'text') {
    if (oid === types.builtins.DATE && format === 'text') return value => value;
    return types.getTypeParser(oid, format);
  },
};
