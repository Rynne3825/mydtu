// ============================================
// MyDTU Slot Monitor - Frontend Application
// ============================================

const API_BASE = "/api";

// ============================================
// State Management
// ============================================
const state = {
  user: null,
  token: localStorage.getItem("token"),
  watchItems: [],
  loading: false,
  currentPage: "landing",
};

// ============================================
// API Client
// ============================================
async function api(endpoint, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(state.token && { Authorization: `Bearer ${state.token}` }),
    ...options.headers,
  };

  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Đã có lỗi xảy ra");
    }

    return data;
  } catch (error) {
    if (error.message.includes("Unauthorized")) {
      logout();
    }
    throw error;
  }
}

// ============================================
// Auth Functions
// ============================================
async function login(email, password) {
  const data = await api("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });

  state.token = data.data.token;
  state.user = data.data.user;
  localStorage.setItem("token", data.data.token);

  showToast("Đăng nhập thành công!", "success");
  navigate("dashboard");
}

async function register(email, username, password) {
  const data = await api("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, username, password }),
  });

  state.token = data.data.token;
  state.user = data.data.user;
  localStorage.setItem("token", data.data.token);

  showToast("Đăng ký thành công!", "success");
  navigate("dashboard");
}

function logout() {
  state.token = null;
  state.user = null;
  localStorage.removeItem("token");
  navigate("landing");
}

async function checkAuth() {
  if (!state.token) return false;

  try {
    const data = await api("/auth/me");
    state.user = data.data;
    return true;
  } catch {
    state.token = null;
    localStorage.removeItem("token");
    return false;
  }
}

// ============================================
// Watch Functions
// ============================================
async function loadWatchItems() {
  try {
    const data = await api("/watch");
    state.watchItems = data.data.items;
    return data.data;
  } catch (error) {
    showToast(error.message, "error");
    return { items: [], count: 0, max: 10 };
  }
}

async function addWatchItem(
  classUrl,
  notifyTelegram = true,
  notifyEmail = true
) {
  const data = await api("/watch", {
    method: "POST",
    body: JSON.stringify({
      class_url: classUrl,
      notify_telegram: notifyTelegram,
      notify_email: notifyEmail,
    }),
  });

  showToast(data.message, "success");
  await loadWatchItems();
  return data;
}

async function deleteWatchItem(id) {
  const data = await api(`/watch/${id}`, { method: "DELETE" });
  showToast(data.message, "success");
  await loadWatchItems();
}

async function toggleWatchItem(id, isActive) {
  await api(`/watch/${id}`, {
    method: "PUT",
    body: JSON.stringify({ is_active: isActive }),
  });
  await loadWatchItems();
}

async function refreshWatchItem(id) {
  const data = await api(`/watch/${id}/refresh`, { method: "POST" });
  showToast(data.message, "success");
  await loadWatchItems();
  return data;
}

// ============================================
// Telegram Functions
// ============================================
async function generateTelegramCode() {
  const data = await api("/telegram/generate-code", { method: "POST" });
  return data.data;
}

async function unlinkTelegram() {
  await api("/telegram/unlink", { method: "POST" });
  showToast("Đã hủy liên kết Telegram", "success");
  await checkAuth();
}

