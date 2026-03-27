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
  if (!e.target.classList.contains("sidebar-overlay")) return;
  const sidebar = document.querySelector("nav.sidebar");
  const overlay = document.querySelector(".sidebar-overlay");
  if (sidebar) sidebar.classList.remove("mobile-open");
  if (overlay) overlay.classList.remove("active");
});

// Tutup sidebar otomatis di layar kecil
window.addEventListener("resize", () => {
  const sidebar = document.querySelector(".sidebar");
  if (!sidebar) return;

  if (window.innerWidth <= 576) {
    // Mobile: use overlay mode — ensure sidebar is off-screen
    sidebar.classList.remove("mobile-open");
    const overlay = document.querySelector(".sidebar-overlay");
    if (overlay) overlay.classList.remove("active");
  } else if (window.innerWidth < 768) {
    // Tablet: collapsed icon-only sidebar
    sidebar.classList.add("close");
  } else {
    // Desktop: open sidebar
    sidebar.classList.remove("close");
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
