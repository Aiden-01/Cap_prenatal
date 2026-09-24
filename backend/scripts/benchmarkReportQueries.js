const fs = require('node:fs');
const path = require('node:path');

const pool = require('../src/db/pool');
const { createReportesRepository } = require('../src/repositories/reportesRepository');
const { diagnosticCode } = require('../src/utils/safeErrorLog');

const REPORTS = [
  ['captadas_primer_control', 'obtenerRowsCensoPrimerControl'],
  ['embarazos_activos', 'obtenerRowsCensoGeneral'],
  ['proximas_a_parir', 'obtenerProximasAParir'],
  ['sin_control_reciente', 'obtenerSinControlReciente'],
  ['riesgo_obstetrico', 'obtenerPacientesConRiesgo'],
  ['resumen_comunidad', 'obtenerResumenPorComunidad'],
];

function outputPath() {
  const flag = process.argv.indexOf('--output');
  return flag === -1 || !process.argv[flag + 1]
    ? null
    : path.resolve(process.argv[flag + 1]);
}

async function captureQueries() {
  const captures = new Map();
  const db = {
    async query(text, params = []) {
      captures.set(params.length ? 'parameterized' : 'plain', { text, params });
      return { rows: [] };
    },
  };
  const repository = createReportesRepository(db);
  const queries = {};

  for (const [report, method] of REPORTS) {
    captures.clear();
    if (method === 'obtenerRowsCensoPrimerControl') {
      await repository[method]('2000-01-01', '2100-12-31');
      queries[report] = captures.get('parameterized');
    } else {
      await repository[method]();
      queries[report] = captures.get('plain');
    }
  }
  return queries;
}

function collectPlanNodes(node, nodes = []) {
  nodes.push({
    nodeType: node['Node Type'],
    relation: node['Relation Name'] || null,
    index: node['Index Name'] || null,
    joinType: node['Join Type'] || null,
    actualRows: node['Actual Rows'],
    actualLoops: node['Actual Loops'],
    rowsRemovedByFilter: node['Rows Removed by Filter'] || 0,
    sharedHitBlocks: node['Shared Hit Blocks'] || 0,
    sharedReadBlocks: node['Shared Read Blocks'] || 0,
    sortMethod: node['Sort Method'] || null,
    sortSpaceKb: node['Sort Space Used'] || null,
    sortSpaceType: node['Sort Space Type'] || null,
  });
  for (const child of node.Plans || []) collectPlanNodes(child, nodes);
  return nodes;
}

function summarizePlan(explainResult) {
  const document = explainResult[0]['QUERY PLAN'][0];
  const nodes = collectPlanNodes(document.Plan);
  const scans = nodes.filter((node) => /Scan$/.test(node.nodeType));
  const sorts = nodes.filter((node) => node.nodeType === 'Sort');
  return {
    planningTimeMs: document['Planning Time'],
    executionTimeMs: document['Execution Time'],
    returnedRows: document.Plan['Actual Rows'],
    // Buffer counters on the root plan already include every descendant.
    sharedHitBlocks: document.Plan['Shared Hit Blocks'] || 0,
    sharedReadBlocks: document.Plan['Shared Read Blocks'] || 0,
    rowsRemovedByFilter: nodes.reduce((sum, node) => sum + node.rowsRemovedByFilter, 0),
    dominantScans: scans.map(({ nodeType, relation, index, actualRows, actualLoops }) => ({
      nodeType, relation, index, actualRows, actualLoops,
    })),
    sorts: sorts.map(({ sortMethod, sortSpaceKb, sortSpaceType, actualRows }) => ({
      sortMethod, sortSpaceKb, sortSpaceType, actualRows,
    })),
    nodes,
  };
}

async function explain(client, query, params) {
  const result = await client.query(
    `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query}`,
    params
  );
  return summarizePlan(result.rows);
}

async function getPrimerControlCases(client) {
  const { rows } = await client.query(`
    SELECT MIN(fecha)::text AS min_date, MAX(fecha)::text AS max_date
    FROM controles_prenatales
    WHERE numero_control = 1
  `);
  const minDate = rows[0].min_date;
  const maxDate = rows[0].max_date;
  const cases = [
    { name: 'sin_filtro_adicional', params: ['1900-01-01', '2100-12-31'] },
    { name: 'rango_representativo', params: ['2026-01-01', '2026-12-31'] },
    { name: 'resultado_vacio', params: ['1900-01-01', '1900-01-01'] },
  ];
  if (minDate) cases.push({ name: 'filtro_restrictivo', params: [minDate, minDate] });
  if (minDate && maxDate && minDate !== maxDate) {
    cases.push({ name: 'mayor_rango_disponible', params: [minDate, maxDate] });
  }
  return cases;
}

async function main() {
  const queries = await captureQueries();
  const client = await pool.connect();
  const results = {};

  try {
    await client.query('BEGIN READ ONLY');
    const version = await client.query('SHOW server_version');
    const sizes = await client.query(`
      SELECT relname AS table_name,
             n_live_tup::bigint AS estimated_rows,
             pg_total_relation_size(relid)::bigint AS total_bytes
      FROM pg_stat_user_tables
      WHERE relname = ANY($1::text[])
      ORDER BY relname
    `, [['pacientes', 'embarazos', 'controles_prenatales', 'fichas_riesgo_obstetrico', 'comunidades']]);
    const indexes = await client.query(`
      SELECT tablename, indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = current_schema()
        AND tablename = ANY($1::text[])
      ORDER BY tablename, indexname
    `, [['pacientes', 'embarazos', 'controles_prenatales', 'fichas_riesgo_obstetrico', 'comunidades']]);

    for (const [report] of REPORTS) {
      const captured = queries[report];
      const cases = report === 'captadas_primer_control'
        ? await getPrimerControlCases(client)
        : [{ name: 'estado_actual_sin_filtros', params: [] }];
      results[report] = [];
      for (const benchmarkCase of cases) {
        results[report].push({
          case: benchmarkCase.name,
          params: benchmarkCase.params,
          plan: await explain(client, captured.text, benchmarkCase.params),
        });
      }
    }

    await client.query('ROLLBACK');
    const output = {
      generatedAt: new Date().toISOString(),
      environment: {
        postgres: version.rows[0].server_version,
        database: 'local development database',
        transaction: 'READ ONLY',
      },
      tables: sizes.rows,
      indexes: indexes.rows,
      reports: results,
    };
    const serialized = `${JSON.stringify(output, null, 2)}\n`;
    const destination = outputPath();
    if (destination) fs.writeFileSync(destination, serialized, 'utf8');
    process.stdout.write(serialized);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error('Benchmark de consultas fallido:', diagnosticCode(error));
  process.exitCode = 1;
});