// ============================================
// Toast Notifications
// ============================================
function showToast(message, type = "success") {
  const container =
    document.querySelector(".toast-container") || createToastContainer();

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${type === "success" ? "✓" : "✕"}</span>
    <span class="toast-message">${message}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

function createToastContainer() {
  const container = document.createElement("div");
  container.className = "toast-container";
  document.body.appendChild(container);
  return container;
}

// ============================================
// Password Toggle
// ============================================
window.togglePassword = function (id, btn) {
  const input = document.getElementById(id);
  if (input.type === "password") {
    input.type = "text";
    btn.textContent = "👁️‍🗨️";
  } else {
    input.type = "password";
    btn.textContent = "👁️";
  }
};

// ============================================
// Routing
// ============================================
let isRendering = false;

function navigate(page) {
  if (state.currentPage === page && !isRendering) {
    return; // Already on this page, don't re-render
  }
  state.currentPage = page;
  window.history.pushState({ page }, "", `/${page === "landing" ? "" : page}`);
  render();
}

window.addEventListener("popstate", (e) => {
  state.currentPage = e.state?.page || "landing";
  render();
});

// ============================================
// Page Renderers
// ============================================
function renderLandingPage() {
  return `
    <div class="page">
      ${renderHeader()}
      
      <main>
        <section class="hero container">
          <span class="hero-badge">
            🎓 Dành cho sinh viên Duy Tân
          </span>
          <h1 class="hero-title">
            Theo dõi <span class="gradient-text">slot tín chỉ</span><br>
            Không bao giờ bỏ lỡ!
          </h1>
          <p class="hero-subtitle">
            Nhận thông báo qua Telegram & Email ngay khi có slot mở. 
            Kiểm tra tự động mỗi 10 phút, 24/7.
          </p>
          <div class="hero-buttons">
            <button class="btn btn-primary btn-lg" onclick="navigate('register')">
              Bắt đầu ngay — Miễn phí
            </button>
            <button class="btn btn-secondary btn-lg" onclick="navigate('login')">
              Đã có tài khoản
            </button>
          </div>
        </section>

        <section class="container">
          <div class="stats card card-glass">
            <div class="stat-item">
              <div class="stat-value">10 phút</div>
              <div class="stat-label">Kiểm tra định kỳ</div>
            </div>
            <div class="stat-item">
              <div class="stat-value">24/7</div>
              <div class="stat-label">Hoạt động liên tục</div>
            </div>
            <div class="stat-item">
              <div class="stat-value">10</div>
              <div class="stat-label">Lớp theo dõi tối đa</div>
            </div>
          </div>
        </section>

        <section class="features container">
          <div class="features-grid">
            <div class="card feature-card">
              <div class="feature-icon">📱</div>
              <h3 class="feature-title">Thông báo Telegram</h3>
              <p class="feature-desc">
                Nhận tin nhắn ngay lập tức khi slot mở hoặc tăng thêm
              </p>
            </div>
            <div class="card feature-card">
              <div class="feature-icon">📧</div>
              <h3 class="feature-title">Thông báo Email</h3>
              <p class="feature-desc">
                Email đẹp mắt với thông tin chi tiết về lớp học
              </p>
            </div>
            <div class="card feature-card">
              <div class="feature-icon">🔗</div>
              <h3 class="feature-title">Dán link là xong</h3>
              <p class="feature-desc">
                Copy link lớp từ trang tra cứu, dán vào và theo dõi
              </p>
            </div>
            <div class="card feature-card">
              <div class="feature-icon">📊</div>
              <h3 class="feature-title">Dashboard trực quan</h3>
              <p class="feature-desc">
                Xem trạng thái slot, lịch sử thông báo tập trung
              </p>
            </div>
            <div class="card feature-card">
              <div class="feature-icon">🔒</div>
              <h3 class="feature-title">An toàn & Bảo mật</h3>
              <p class="feature-desc">
                Không yêu cầu mật khẩu MyDTU, không can thiệp đăng ký
              </p>
            </div>
            <div class="card feature-card">
              <div class="feature-icon">☁️</div>
              <h3 class="feature-title">Cloud 24/7</h3>
              <p class="feature-desc">
                Chạy trên cloud, không cần bật máy, không lo mất điện
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer class="container text-center" style="padding: 40px 0; color: var(--text-muted);">
        <p>© 2026 MyDTU Slot Monitor. Không liên kết chính thức với Đại học Duy Tân.</p>
      </footer>
    </div>
  `;
}

function renderLoginPage() {
  return `
    <div class="auth-page">
      <div class="auth-card card">
        <div class="auth-header">
          <div class="auth-logo">📚</div>
          <h1 class="auth-title">Đăng nhập</h1>
          <p class="auth-subtitle">Chào mừng trở lại!</p>
        </div>

        <form id="loginForm" onsubmit="handleLogin(event)">
          <div class="form-group">
            <label class="form-label" for="email">Email hoặc Username</label>
            <input 
              type="text" 
              id="email" 
              class="form-input" 
              placeholder="Email hoặc username"
              required
            />
          </div>

          <div class="form-group">
            <label class="form-label" for="password">Mật khẩu</label>
            <input 
              type="password" 
              id="password" 
              class="form-input" 
              placeholder="••••••••"
              required
            />
            <button type="button" class="password-toggle" onclick="togglePassword('password', this)">👁️</button>
          </div>

          <button type="submit" class="btn btn-primary" style="width: 100%;">
            Đăng nhập
          </button>
        </form>

        <div class="auth-footer">
          Chưa có tài khoản? 
          <a href="javascript:navigate('register')">Đăng ký ngay</a>
        </div>

        <div style="margin-top: 24px; text-align: center;">
          <a href="javascript:navigate('landing')" class="text-muted">← Về trang chủ</a>
        </div>
      </div>
    </div>
  `;
}

function renderRegisterPage() {
  return `
    <div class="auth-page">
      <div class="auth-card card">
        <div class="auth-header">
          <div class="auth-logo">📚</div>
          <h1 class="auth-title">Đăng ký</h1>
          <p class="auth-subtitle">Tạo tài khoản miễn phí</p>
        </div>

        <form id="registerForm" onsubmit="handleRegister(event)">
          <div class="form-group">
            <label class="form-label" for="username">Username</label>
            <input 
              type="text" 
              id="username" 
              class="form-input" 
              placeholder="username123"
              minlength="3"
            />
          </div>

          <div class="form-group">
            <label class="form-label" for="email">Email</label>
            <input 
              type="email" 
              id="email" 
              class="form-input" 
              placeholder="email@example.com"
              required
            />
            <p class="form-hint">Dùng email thật để nhận thông báo</p>
          </div>

          <div class="form-group">
            <label class="form-label" for="password">Mật khẩu</label>
            <input 
              type="password" 
              id="password" 
              class="form-input" 
              placeholder="Ít nhất 6 ký tự"
              minlength="6"
              required
            />
            <button type="button" class="password-toggle" onclick="togglePassword('password', this)">👁️</button>
          </div>

          <div class="form-group">
            <label class="form-label" for="confirmPassword">Xác nhận mật khẩu</label>
            <input 
              type="password" 
              id="confirmPassword" 
              class="form-input" 
              placeholder="Nhập lại mật khẩu"
              required
            />
            <button type="button" class="password-toggle" onclick="togglePassword('confirmPassword', this)">👁️</button>
          </div>

          <button type="submit" class="btn btn-primary" style="width: 100%;">
            Đăng ký
          </button>
        </form>

        <div class="auth-footer">
          Đã có tài khoản? 
          <a href="javascript:navigate('login')">Đăng nhập</a>
        </div>

        <div style="margin-top: 24px; text-align: center;">
          <a href="javascript:navigate('landing')" class="text-muted">← Về trang chủ</a>
        </div>
      </div>
    </div>
  `;
}

function renderDashboardPage() {
  const items = state.watchItems || [];
  const hasSlots = items.some((i) => i.last_remaining > 0);

  return `
    <div class="page">
      ${renderHeader(true)}
      
      <main class="dashboard container">
        <div class="dashboard-header">
          <div>
            <h1 class="dashboard-title">Danh sách theo dõi</h1>
            <p class="text-muted">${items.length}/10 lớp</p>
          </div>
          <button class="btn btn-primary" onclick="openAddModal()">
            + Thêm lớp
          </button>
        </div>

        <div class="dashboard-stats">
          <div class="card stat-card">
            <div class="stat-icon">📚</div>
            <div class="stat-content">
              <h4>${items.length}</h4>
              <p>Đang theo dõi</p>
            </div>
          </div>
          <div class="card stat-card">
            <div class="stat-icon">${hasSlots ? "✅" : "⏳"}</div>
            <div class="stat-content">
              <h4>${items.filter((i) => i.last_remaining > 0).length}</h4>
              <p>Có slot trống</p>
            </div>
          </div>
          <div class="card stat-card">
            <div class="stat-icon">🔔</div>
            <div class="stat-content">
              <h4>${state.user?.telegram_connected ? "Đã kết nối" : "Chưa"}</h4>
              <p>Telegram</p>
            </div>
          </div>
        </div>

        <div class="watch-list">
          ${
            items.length === 0
              ? `
            <div class="card empty-state">
              <div class="empty-icon">📭</div>
              <h3 class="empty-title">Chưa có lớp nào</h3>
              <p class="empty-desc">Thêm link lớp từ trang tra cứu để bắt đầu theo dõi</p>
              <button class="btn btn-primary" onclick="openAddModal()">
                + Thêm lớp đầu tiên
              </button>
            </div>
          `
              : items.map((item) => renderWatchCard(item)).join("")
          }
        </div>
      </main>

      ${renderAddModal()}
    </div>
  `;
}

function renderWatchCard(item) {
  const hasSlot = item.last_remaining > 0;
  const lastChecked = item.last_checked_at
    ? new Date(item.last_checked_at).toLocaleString("vi-VN")
    : "Chưa kiểm tra";

  // Extract class ID from URL if available
  const classIdMatch = item.class_url?.match(/classid=([^&]+)/);
  const urlClassId = classIdMatch ? classIdMatch[1] : null;
  const classId = item.registration_code || urlClassId;

  return `
    <div class="card watch-card ${hasSlot ? "has-slot" : ""}">
      <div class="watch-header">
        <div class="watch-info">
          <div class="watch-name">
            ${
              item.class_code
                ? `<span class="watch-code-badge">${item.class_code}</span> – `
                : ""
            }
            ${item.class_name || "Đang tải..."}
          </div>
          ${
            classId
              ? `
            <div class="watch-meta">
              <span class="watch-meta-item">📋 Mã ĐK: <strong>${classId}</strong></span>
            </div>
          `
              : ""
          }
          ${
            item.schedule
              ? `
            <div class="watch-schedule">
              📅 ${item.schedule}
            </div>
          `
              : ""
          }
        </div>
        <div class="watch-slot">
          <div class="watch-slot-number ${hasSlot ? "available" : "full"}">
            ${item.last_remaining ?? "?"}
          </div>
          <div class="watch-slot-label">còn trống</div>
        </div>
      </div>
      <div class="watch-footer">
        <span class="watch-updated">
          ${item.last_error ? `⚠️ ${item.last_error}` : `🕐 ${lastChecked}`}
        </span>
        <div class="watch-actions">
          <button 
            class="btn btn-ghost btn-sm" 
            onclick="refreshWatchItem(${item.id})"
            title="Làm mới"
          >
            🔄
          </button>
          <a 
            href="${item.class_url}" 
            target="_blank" 
            class="btn btn-ghost btn-sm"
            title="Xem trên DTU"
          >
            🔗
          </a>
          <button 
            class="btn btn-ghost btn-sm" 
            onclick="confirmDelete(${item.id}, '${
    item.class_name || "lớp này"
  }')"
            title="Xóa"
          >
            🗑️
          </button>
        </div>
      </div>
    </div>
  `;
}

function renderVerifyModal() {
  return `
    <div id="verifyModal" class="modal-overlay" onclick="closeModal(event)">
      <div class="modal card" onclick="event.stopPropagation()">
        <div class="modal-header">
          <h2 class="modal-title">Xác thực Email</h2>
          <button class="modal-close" onclick="closeVerifyModal()">✕</button>
        </div>
        
        <div style="text-align: center; margin-bottom: 24px;">
          <p>Mã xác thực đã được gửi đến <strong>${
            state.user?.email || "..."
          }</strong></p>
          <p class="text-muted text-sm">Vui lòng kiểm tra hộp thư (cả mục spam/quảng cáo)</p>
        </div>

        <form onsubmit="handleVerifyEmail(event)">
          <div class="form-group">
            <label class="form-label">Mã xác thực (6 số)</label>
            <input 
              type="text" 
              id="verifyCode" 
              class="form-input" 
              placeholder="123456"
              maxlength="6"
              pattern="[0-9]{6}"
              style="text-align: center; letter-spacing: 5px; font-size: 1.5rem;"
              required
            />
          </div>

          <button type="submit" class="btn btn-primary" style="width: 100%; margin-bottom: 12px;">
            Xác nhận
          </button>
          
          <button type="button" class="btn btn-ghost" style="width: 100%;" onclick="handleResendVerification()">
            Gửi lại mã
          </button>
        </form>
      </div>
    </div>
  `;
}

function renderAddModal() {
  return `
    <div id="addModal" class="modal-overlay" onclick="closeModal(event)">
      <div class="modal card" onclick="event.stopPropagation()">
        <div class="modal-header">
          <h2 class="modal-title">Thêm lớp theo dõi</h2>
          <button class="modal-close" onclick="closeAddModal()">✕</button>
        </div>
        
        <form id="addWatchForm" onsubmit="handleAddWatch(event)">
          <div class="form-group">
            <label class="form-label">Link lớp học</label>
            <input 
              type="url" 
              id="classUrl" 
              class="form-input" 
              placeholder="https://courses.duytan.edu.vn/Sites/Home_ChuongTrinhDaoTao.aspx?..."
              required
            />
            <p class="form-hint">
              Dán link chi tiết lớp từ trang <a href="https://courses.duytan.edu.vn" target="_blank">courses.duytan.edu.vn</a>
            </p>
          </div>

          <div class="form-group">
            <label class="form-label">Kênh thông báo</label>
            <div style="display: flex; gap: 24px; margin-top: 8px;">
              <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                <input type="checkbox" id="notifyTelegram" checked />
                📱 Telegram
              </label>
              <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                <input type="checkbox" id="notifyEmail" checked />
                📧 Email
              </label>
            </div>
          </div>

          <button type="submit" class="btn btn-primary" style="width: 100%;">
            Thêm vào danh sách
          </button>
        </form>
      </div>
    </div>
  `;
}

function renderHeader(isLoggedIn = false) {
  return `
    <header class="header">
      <div class="header-content container">
        <a href="javascript:navigate('${
          isLoggedIn ? "dashboard" : "landing"
        }')" class="logo">
          <span class="logo-icon">📚</span>
          <span class="gradient-text">MyDTU Monitor</span>
        </a>
        
        ${
          isLoggedIn
            ? `
          <nav class="nav">
            <a href="javascript:navigate('dashboard')" class="nav-link ${
              state.currentPage === "dashboard" ? "active" : ""
            }">
              📊 Dashboard
            </a>
            <a href="javascript:navigate('settings')" class="nav-link ${
              state.currentPage === "settings" ? "active" : ""
            }">
              ⚙️ Cài đặt
            </a>
            <a href="javascript:logout()" class="nav-link">
              🚪 Đăng xuất
            </a>
          </nav>
        `
            : `
          <nav class="nav">
            <a href="javascript:navigate('login')" class="nav-link">Đăng nhập</a>
            <button class="btn btn-primary btn-sm" onclick="navigate('register')">
              Đăng ký
            </button>
          </nav>
        `
        }
      </div>
    </header>
  `;
}

