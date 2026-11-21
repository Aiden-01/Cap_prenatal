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
    assert.match(approvedCheckpoint ?? '', /^[a-f0-9]{40}$/, 'Falta el SHA aprobado para validar CPREN-129');
    assert.deepEqual(git(['rev-list', '--parents', '-n', '1', head]).trim().split(' '), [head, approvedCheckpoint],
      'El commit de activación debe tener como único padre el checkpoint aprobado');
    assert.equal(git(['diff', '--name-status', '--no-renames', approvedCheckpoint, head]).trim(), 'M\t' + workflow,
      'La activación solo puede modificar el workflow existente');
    git(['merge-base', '--is-ancestor', reviewedCandidate, recoveryBaseline]);
    git(['merge-base', '--is-ancestor', recoveryBaseline, approvedCheckpoint]);
    const migrationChanges = git(['diff', '--name-status', '--no-renames', reviewedCandidate, head, '--', migrationDir]).trim();
    assert.equal(migrationChanges, 'A\t' + migrationDir + '/' + recoveryMigration,
      'La única migración posterior al candidato anterior debe ser 034');
    const recoveryProtected = [...protectedPaths, 'n8n/security', 'n8n/workflows', 'n8n/email-senders.json'];
    git(['diff', '--exit-code', recoveryBaseline, head, '--', migrationDir, 'frontend/src', ...dependencyFiles,
      'n8n/workflows', 'n8n/email-senders.json']);
    git(['diff', '--exit-code', head, '--', ...recoveryProtected]);
    assert.equal(git(['ls-files', '--others', '-z', '--', ...recoveryProtected]), '',
      'Archivos sin seguimiento en las rutas del candidato');
    return { fourthLinux, reviewedCandidate: approvedCheckpoint, reviewedLayout,
      addedMigrations: [...addedMigrations, recoveryMigration],
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

module.exports = { recoveryRef, verifyReviewedLayout, verifyReviewedCandidate, verifyResponsiveActions };
