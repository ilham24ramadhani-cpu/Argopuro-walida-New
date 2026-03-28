// Sidebar toggle - event delegation di document agar bekerja di semua halaman (homepage, kelola, dll)
document.addEventListener("click", (e) => {
  const toggle = e.target.closest("nav.sidebar .toggle");
  const sidebar = document.querySelector("nav.sidebar");
  if (toggle && sidebar) {
    sidebar.classList.toggle("close");
  }
});

// Hamburger menu toggle for mobile
document.addEventListener("DOMContentLoaded", () => {
  const hamburger = document.querySelector(".navbar-hamburger");
  const sidebar = document.querySelector(".sidebar");
  const overlay = document.querySelector(".sidebar-overlay");

  if (hamburger && sidebar) {
    hamburger.addEventListener("click", () => {
      sidebar.classList.toggle("mobile-open");
      if (overlay) overlay.classList.toggle("active");
    });
  }

  if (overlay && sidebar) {
    overlay.addEventListener("click", () => {
      sidebar.classList.remove("mobile-open");
      overlay.classList.remove("active");
    });
  }
});

// Tutup sidebar otomatis di layar kecil
window.addEventListener("resize", () => {
  const sidebar = document.querySelector(".sidebar");
  const overlay = document.querySelector(".sidebar-overlay");
  if (!sidebar) return;

  if (window.innerWidth <= 576) {
    // Mobile: use overlay mode, ensure sidebar is hidden
    sidebar.classList.remove("close");
    sidebar.classList.remove("mobile-open");
    if (overlay) overlay.classList.remove("active");
  } else if (window.innerWidth < 768) {
    sidebar.classList.add("close");
    sidebar.classList.remove("mobile-open");
    if (overlay) overlay.classList.remove("active");
  } else {
    sidebar.classList.remove("mobile-open");
    if (overlay) overlay.classList.remove("active");
  }
});

// Handle logout - clear sessionStorage dan redirect ke welcome page (Flask route)
function handleLogout(event) {
  event.preventDefault();
  // Clear session storage
  sessionStorage.clear();
  // Redirect ke welcome page (Flask route /)
  window.location.href = "/";
}