function renderSettingsPage() {
  return `
    <div class="page">
      ${renderHeader(true)}
      
      <main class="dashboard container">
        <div class="dashboard-header">
          <h1 class="dashboard-title">Cài đặt</h1>
        </div>

        <div class="card" style="margin-bottom: 24px;">
          <h3 style="margin-bottom: 16px;">👤 Tài khoản</h3>
          <p class="text-muted"><strong>Username:</strong> ${
            state.user?.username ||
            '<span class="text-warning">Chưa thiết lập</span>'
          } <button class="btn btn-sm btn-ghost" onclick="openUpdateUsernameModal()">✏️</button></p>
          <p class="text-muted"><strong>Email:</strong> ${state.user?.email}</p>
          <p style="margin-top: 8px;">
            ${
              state.user?.email_verified
                ? '<span style="color: var(--success);">✓ Đã xác minh</span>'
                : `
              <span style="color: var(--warning);">⚠ Chưa xác minh</span>
              <button class="btn btn-sm btn-ghost" onclick="openVerifyModal()" style="margin-left: 8px; text-decoration: underline;">
                Xác thực ngay
              </button>
              `
            }
          </p>
          ${
            state.user?.email === "rinroblox365@gmail.com" ||
            state.user?.username === "rynne"
              ? `
            <button class="btn btn-ghost" style="width: 100%; margin-top: 12px; color: var(--text-muted);" onclick="navigate('admin')">
              🛡️ Trang Quản trị
            </button>
            `
              : ""
          }
        </div>

        <div class="card" style="margin-bottom: 24px;">
          <h3 style="margin-bottom: 16px;">📱 Liên kết Telegram</h3>
          ${
            state.user?.telegram_connected
              ? `
            <p style="color: var(--success); margin-bottom: 16px;">✓ Đã liên kết với Telegram</p>
            <button class="btn btn-secondary" onclick="handleUnlinkTelegram()">
              Hủy liên kết
            </button>
          `
              : `
            <p class="text-muted" style="margin-bottom: 16px;">
              Liên kết với Telegram để nhận thông báo nhanh chóng
            </p>
            <button class="btn btn-primary" onclick="handleGenerateTelegramCode()">
              Tạo mã liên kết
            </button>
            <div id="telegramCodeResult" style="margin-top: 16px;"></div>
          `
          }
        </div>

        <div class="card">
          <h3 style="margin-bottom: 16px; color: var(--error);">🚨 Vùng nguy hiểm</h3>
          <button class="btn btn-danger" onclick="if(confirm('Bạn có chắc muốn đăng xuất?')) logout()">
            Đăng xuất
          </button>
        </div>
      </main>
    </div>
  `;
}

