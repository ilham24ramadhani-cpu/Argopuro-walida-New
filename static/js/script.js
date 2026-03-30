// Sidebar toggle - event delegation di document agar bekerja di semua halaman (homepage, kelola, dll)
document.addEventListener("click", (e) => {
  const toggle = e.target.closest("nav.sidebar .toggle");
  const sidebar = document.querySelector("nav.sidebar");
  if (toggle && sidebar) {
    sidebar.classList.toggle("close");
  }
});

// Mobile hamburger toggle
document.addEventListener("click", (e) => {
  const hamburger = e.target.closest(".navbar-hamburger");
  if (!hamburger) return;

  const sidebar = document.querySelector("nav.sidebar");
  const overlay = document.querySelector(".sidebar-overlay");
  if (!sidebar) return;

  sidebar.classList.toggle("mobile-open");
  if (overlay) overlay.classList.toggle("active");
});

// Close sidebar when overlay is clicked (mobile)
document.addEventListener("click", (e) => {
  const overlay = e.target.closest(".sidebar-overlay");
  if (!overlay) return;
  const sidebar = document.querySelector("nav.sidebar");
  if (sidebar) sidebar.classList.remove("mobile-open");
  overlay.classList.remove("active");
});

const MOBILE_DRAWER_MAX = 991.98;

function syncSidebarLayout() {
  const sidebar = document.querySelector(".sidebar");
  if (!sidebar) return;

  const overlay = document.querySelector(".sidebar-overlay");
  const w = window.innerWidth;

  if (w <= MOBILE_DRAWER_MAX) {
    sidebar.classList.remove("mobile-open");
    if (overlay) overlay.classList.remove("active");
  } else {
    sidebar.classList.remove("mobile-open");
    if (overlay) overlay.classList.remove("active");
    sidebar.classList.remove("close");
  }
}

window.addEventListener("resize", syncSidebarLayout);
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", syncSidebarLayout);
} else {
  syncSidebarLayout();
}

// Handle logout - clear sessionStorage dan redirect ke welcome page (Flask route)
function handleLogout(event) {
  event.preventDefault();
  // Clear session storage
  sessionStorage.clear();
  // Redirect ke welcome page (Flask route /)
  window.location.href = "/";
}
