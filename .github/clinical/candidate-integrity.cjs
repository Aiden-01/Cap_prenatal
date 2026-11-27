'use strict';
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const originalCandidate = '74a458a6e9621c74982c1de13ee1ee2ef99fa7a7';
const fourthLinux = '6b2b723276dbb0183c294793cf5f1c61fc534360';
const reviewedCandidate = 'eafadf527c54e6184f6f3806cb53079cf644b569';
const recoveryBaseline = 'bb7bc7a612758cf7889f510b847968ab24a2dd0c';
const recoveryRef = 'refs/heads/feature/recuperacion-password';
const recoveryMigration = '034_recuperacion_password.sql';
const approvedRecoveryRun = '0c0f7d94d1c6c99d4364bb2e8e28f5be911f0112';
const approvedOwnerCheckpoint = 'b9bdfe9557fdf73ee449748dad4a1111f8df8342';
const approvedOwnerRun = '35a70a4ba0ca9563b5acce3f5b28ccd4f1fe3473';
const correctiveChanges = Object.freeze([
  'M\t.github/clinical/candidate-integrity.cjs',
  'M\t.github/clinical/test-failure-diagnostics.cjs',
  'M\tbackend/test/accountEmailPostgres.test.js',
  'M\tbackend/test/predeploy03Diagnostics.test.js',
  'M\tbackend/test/retiroReferencias.test.js',
].sort());
const ownerEmailMigration = '035_cambio_correo_titular.sql';
const workflow = '.github/workflows/clinical-predeploy02.yml';
const dependencyFiles = ['backend/package.json', 'backend/package-lock.json',
  'frontend/package.json', 'frontend/package-lock.json'];
const migrationDir = 'backend/src/db/migrations';
const addedMigrations = ['031_password_temporal.sql', '032_control_atencion_obstetrica.sql',
  '033_normalizar_comunidad_paciente.sql'];
const approvedCss = 'frontend/src/index.css';
// PREDEPLOY-03: única diferencia productiva propuesta para revisión del propietario.
const approvedHash = '9b6d24a932331046de714e25fdcdac26d82368c813bcd2a7033f0e2a6dbd7509';
const responsiveActionsCss = 'frontend/src/components/usuarios/profesionales.css';
const responsiveActionsHash = '41d2b3deed5737d97187d684dcea4b7a560a3fb716ab9eb969c43e74d74dcb84';

// Archivos productivos cotejados en el diff de CPREN-126. El SHA del checkpoint fija también las pruebas y el control.
const reviewedOwnerEmailProduct = Object.freeze({
  "A\tbackend/src/db/migrations/035_cambio_correo_titular.sql": "46b57cbda6de0414f037ddaf3559a77508c058679149cccbe5d2872d6d758609",
  "M\tbackend/src/db/schema.sql": "71d6b0d2b58cf6133fab4f31a1518c150cf15cc111d3a69896f8430d3d132e80",
  "M\tbackend/src/db/schemaCompatibility.js": "dabc1e27e451dbb9c80881d8c4147ee921a21668f5c4fed185157018441faa5b",
  "M\tbackend/src/index.js": "a5ba7ff3455d2dcd4e5c2d4b8bf24e72e51f0009224635218a840301216d2004",
  "M\tbackend/src/repositories/authRepository.js": "f40770f25b10f3e34b01a00e2ab6d34d594c4d8f14a3f4c96a3ba0e4d69abbc3",
  "A\tbackend/src/routes/ownEmail.js": "fbabdb4ddb1715f776880b7f7d207867ace31878e06a8819ad698c7d1caa662d",
  "M\tbackend/src/services/accountEmailService.js": "4cfa865cf38d232366ce93a86f727ed302547d5f8ebaa8a517a24b27f622a1c0",
  "M\tbackend/src/services/accountEmailTemplates.js": "978947fbf56479823097ab582ba3d0b4eaa9cd060af6e505d14f73e39414481c",
  "M\tbackend/src/services/audit/auditFieldPolicy.js": "d1066de4291acbfbd29b3e856a3d8132ba490ccde773157be5b02100660872cf",
  "M\tbackend/src/validations/auth.schemas.js": "6ccfaf42f47f46ebdfdc8e1278384787eaaca42c7487ed75af981e28a2ecaa5a",
  "M\tfrontend/src/components/Layout.jsx": "13bee10c3d91ef0c562fdcd70c2616dc90c571a567fa2ba990153344a1b79859",
  "A\tfrontend/src/components/OwnEmailDialog.jsx": "54ff17d01873b086925649854d5da77612abd72b791eff8e2d77ae98cdc22cdb",
  "M\tfrontend/src/components/Sidebar.jsx": "a780d3a0d8af4b31a7ab182314ba2a92dc4845309462a353ff915fb141286f58",
  "M\tfrontend/src/components/account-email.css": "a0339159b420f4c70dee8f4f466fd70981b466bf063ebb49a772f1cb4e7cdb88",
});
const reviewedOwnerEmailChanges = Object.freeze([
  ...Object.keys(reviewedOwnerEmailProduct),
  "M\t.github/clinical/candidate-integrity.cjs",
  "M\t.github/clinical/run-predeploy02.cjs",
  "M\tbackend/test/accountEmailPostgres.test.js",
  "M\tbackend/test/accountEmailTransport.test.js",
  "M\tbackend/test/checkpoint14MigracionesPostgres.test.js",
  "M\tbackend/test/predeploy03Diagnostics.test.js",
  "M\tbackend/test/schemaCompatibility.test.js",
].sort());