async function renderAdminPage() {
  if (
    !state.user ||
    (state.user.email !== "rinroblox365@gmail.com" &&
      state.user.username !== "rynne")
  ) {
    navigate("dashboard");
    return;
  }

  let usersHtml = '<div class="text-center">Đang tải...</div>';

  try {
    const data = await api("/admin/users");
    const users = data.data.users;

    usersHtml = `
      <div class="card" style="overflow-x: auto;">
        <div style="margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center;">
          <h3>Quản lý thành viên</h3>
          <button class="btn btn-sm btn-ghost" onclick="render()">🔄 Làm mới</button>
        </div>
        <table style="width: 100%; border-collapse: collapse; min-width: 800px;">
          <thead>
            <tr style="border-bottom: 2px solid var(--border-color);">
              <th style="padding: 12px; text-align: left;">ID</th>
              <th style="padding: 12px; text-align: left;">Username</th>
              <th style="padding: 12px; text-align: left;">Email</th>
              <th style="padding: 12px; text-align: left;">Telegram</th>
              <th style="padding: 12px; text-align: left;">Ngày tạo</th>
              <th style="padding: 12px; text-align: left;">Hành động</th>
            </tr>
          </thead>
          <tbody>
            ${users
              .map(
                (u) => `
              <tr style="border-bottom: 1px solid var(--border-color);">
                <td style="padding: 12px;"><strong>${u.id}</strong></td>
                <td style="padding: 12px;">${u.username || "-"}</td>
                <td style="padding: 12px;">${u.email}</td>
                <td style="padding: 12px;">
                  ${
                    u.telegram_chat_id
                      ? '<span style="color: var(--success);">✅</span>'
                      : '<span style="color: var(--error);">❌</span>'
                  }
                </td>
                <td style="padding: 12px;">${new Date(
                  u.created_at
                ).toLocaleDateString("vi-VN")}</td>
                <td style="padding: 12px;">
                   <button class="btn btn-sm btn-ghost" onclick="openAdminEditUser(${
                     u.id
                   })">✏️</button>
                   <button class="btn btn-sm btn-danger" onclick="handleAdminDeleteUser(${
                     u.id
                   })">🗑️</button>
                </td>
              </tr>
            `
              )
              .join("")}
          </tbody>
        </table>
      </div>
    `;
  } catch (error) {
    usersHtml = `<div class="card error">Lỗi tải dữ liệu: ${error.message}</div>`;
  }

  return `
    <div class="page">
      ${renderHeader(true)}
      <main class="container">
        <button class="btn btn-ghost" onclick="navigate('settings')" style="margin-bottom: 24px;">
          ← Quay lại
        </button>
        <h1 style="margin-bottom: 24px;">🛡️ Quản trị hệ thống</h1>
        
        <div class="card" style="margin-bottom: 24px;">
          <h3 style="margin-bottom: 16px;">🧪 Test Thông báo</h3>
          <div style="display: flex; gap: 12px; flex-wrap: wrap;">
            <button class="btn btn-secondary" onclick="handleTestTelegram()">
              📱 Test Telegram
            </button>
            <button class="btn btn-secondary" onclick="handleTestEmail()">
              📧 Test Email
            </button>
          </div>
        </div>
        
        ${usersHtml}
      </main>
      ${renderAdminUserModal()}
    </div>
  `;
}

