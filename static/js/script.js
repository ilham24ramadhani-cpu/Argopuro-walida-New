// Sidebar toggle - event delegation di document agar bekerja di semua halaman (homepage, kelola, dll)
document.addEventListener("click", (e) => {
  const toggle = e.target.closest("nav.sidebar .toggle");
  const sidebar = document.querySelector("nav.sidebar");
  if (toggle && sidebar) {
    sidebar.classList.toggle("close");
  }
});

// Tutup sidebar otomatis di layar kecil
window.addEventListener("resize", () => {
  const sidebar = document.querySelector(".sidebar");
  if (window.innerWidth < 768) {
    sidebar.classList.add("close");
  } else {
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