const stylesheetHash = content => crypto.createHash('sha256').update(content.replace(/\r\n/g, '\n')).digest('hex');

function verifyReviewedLayout(paths, content) {
  assert.deepEqual(paths, [approvedCss], 'Unexpected frontend candidate changes');
  const sha256 = stylesheetHash(content);
  assert.equal(sha256, approvedHash, 'Frontend layout does not match reviewed PREDEPLOY-03 content');
  return { file: approvedCss, sha256 };
}

function verifyResponsiveActions(changes, content) {
  assert.deepEqual(changes, [`M\t${responsiveActionsCss}`], 'Unexpected changes after the reviewed candidate');
  const sha256 = stylesheetHash(content);
  assert.equal(sha256, responsiveActionsHash, 'Responsive actions stylesheet differs from the approved content');
  return { file: responsiveActionsCss, sha256 };
}

function verifyOwnerEmailDiff(changes, readBlob) {
  const listed = changes.trim().split('\n').sort();
  assert.deepEqual(listed, reviewedOwnerEmailChanges, 'El checkpoint CPREN-126 contiene rutas no revisadas o incompletas');
  const product = [];
  for (const entry of listed) {
    const file = entry.slice(2);
    const expectedHash = reviewedOwnerEmailProduct[entry];
    const blob = readBlob(file, Boolean(expectedHash));
    assert.equal(blob.mode, '100644 blob', 'Modo no revisado en ' + file);
    if (expectedHash) {
      assert.equal(stylesheetHash(blob.content), expectedHash, 'Contenido productivo no revisado en ' + file);
      product.push({ file, sha256: expectedHash });
    }
  }
  return product;
}

function verifyCorrectiveDiff(changes, readMode) {
  assert.deepEqual(changes.trim().split('\n').sort(), correctiveChanges, 'Diff correctivo no autorizado');
  for (const entry of correctiveChanges) assert.equal(readMode(entry.slice(2)), '100644 blob', 'Modo correctivo no autorizado');
}

function verifyCorrectiveLineage(head, checkpoint, parents) {
  assert.deepEqual(parents(approvedOwnerCheckpoint), [approvedOwnerCheckpoint, approvedRecoveryRun], 'Linaje productivo incorrecto');
  assert.deepEqual(parents(approvedOwnerRun), [approvedOwnerRun, approvedOwnerCheckpoint], 'Activación histórica incorrecta');
  assert.deepEqual(parents(checkpoint), [checkpoint, approvedOwnerRun], 'Checkpoint correctivo fuera de linaje');
  assert.deepEqual(parents(head), [head, checkpoint], 'Activación correctiva fuera de linaje');
}