// ============================================
// Event Handlers
// ============================================
async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;

  try {
    await login(email, password);
  } catch (error) {
    showToast(error.message, "error");
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const email = document.getElementById("email").value;
  const username = document.getElementById("username").value;
  const password = document.getElementById("password").value;
  const confirmPassword = document.getElementById("confirmPassword").value;

  if (password !== confirmPassword) {
    showToast("Mật khẩu xác nhận không khớp", "error");
    return;
  }

  try {
    await register(email, username, password);
  } catch (error) {
    showToast(error.message, "error");
  }
}

async function handleAddWatch(e) {
  e.preventDefault();
  const classUrl = document.getElementById("classUrl").value;
  const notifyTelegram = document.getElementById("notifyTelegram").checked;
  const notifyEmail = document.getElementById("notifyEmail").checked;

  try {
    await addWatchItem(classUrl, notifyTelegram, notifyEmail);
    closeAddModal();
    render();
  } catch (error) {
    showToast(error.message, "error");
  }
}

function confirmDelete(id, name) {
  if (confirm(`Xóa "${name}" khỏi danh sách theo dõi?`)) {
    deleteWatchItem(id).then(render);
  }
}

async function handleGenerateTelegramCode() {
  try {
    const data = await generateTelegramCode();
    document.getElementById("telegramCodeResult").innerHTML = `
      <div class="card card-gradient" style="text-align: center; padding: 24px;">
        <p style="margin-bottom: 8px;">Gửi mã này đến <a href="https://t.me/MyDTU_BOT" target="_blank">@MyDTU_BOT</a>:</p>
        <div style="font-size: 2rem; font-weight: 800; letter-spacing: 0.2em; font-family: monospace; color: var(--primary-light);">
          ${data.code}
        </div>
        <p class="text-muted text-sm" style="margin-top: 8px;">
          Mã hết hạn sau 10 phút
        </p>
      </div>
    `;
  } catch (error) {
    showToast(error.message, "error");
  }
}

