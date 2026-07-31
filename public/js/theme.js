const ThemeControl = (() => {
  const KEY = 'syncboard.theme';

  function apply(mode) {
    document.documentElement.setAttribute('data-theme', mode);
    localStorage.setItem(KEY, mode);
    document.querySelectorAll('[data-theme-toggle]').forEach((btn) => {
      btn.setAttribute('aria-pressed', mode === 'light');
    });
  }

  function current() {
    return document.documentElement.getAttribute('data-theme') || 'dark';
  }

  function init() {
    const stored = localStorage.getItem(KEY);
    const preferred = stored || (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    apply(preferred);
    document.querySelectorAll('[data-theme-toggle]').forEach((btn) => {
      btn.addEventListener('click', () => {
        apply(current() === 'light' ? 'dark' : 'light');
      });
    });
  }

  return { init, apply, current };
})();

document.addEventListener('DOMContentLoaded', ThemeControl.init);
