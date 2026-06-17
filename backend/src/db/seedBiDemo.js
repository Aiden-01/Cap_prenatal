const pool = require('./pool');

const DAY_MS = 24 * 60 * 60 * 1000;

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function daysAgo(days) {
  return isoDate(new Date(Date.now() - days * DAY_MS));
}

function daysFrom(dateString, days) {
  return isoDate(new Date(new Date(`${dateString}T00:00:00Z`).getTime() + days * DAY_MS));
}

function buildPatient({ expediente, cui, nombres, apellidos, fur, createdDaysAgo, rangoEdad }) {
  return {
    no_expediente: expediente,
    cui,
    nombre_establecimiento: 'CAP El Chal',
    distrito: 'Distrito Sur Oriente',
    area_salud: 'Peten, Area Sur Oriente',
    categoria_servicio: 'CAP',
    nombres,
    apellidos,
    fecha_nacimiento: rangoEdad === '14_19' ? '2009-04-12' : rangoEdad === 'mayor_35' ? '1987-09-21' : '1998-03-18',
    rango_edad: rangoEdad,
    clasificacion_alfa_beta: 'ALFA',
    municipio: 'El Chal',
    territorio: 'Territorio 1',
    sector: 'Sector A',
    comunidad: 'El Chal - Barrio El Paraiso',
    telefono: '55550000',
    nivel_estudios: 'diversificado',
    estado_civil: 'unida',
    pueblo: 'mestizo',
    fur,
    fpp: daysFrom(fur, 280),
    eg_confiable_fur: true,
    gestas_previas: 1,
    partos: 1,
    partos_vaginales: 1,
    nacidos_vivos: 1,
    hijos_viven: 1,
    embarazo_planeado: true,
    fracaso_metodo: 'no',
    tiene_ficha_riesgo: true,
    created_at: daysAgo(createdDaysAgo),
    updated_at: daysAgo(createdDaysAgo),
  };
}

const demoPatients = [
  {
    paciente: buildPatient({
      expediente: 'BI-DEMO-001',
      cui: '3012456780101',
      nombres: 'Rosa Maria',
      apellidos: 'Tun Caal',
      fur: daysAgo(10 * 7),
      createdDaysAgo: 35,
      rangoEdad: '20_35',
    }),
    controles: [8],
    riesgo: {},
  },
  {
    paciente: buildPatient({
      expediente: 'BI-DEMO-002',
      cui: '3012456780102',
      nombres: 'Ana Lucia',
      apellidos: 'Pop Ical',
      fur: daysAgo(20 * 7),
      createdDaysAgo: 60,
      rangoEdad: '14_19',
    }),
    controles: [8, 12, 16, 20],
    riesgo: {
      menor_20_anos: true,
      anemia: true,
      referida_a: 'Hospital de Dolores',
    },
  },
  {
    paciente: buildPatient({
      expediente: 'BI-DEMO-003',
      cui: '3012456780103',
      nombres: 'Marta Isabel',
      apellidos: 'Cocom Choc',
      fur: daysAgo(32 * 7),
      createdDaysAgo: 95,
      rangoEdad: 'mayor_35',
    }),
    controles: [10, 16, 22, 28, 32],
    riesgo: {
      mayor_35_anos: true,
      antec_hipertension_preeclampsia: true,
      hipertension_arterial: true,
      referida_a: 'Hospital de Dolores',
    },
  },
  {
    paciente: buildPatient({
      expediente: 'BI-DEMO-004',
      cui: '3012456780104',
      nombres: 'Claudia Elena',
      apellidos: 'Caal Mendez',
      fur: daysAgo(24 * 7),
      createdDaysAgo: 15,
      rangoEdad: '20_35',
    }),
    controles: [10, 20],
    riesgo: {},
  },
];

async function insertPatient(client, data) {
  const patientColumns = Object.keys(data.paciente);
  const patientValues = Object.values(data.paciente);
  const patientPlaceholders = patientColumns.map((_, index) => `$${index + 1}`).join(', ');

  const patientResult = await client.query(
    `INSERT INTO pacientes (${patientColumns.join(', ')})
     VALUES (${patientPlaceholders})
     RETURNING id`,
    patientValues
  );

  const pacienteId = patientResult.rows[0].id;
  const embarazoResult = await client.query(
    `INSERT INTO embarazos (
       paciente_id, numero_embarazo, estado, fur, fpp, fecha_inicio
     ) VALUES ($1, 1, 'activo', $2, $3, $2)
     RETURNING id`,
    [pacienteId, data.paciente.fur, data.paciente.fpp]
  );
  const embarazoId = embarazoResult.rows[0].id;

  for (const weeks of data.controles) {
    await client.query(
      `INSERT INTO controles_prenatales (
         paciente_id, embarazo_id, numero_control, fecha, edad_gestacional_semanas,
         motivo_consulta, pa_sistolica, pa_diastolica, peso_kg, fcf, nombre_cargo_atiende
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        pacienteId,
        embarazoId,
        data.controles.indexOf(weeks) + 1,
        daysFrom(data.paciente.fur, weeks * 7),
        weeks,
        `Control prenatal de ${weeks} semanas`,
        110,
        70,
        58 + weeks / 4,
        145,
        'Enfermera BI Demo',
      ]
    );
  }

  await client.query(
    `INSERT INTO fichas_riesgo_obstetrico (
       paciente_id, embarazo_id, fecha, telefono, pueblo, migrante, estado_civil,
       escolaridad, ocupacion, fecha_ultima_regla, fecha_probable_parto,
       no_embarazos, no_partos, no_cesareas, no_abortos, no_hijos_vivos,
       no_hijos_muertos, edad_embarazo_semanas, menor_20_anos, mayor_35_anos,
       anemia, antec_hipertension_preeclampsia, hipertension_arterial, referida_a,
       nombre_personal_atendio
     ) VALUES (
       $1,$2,CURRENT_DATE,$3,$4,FALSE,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,
       $16,$17,$18,$19,$20,$21,$22,$23
     )`,
    [
      pacienteId,
      embarazoId,
      data.paciente.telefono,
      data.paciente.pueblo,
      data.paciente.estado_civil,
      data.paciente.nivel_estudios,
      'Ama de casa',
      data.paciente.fur,
      data.paciente.fpp,
      data.paciente.gestas_previas + 1,
      data.paciente.partos,
      0,
      0,
      data.paciente.hijos_viven,
      0,
      data.controles[data.controles.length - 1],
      Boolean(data.riesgo.menor_20_anos),
      Boolean(data.riesgo.mayor_35_anos),
      Boolean(data.riesgo.anemia),
      Boolean(data.riesgo.antec_hipertension_preeclampsia),
      Boolean(data.riesgo.hipertension_arterial),
      data.riesgo.referida_a || null,
      'Enfermera BI Demo',
    ]
  );

  return { pacienteId, embarazoId };
}

async function seedBiDemo() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query(
      `DELETE FROM pacientes
       WHERE no_expediente = ANY($1::text[])`,
      [demoPatients.map((item) => item.paciente.no_expediente)]
    );

    const inserted = [];
    for (const patient of demoPatients) {
      inserted.push(await insertPatient(client, patient));
    }

    await client.query('COMMIT');
    console.log('Seed BI cargado correctamente:');
    for (const item of inserted) {
      console.log(`- paciente_id=${item.pacienteId}, embarazo_id=${item.embarazoId}`);
    }
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error cargando seed BI:', error.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

seedBiDemo();