async function handleUnlinkTelegram() {
  if (!confirm("Bạn có chắc muốn hủy liên kết Telegram?")) return;
  try {
    await unlinkTelegram();
    render();
  } catch (error) {
    showToast(error.message, "error");
  }
}

async function handleVerifyEmail(e) {
  e.preventDefault();
  const code = document.getElementById("verifyCode").value;

  try {
    const data = await api("/auth/verify", {
      method: "POST",
      body: JSON.stringify({ code }),
    });

    showToast(data.message, "success");
    closeVerifyModal();
    // Refresh user data
    await checkAuth();
    render();
  } catch (error) {
    showToast(error.message, "error");
  }
}

async function handleResendVerification() {
  try {
    const data = await api("/auth/resend-verification", { method: "POST" });
    showToast(data.message, "success");
  } catch (error) {
    showToast(error.message, "error");
  }
}

function openAddModal() {
  document.getElementById("addModal").classList.add("active");
}

function closeAddModal() {
  document.getElementById("addModal").classList.remove("active");
}

function openVerifyModal() {
  const modal = document.getElementById("verifyModal");
  if (modal) modal.classList.add("active");
  else showToast("Vui lòng tải lại trang", "error");
}

function closeVerifyModal() {
  const modal = document.getElementById("verifyModal");
  if (modal) modal.classList.remove("active");
}

