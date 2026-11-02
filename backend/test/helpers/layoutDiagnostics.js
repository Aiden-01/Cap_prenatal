'use strict';

// Se ejecuta dentro de page.evaluate. Nunca lee texto, valores, atributos id,
// URLs, estilos inline completos ni objetos HTTP de la aplicación.
function collectLayoutDiagnostics() {
  const number = value => Math.round(value * 100) / 100;
  const selector = element => {
    const classes = [...element.classList].filter(value => /^(?:patient-hero(?:-[a-z-]+)?|record-page|app-main|notas-[a-z-]+|nota-[a-z-]+|content-tabs|content-tab|card|btn-(?:primary|secondary)|is-[a-z-]+|seguimiento-[a-z-]+|clinical-[a-z-]+)$/.test(value));
    return element.tagName.toLowerCase() + classes.slice(0, 5).map(value => `.${value}`).join('');
  };
  const describe = element => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const css = {};
    for (const property of ['display', 'boxSizing', 'width', 'minWidth', 'maxWidth',
      'gridTemplateColumns', 'flexBasis', 'flexShrink', 'flexWrap', 'whiteSpace',
      'overflowWrap', 'overflowX', 'paddingLeft', 'paddingRight', 'gap']) {
      const value = style[property];
      css[property] = typeof value === 'string' && /^[a-z0-9.%(), -]{0,180}$/i.test(value) ? value : '[omitted]';
    }
    return { selector: selector(element), rect: Object.fromEntries(['left', 'right', 'top', 'bottom', 'width', 'height'].map(key => [key, number(rect[key])])),
      clientWidth: element.clientWidth, scrollWidth: element.scrollWidth, css };
  };
  const viewport = { width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth };
  const overflowing = [...document.querySelectorAll('body *')].filter(element => {
    const rect = element.getBoundingClientRect();
    return element.getClientRects().length && (rect.right > innerWidth + 1 || rect.left < -1);
  }).slice(0, 15).map(element => {
    const ancestors = [];
    for (let parent = element.parentElement; parent && ancestors.length < 5; parent = parent.parentElement) ancestors.push(describe(parent));
    return { ...describe(element), ancestors };
  });
  return { synthetic_only: true, viewport, overflowing,
    containers: [...document.querySelectorAll('.app-main, .record-page, .patient-hero, .patient-hero-main, .patient-hero-title, .notas-module, .nota-editor-header')].map(describe) };
}

module.exports = { collectLayoutDiagnostics };
