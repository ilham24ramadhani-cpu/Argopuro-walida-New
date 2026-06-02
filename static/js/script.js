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

/** Hanya berubah true/false saat lebar melewati breakpoint — jangan reset drawer di setiap resize (Safari portrait memicu resize saat chrome alamat) */
let lastDrawerViewportIsMobile = null;

function syncSidebarLayout() {
  const sidebar = document.querySelector(".sidebar");
  if (!sidebar) return;

  const overlay = document.querySelector(".sidebar-overlay");
  const w = window.innerWidth;
  const isMobile = w <= MOBILE_DRAWER_MAX;

  if (lastDrawerViewportIsMobile === null) {
    lastDrawerViewportIsMobile = isMobile;
    if (!isMobile) {
      sidebar.classList.remove("mobile-open");
      if (overlay) overlay.classList.remove("active");
      sidebar.classList.remove("close");
    }
    return;
  }

  if (lastDrawerViewportIsMobile === isMobile) {
    return;
  }

  lastDrawerViewportIsMobile = isMobile;
  sidebar.classList.remove("mobile-open");
  if (overlay) overlay.classList.remove("active");
  if (isMobile) {
    sidebar.classList.add("close");
  } else {
    sidebar.classList.remove("close");
  }
}

window.addEventListener("resize", syncSidebarLayout);
window.addEventListener("orientationchange", () => {
  requestAnimationFrame(syncSidebarLayout);
});
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

/*
 * Cegah perubahan nilai pada <input type="number"> saat user men-scroll mouse wheel.
 *
 * Default browser: ketika sebuah number input dalam keadaan focus, wheel event
 * akan menambah/mengurangi nilai sebesar atribut `step` (mis. 0.01, 0.1, 1000).
 * Akibatnya user yang baru saja mengetik (mis. kadar air 12 atau berat 12 kg)
 * lalu scroll halaman ke tombol Simpan bisa melihat nilainya berubah diam-diam
 * (12 → 11,59 untuk step 0.01, 12 → 11,6 untuk step 0.1, dst.) tanpa sadar.
 *
 * Solusi: saat user scroll, blur input number-nya. Halaman tetap bisa discroll
 * normal, dan nilai yang sudah diketik tidak berubah. User hanya perlu klik lagi
 * di input bila ingin mengedit nilainya.
 */
document.addEventListener(
  "wheel",
  function (e) {
    const el = document.activeElement;
    if (
      el &&
      el.tagName === "INPUT" &&
      el.type === "number" &&
      (el === e.target || el.contains(e.target))
    ) {
      el.blur();
    }
  },
  { passive: true }
);