function closeModal(e) {
  if (e.target.classList.contains("modal-overlay")) {
    e.target.classList.remove("active");
  }
}

function renderUpdateUsernameModal() {
  return `
    <div id="updateUsernameModal" class="modal-overlay" onclick="closeModal(event)">
      <div class="modal card" onclick="event.stopPropagation()">
        <div class="modal-header">
          <h2 class="modal-title">Cập nhật Username</h2>
          <button class="modal-close" onclick="closeUpdateUsernameModal()">✕</button>
        </div>
        <form onsubmit="handleUpdateUsername(event)">
          <div class="form-group">
            <label class="form-label">Username mới</label>
            <input type="text" id="newUsername" class="form-input" required minlength="3" maxlength="20" pattern="[a-zA-Z0-9_]+" title="Chữ cái, số và gạch dưới">
          </div>
          <button type="submit" class="btn btn-primary" style="width: 100%;">Lưu thay đổi</button>
        </form>
      </div>
    </div>
  `;
}

function renderAdminUserModal() {
  return `
    <div id="adminUserModal" class="modal-overlay" onclick="closeModal(event)">
      <div class="modal card" onclick="event.stopPropagation()">
        <div class="modal-header">
          <h2 class="modal-title">Chỉnh sửa thành viên</h2>
          <button class="modal-close" onclick="closeAdminUserModal()">✕</button>
        </div>
        <form onsubmit="handleAdminSaveUser(event)">
          <input type="hidden" id="editUserId">
          <div class="form-group">
            <label class="form-label">Username</label>
            <input type="text" id="editUsername" class="form-input">
          </div>
          <div class="form-group">
            <label class="form-label">Email</label>
            <input type="email" id="editEmail" class="form-input">
          </div>
          <div class="form-group">
            <label class="form-label">Mật khẩu mới (để trống nếu không đổi)</label>
            <input type="text" id="editPassword" class="form-input" placeholder="Nhập để reset mật khẩu">
          </div>
          <button type="submit" class="btn btn-primary" style="width: 100%;">Lưu thay đổi</button>
        </form>
      </div>
    </div>
  `;
}

async function handleUpdateUsername(e) {
  e.preventDefault();
  const username = document.getElementById("newUsername").value;
  try {
    const data = await api("/auth/username", {
      method: "PUT",
      body: JSON.stringify({ username }),
    });
    showToast(data.message, "success");
    closeUpdateUsernameModal();
    await checkAuth(); // Refresh user data
    render();
  } catch (error) {
    showToast(error.message, "error");
  }
}

async function handleAdminDeleteUser(id) {
  console.log("Delete user called with id:", id);
  const confirmMsg = `Bạn có chắc chắn muốn xóa User ID: ${id}?\n\nHành động này KHÔNG THỂ hoàn tác!`;
  if (!confirm(confirmMsg)) {
    console.log("User cancelled delete");
    return;
  }

  try {
    console.log("Calling delete API...");
    const data = await api(`/admin/users/${id}`, { method: "DELETE" });
    console.log("Delete response:", data);
    showToast(data.message || "Đã xóa người dùng", "success");
    render(); // Refresh list
  } catch (error) {
    console.error("Delete error:", error);
    showToast(error.message || "Lỗi xóa người dùng", "error");
  }
}