function verifyReviewedCandidate(root, expectedHead, { ref, approvedCheckpoint } = {}) {
  const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
  const head = git(['rev-parse', 'HEAD']).trim();
  assert.equal(head, expectedHead, 'Checkout does not match the Actions SHA');
  git(['merge-base', '--is-ancestor', originalCandidate, fourthLinux]);
  git(['merge-base', '--is-ancestor', fourthLinux, reviewedCandidate]);
  git(['merge-base', '--is-ancestor', reviewedCandidate, head]);

  git(['diff', '--exit-code', originalCandidate, fourthLinux, '--', 'backend/src', ...dependencyFiles]);
  const layoutPaths = git(['diff', '--name-only', originalCandidate, fourthLinux, '--', 'frontend/src']).trim().split('\n');
  const reviewedLayout = verifyReviewedLayout(layoutPaths, git(['show', `${fourthLinux}:${approvedCss}`]));
  git(['diff', '--exit-code', fourthLinux, reviewedCandidate, '--', approvedCss, ...dependencyFiles]);
  const migrationDiff = git(['diff', '--name-status', '--no-renames', fourthLinux, reviewedCandidate, '--', migrationDir]);
  assert.deepEqual(migrationDiff.trim().split('\n'), addedMigrations.map(file => `A\t${migrationDir}/${file}`),
    'Only the reviewed migration additions may differ from the fourth Linux run');

  const protectedPaths = ['backend/src', 'frontend/src', ...dependencyFiles];
  if (ref === recoveryRef) {
    assert.match(approvedCheckpoint ?? '', /^[a-f0-9]{40}$/, 'Falta el SHA aprobado para validar CPREN-126');
    assert.deepEqual(git(['rev-list', '--parents', '-n', '1', head]).trim().split(' '), [head, approvedCheckpoint],
      'El commit de activación debe tener como único padre el checkpoint aprobado');
    assert.equal(git(['diff', '--name-status', '--no-renames', approvedCheckpoint, head]).trim(), 'M\t' + workflow,
      'La activación solo puede modificar el workflow existente');
    git(['merge-base', '--is-ancestor', reviewedCandidate, recoveryBaseline]);
    git(['merge-base', '--is-ancestor', recoveryBaseline, approvedRecoveryRun]);
    assert.equal(git(['diff', '--name-status', '--no-renames', reviewedCandidate, approvedRecoveryRun, '--', migrationDir]).trim(),
      'A\t' + migrationDir + '/' + recoveryMigration, 'El candidato histórico de CPREN-129 incorpora únicamente la 034');
    git(['diff', '--exit-code', recoveryBaseline, approvedRecoveryRun, '--', migrationDir, 'frontend/src', ...dependencyFiles,
      'n8n/workflows', 'n8n/email-senders.json']);
    verifyCorrectiveLineage(head, approvedCheckpoint,
      sha => git(['rev-list', '--parents', '-n', '1', sha]).trim().split(' '));
    assert.equal(git(['diff', '--name-status', approvedOwnerCheckpoint, approvedOwnerRun]).trim(), 'M\t' + workflow,
      'Activación histórica modificó rutas adicionales');
    verifyCorrectiveDiff(git(['diff', '--name-status', '--no-renames', approvedOwnerRun, approvedCheckpoint]),
      file => git(['ls-tree', approvedCheckpoint, '--', file]).split(' ').slice(0, 2).join(' '));
    assert.equal(git(['diff', '--name-status', '--no-renames', approvedRecoveryRun, head, '--', migrationDir]).trim(),
      'A\t' + migrationDir + '/' + ownerEmailMigration, 'La 035 debe ser la única migración nueva; las anteriores se conservan');
    const product = verifyOwnerEmailDiff(git(['diff', '--name-status', '--no-renames', approvedRecoveryRun, approvedOwnerCheckpoint]),
      (file, hashRequired) => ({
        mode: git(['ls-tree', approvedOwnerCheckpoint, '--', file]).split(' ').slice(0, 2).join(' '),
        content: hashRequired ? git(['show', approvedOwnerCheckpoint + ':' + file]) : undefined,
      }));
    const recoveryProtected = [...protectedPaths, 'backend/test', '.github', 'n8n/security', 'n8n/workflows', 'n8n/email-senders.json'];
    git(['diff', '--exit-code', head, '--', ...recoveryProtected]);
    assert.equal(git(['ls-files', '--others', '-z', '--', ...recoveryProtected]), '',
      'Archivos sin seguimiento en las rutas del candidato');
    return { fourthLinux, reviewedCandidate: approvedCheckpoint, reviewedLayout, approvedRecoveryRun, product,
      addedMigrations: [...addedMigrations, recoveryMigration, ownerEmailMigration],
      responsiveActions: { file: responsiveActionsCss, sha256: stylesheetHash(git(['show', head + ':' + responsiveActionsCss])) } };
  }
  const candidateChanges = git(['diff', '--name-status', '--no-renames', reviewedCandidate, head, '--', ...protectedPaths]);
  assert.equal(git(['diff', '--summary', reviewedCandidate, head, '--', responsiveActionsCss]), '',
    'Responsive actions stylesheet must keep its file type and mode');
  const responsiveActions = verifyResponsiveActions(candidateChanges.trim().split('\n'),
    git(['show', `${head}:${responsiveActionsCss}`]));
  git(['diff', '--exit-code', head, '--', ...protectedPaths]);
  assert.equal(git(['ls-files', '--others', '-z', '--', ...protectedPaths]), '',
    'Unexpected untracked file in the protected candidate');
  return { fourthLinux, reviewedCandidate, reviewedLayout, addedMigrations, responsiveActions };
}

module.exports = { recoveryRef, correctiveChanges, verifyCorrectiveDiff, verifyCorrectiveLineage,
  reviewedOwnerEmailChanges, verifyOwnerEmailDiff, verifyReviewedLayout, verifyReviewedCandidate, verifyResponsiveActions };
