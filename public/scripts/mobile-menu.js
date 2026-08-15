const button = document.getElementById('mobile-menu-button');
const menu = document.getElementById('mobile-menu');
const menuIcon = document.getElementById('menu-icon');
const closeIcon = document.getElementById('close-icon');

button?.addEventListener('click', () => {
  const isOpen = menu?.classList.toggle('hidden') === false;
  button.setAttribute('aria-expanded', String(isOpen));
  menuIcon?.classList.toggle('hidden', isOpen);
  closeIcon?.classList.toggle('hidden', !isOpen);
});