async function openAdminEditUser(userId) {
  try {
    const data = await api("/admin/users");
    const user = data.data.users.find((u) => u.id === userId);
    if (!user) {
      showToast("Không tìm thấy người dùng", "error");
      return;
    }

    const modal = document.getElementById("adminUserModal");
    if (modal) {
      document.getElementById("editUserId").value = user.id;
      document.getElementById("editUsername").value = user.username || "";
      document.getElementById("editEmail").value = user.email;
      document.getElementById("editPassword").value = "";
      modal.classList.add("active");
    }
  } catch (error) {
    showToast(error.message, "error");
  }
}

async function handleAdminSaveUser(e) {
  e.preventDefault();
  const id = document.getElementById("editUserId").value;
  const username = document.getElementById("editUsername").value;
  const email = document.getElementById("editEmail").value;
  const password = document.getElementById("editPassword").value;

  const body = { username, email };
  if (password) body.password = password;

  try {
    const data = await api(`/admin/users/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
    showToast(data.message, "success");
    closeAdminUserModal();
    render();
  } catch (error) {
    showToast(error.message, "error");
  }
}

async function handleTestTelegram() {
  try {
    const data = await api("/admin/test-telegram", { method: "POST" });
    showToast(data.message, "success");
  } catch (error) {
    showToast(error.message, "error");
  }
}

async function handleTestEmail() {
  try {
    const data = await api("/admin/test-email", { method: "POST" });
    showToast(data.message, "success");
  } catch (error) {
    showToast(error.message, "error");
  }
}

function openUpdateUsernameModal() {
  document.getElementById("updateUsernameModal")?.classList.add("active");
}
function closeUpdateUsernameModal() {
  document.getElementById("updateUsernameModal")?.classList.remove("active");
}
function closeAdminUserModal() {
  document.getElementById("adminUserModal")?.classList.remove("active");
}

// ============================================
// Main Render
// ============================================
async function render() {
  if (isRendering) return;
  isRendering = true;

  try {
    const app = document.getElementById("app");

    // Check if protected page
    const protectedPages = ["dashboard", "settings", "history", "admin"];
    if (protectedPages.includes(state.currentPage)) {
      if (!state.user && !(await checkAuth())) {
        state.currentPage = "login";
        window.history.replaceState({ page: "login" }, "", "/login");
        // Don't call navigate here, just update state and continue rendering
      }

      // Load data for dashboard
      if (state.currentPage === "dashboard") {
        await loadWatchItems();
      }
    }

    let html = "";
    switch (state.currentPage) {
      case "login":
        html = renderLoginPage();
        break;
      case "register":
        html = renderRegisterPage();
        break;
      case "dashboard":
        html = renderDashboardPage();
        break;
      case "settings":
        html = renderSettingsPage();
        break;
      case "admin":
        html = await renderAdminPage();
        break;
      default:
        html = renderLandingPage();
    }

    app.innerHTML = html;

    // Append modals if user is logged in
    if (state.user) {
      if (!state.user.email_verified) {
        app.insertAdjacentHTML("beforeend", renderVerifyModal());
      }
      // Add update username modal
      app.insertAdjacentHTML("beforeend", renderUpdateUsernameModal());
    }
  } finally {
    isRendering = false;
  }
}

// ============================================
// Initialize
// ============================================
async function init() {
  // Try to restore session first
  await checkAuth();

  // Parse current URL
  const path = window.location.pathname.replace("/", "") || "landing";
  state.currentPage = path;

  // Check auth and render
  await render();
}

// Make functions globally available
window.navigate = navigate;
window.logout = logout;
window.handleLogin = handleLogin;
window.handleRegister = handleRegister;
window.handleAddWatch = handleAddWatch;
window.openAddModal = openAddModal;
window.closeAddModal = closeAddModal;
window.closeModal = closeModal;
window.confirmDelete = confirmDelete;
window.refreshWatchItem = async (id) => {
  await refreshWatchItem(id);
  render();
};
window.handleGenerateTelegramCode = handleGenerateTelegramCode;
window.handleVerifyEmail = handleVerifyEmail;
window.handleResendVerification = handleResendVerification;
window.openVerifyModal = openVerifyModal;
window.closeVerifyModal = closeVerifyModal;

// New Account Management
window.openUpdateUsernameModal = openUpdateUsernameModal;
window.closeUpdateUsernameModal = closeUpdateUsernameModal;
window.handleUpdateUsername = handleUpdateUsername;
window.openAdminEditUser = openAdminEditUser;
window.closeAdminUserModal = closeAdminUserModal;
window.handleAdminDeleteUser = handleAdminDeleteUser;
window.handleAdminSaveUser = handleAdminSaveUser;
window.handleTestTelegram = handleTestTelegram;
window.handleTestEmail = handleTestEmail;

// Start app
init();
