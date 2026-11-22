(function () {
  const cfItemMetaCache = new Map();

  const KNOWN_GENRES = new Set([
    "family", "animation", "action", "adventure", "fantasy",
    "comedy", "drama", "romance", "mystery", "sci-fi", "science fiction",
    "crime", "thriller", "horror", "war", "western", "history", "documentary"
  ]);

  const GENRE_BUTTONS = [
    "Family", "Animation", "Action", "Adventure", "Fantasy",
    "Comedy", "Drama", "Romance", "Mystery", "Sci-Fi",
    "Crime", "Thriller", "War", "Western", "History", "Documentary", "Other"
  ];

  // ==========================================================================
  // 1. INJECT STYLES FOR FILTER BAR
  // ==========================================================================
  function ensurePageStyles() {
    if (document.getElementById("cfPagesStyles")) return;
    const style = document.createElement("style");
    style.id = "cfPagesStyles";
    style.textContent = `
      .cf-filter-bar {
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding: 12px 3.3% 14px 3.3%;
        margin-bottom: 6px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      }
      .cf-filter-row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px;
      }
      .cf-filter-group {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px;
      }
      .cf-filter-fav-wrap {
        margin-left: 24px;
      }
      .cf-pill-btn {
        background: rgba(255, 255, 255, 0.08);
        color: rgba(255, 255, 255, 0.88);
        border: 1px solid rgba(255, 255, 255, 0.16);
        border-radius: 18px;
        padding: 5px 14px;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
      }
      .cf-pill-btn:hover {
        background: rgba(255, 255, 255, 0.18);
        color: #fff;
      }
      .cf-pill-btn.active {
        background: #a85c32;
        border-color: #d47b4a;
        color: #fff;
        font-weight: 600;
      }
      .cf-hidden-by-filter {
        display: none !important;
      }
    `;
    document.head.appendChild(style);
  }

  // ==========================================================================
  // 2. BATCH ITEM METADATA LOOKUP (PATH, GENRES, USERDATA)
  // ==========================================================================
  async function ensureItemsCached(ids) {
    const cleanIds = [...new Set(ids.map(id => String(id || "").replace(/-/g, "")).filter(Boolean))];
    const missing = cleanIds.filter(id => !cfItemMetaCache.has(id));
    if (missing.length === 0) return;

    const uid = ApiClient.getCurrentUserId();
    for (let i = 0; i < missing.length; i += 100) {
      const chunk = missing.slice(i, i + 100);
      try {
        const res = await ApiClient.getItems(uid, {
          Ids: chunk.join(","),
          Fields: "Path,Genres"
        });
        for (const item of (res.Items || [])) {
          const normId = (item.Id || "").replace(/-/g, "");
          const pathNorm = (item.Path || "").replace(/\\/g, "/");
          const isDiscover = /\/discover(\/|$)/i.test(pathNorm);
          const genres = (item.Genres || []).map(g => g.toLowerCase());
          const ud = item.UserData || {};
          const entry = {
            isDiscover,
            genres,
            played: !!ud.Played,
            inProgress: !ud.Played && (ud.PlaybackPositionTicks || 0) > 0,
            isFavorite: !!ud.IsFavorite
          };
          cfItemMetaCache.set(normId, entry);
          cfItemMetaCache.set(item.Id, entry);
        }
      } catch (err) {
        console.warn("CopperFox Pages metadata fetch failed:", err);
      }
    }
  }

  // ==========================================================================
  // 3. ITEM DETAIL PAGE: DISCOVER TOOLBAR + HIDE DISCOVER IN "MORE LIKE THIS"
  // ==========================================================================
  async function handleDetailPage() {
    const detailPage = document.querySelector("#itemDetailPage:not(.hide)");
    const hash = window.location.hash || "";
    if (!detailPage || !hash.includes("details")) return;

    const match = hash.match(/[?&]id=([^&]+)/);
    const detailId = match ? match[1] : null;
    if (!detailId) return;

    await ensureItemsCached([detailId]);
    const meta = cfItemMetaCache.get(detailId.replace(/-/g, ""));
    detailPage.classList.toggle("cf-discover-detail", !!(meta && meta.isDiscover));

    // Remove Discover items from "More Like This" (including Jellyfin Enhanced rows)
    const sectionCards = Array.from(detailPage.querySelectorAll(".card[data-id]"));
    if (sectionCards.length === 0) return;

    const ids = sectionCards.map(c => c.getAttribute("data-id")).filter(Boolean);
    await ensureItemsCached(ids);

    for (const card of sectionCards) {
      const id = (card.getAttribute("data-id") || "").replace(/-/g, "");
      const cardMeta = cfItemMetaCache.get(id);
      if (cardMeta && cardMeta.isDiscover) {
        card.remove();
      }
    }
  }

  // ==========================================================================
  // 4. FOLDER VIEWS (MOVIES, SHOWS, DISCOVER): FILTER SHORTCUT BAR
  // ==========================================================================
  const filterState = {
    status: null,      // "unwatched" | "continue" | "watched" | null
    favorite: false,   // true | false
    genres: new Set()  // Set of lowercase genre keys
  };

  function resetFilterState() {
    filterState.status = null;
    filterState.favorite = false;
    filterState.genres.clear();
  }

  function itemMatchesFilters(meta) {
    if (!meta) return true;

    if (filterState.status === "unwatched" && (meta.played || meta.inProgress)) return false;
    if (filterState.status === "continue" && !meta.inProgress) return false;
    if (filterState.status === "watched" && !meta.played) return false;

    if (filterState.favorite && !meta.isFavorite) return false;

    if (filterState.genres.size > 0) {
      let matched = false;
      for (const selected of filterState.genres) {
        if (selected === "sci-fi") {
          if (meta.genres.includes("sci-fi") || meta.genres.includes("science fiction")) {
            matched = true;
            break;
          }
        } else if (selected === "thriller") {
          if (meta.genres.includes("thriller") || meta.genres.includes("horror")) {
            matched = true;
            break;
          }
        } else if (selected === "other") {
          const hasKnown = meta.genres.some(g => KNOWN_GENRES.has(g));
          if (!hasKnown) {
            matched = true;
            break;
          }
        } else if (meta.genres.includes(selected)) {
          matched = true;
          break;
        }
      }
      if (!matched) return false;
    }

    return true;
  }

  async function applyLibraryGridFilters(pageEl) {
    if (!pageEl) return;
    const grid = pageEl.querySelector(".itemsContainer");
    if (!grid) return;

    const cards = Array.from(grid.querySelectorAll(".card[data-id]"));
    if (cards.length === 0) return;

    const hasActiveFilter = filterState.status !== null || filterState.favorite || filterState.genres.size > 0;
    if (!hasActiveFilter) {
      for (const card of cards) {
        card.classList.remove("cf-hidden-by-filter");
      }
      return;
    }

    const ids = cards.map(c => c.getAttribute("data-id")).filter(Boolean);
    await ensureItemsCached(ids);

    for (const card of cards) {
      const id = (card.getAttribute("data-id") || "").replace(/-/g, "");
      const meta = cfItemMetaCache.get(id);
      card.classList.toggle("cf-hidden-by-filter", !itemMatchesFilters(meta));
    }
  }

  function buildFilterBar(pageEl) {
    ensurePageStyles();
    const existing = pageEl.querySelector(".cf-filter-bar");
    if (existing) existing.remove();

    resetFilterState();

    const bar = document.createElement("div");
    bar.className = "cf-filter-bar";

    // Row 1: Favorites first (offset to the left) + Status (single-select)
    const topRow = document.createElement("div");
    topRow.className = "cf-filter-row cf-filter-status-row";

    const favWrap = document.createElement("div");
    favWrap.style.marginRight = "24px";
    const favBtn = document.createElement("button");
    favBtn.type = "button";
    favBtn.className = "cf-pill-btn";
    favBtn.textContent = "Favorites";
    favBtn.onclick = () => {
      filterState.favorite = !filterState.favorite;
      favBtn.classList.toggle("active", filterState.favorite);
      applyLibraryGridFilters(pageEl);
    };
    favWrap.appendChild(favBtn);

    const statusGroup = document.createElement("div");
    statusGroup.className = "cf-filter-group";

    const statuses = [
      { key: "unwatched", label: "Unwatched" },
      { key: "continue", label: "Continue" },
      { key: "watched", label: "Watched" }
    ];

    const statusButtons = [];
    statuses.forEach(st => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cf-pill-btn";
      btn.textContent = st.label;
      btn.onclick = () => {
        const wasActive = filterState.status === st.key;
        filterState.status = wasActive ? null : st.key;
        statusButtons.forEach(b => b.classList.remove("active"));
        if (!wasActive) btn.classList.add("active");
        applyLibraryGridFilters(pageEl);
      };
      statusButtons.push(btn);
      statusGroup.appendChild(btn);
    });

    topRow.appendChild(favWrap);
    topRow.appendChild(statusGroup);

    // Row 2: Multi-select Genres
    const genreRow = document.createElement("div");
    genreRow.className = "cf-filter-row";

    GENRE_BUTTONS.forEach(label => {
      const key = label.toLowerCase();
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cf-pill-btn";
      btn.textContent = label;
      btn.onclick = () => {
        if (filterState.genres.has(key)) {
          filterState.genres.delete(key);
          btn.classList.remove("active");
        } else {
          filterState.genres.add(key);
          btn.classList.add("active");
        }
        applyLibraryGridFilters(pageEl);
      };
      genreRow.appendChild(btn);
    });

    bar.appendChild(topRow);
    bar.appendChild(genreRow);
    return bar;
  }

  function handleFolderViews() {
    const hash = window.location.hash || "";
    const isFolderRoute =
      /^#\/(movies|tv|list)(\.html)?(\?|$)/i.test(hash) ||
      hash.includes("topParentId=") ||
      hash.includes("parentId=");

    if (!isFolderRoute) return;

    const activePage =
      document.querySelector(".libraryPage:not(.hide)") ||
      document.querySelector(".page:not(.hide)");
    if (!activePage) return;

    // Pick the main library grid container (ignore small header/tab scrollers)
    const grids = Array.from(activePage.querySelectorAll(".itemsContainer"));
    const grid = grids.find(g => g.querySelector(".card[data-id]")) || grids[0];
    if (!grid) return;

    // Inject bar once per page view / parentId change
    const currentViewKey = hash;
    if (activePage.dataset.cfFilterView !== currentViewKey || !activePage.querySelector(".cf-filter-bar")) {
      activePage.dataset.cfFilterView = currentViewKey;
      const bar = buildFilterBar(activePage);
      const anchor = grid.closest(".padded-left") || grid;
      anchor.parentNode.insertBefore(bar, anchor);

      const parentMatch = hash.match(/[?&](?:topParentId|parentId)=([^&]+)/i);
      const folderId = parentMatch ? parentMatch[1] : null;
      const headerTitle = (activePage.querySelector(".pageTitle, h1")?.textContent || "").trim().toLowerCase();
      if (headerTitle === "discover") {
        const statusRow = bar.querySelector(".cf-filter-status-row");
        if (statusRow) statusRow.style.display = "none";
      } else if (folderId) {
        ensureItemsCached([folderId]).then(() => {
          const fMeta = cfItemMetaCache.get(folderId.replace(/-/g, ""));
          if (fMeta && fMeta.isDiscover) {
            const statusRow = bar.querySelector(".cf-filter-status-row");
            if (statusRow) statusRow.style.display = "none";
          }
        });
      }
    }

    applyLibraryGridFilters(activePage);
  }

  // ==========================================================================
  // 5. ROUTE & DOM OBSERVERS
  // ==========================================================================
  let pageTimer = null;
  function schedulePageUpdate() {
    syncHeaderAndLogosNow();
    clearTimeout(pageTimer);
    pageTimer = setTimeout(() => {
      syncHeaderAndLogosNow();
      handleDetailPage();
      handleFolderViews();
    }, 200);
  }

  const observer = new MutationObserver(() => {
    syncHeaderAndLogosNow();
    schedulePageUpdate();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  resolveAdminStatus().then(() => syncHeaderAndLogosNow());
  document.addEventListener("viewshow", schedulePageUpdate);
  window.addEventListener("hashchange", schedulePageUpdate);
  setTimeout(schedulePageUpdate, 600);

  // ==========================================================================
  // 6. HEADER & DASHBOARD SIDEBAR LOGO SWAP + ADMIN "DASHBOARD" LINK
  // ==========================================================================
  let cfAdminStatus = null;
  let cfAdminPromise = null;

  function resolveAdminStatus() {
    if (cfAdminStatus !== null) return Promise.resolve(cfAdminStatus);
    if (!cfAdminPromise) {
      cfAdminPromise = ApiClient.getCurrentUser()
        .then(user => {
          cfAdminStatus = !!(user && user.Policy && user.Policy.IsAdministrator);
          return cfAdminStatus;
        })
        .catch(() => false);
    }
    return cfAdminPromise;
  }

  function syncHeaderAndLogosNow() {
    const logoUrl = ApiClient.getUrl("CopperFoxHome/Logo");

    // 1. Swap top header AND Dashboard left-sidebar logo images
    const logoImgs = document.querySelectorAll(
      ".skinHeader img, header img, .MuiButton-startIcon img, .MuiDrawer-root img, .mainDrawer img, .adminDrawerLogo img"
    );
    for (const img of logoImgs) {
      if (
        img.src &&
        (img.src.includes("icon-transparent") || img.src.includes("banner-light") || img.src.includes("banner-dark")) &&
        img.dataset.cfLogoSwapped !== "1"
      ) {
        img.dataset.cfLogoSwapped = "1";
        img.src = logoUrl;
        img.style.objectFit = "contain";
        if (img.closest("header, .skinHeader, .MuiButton-startIcon")) {
          img.style.width = "36px";
          img.style.height = "36px";
          img.style.maxWidth = "none";
          img.style.maxHeight = "none";
        }
      }

    if (cfAdminStatus === null) {
      resolveAdminStatus().then(() => syncHeaderAndLogosNow());
      return;
    }

    // 2. Insert "Dashboard" button in header right before "Favorites" for admins
    const existingDash = document.getElementById("cfHeaderDashboardBtn");
    if (!cfAdminStatus) {
      if (existingDash) existingDash.remove();
    } else if (!existingDash || !document.body.contains(existingDash)) {
      if (existingDash) existingDash.remove();
      const headerLinks = Array.from(document.querySelectorAll("header a, header button, .skinHeader a, .skinHeader button"));
      const favTab = headerLinks.find(el => (el.textContent || "").trim() === "Favorites");

      if (favTab && favTab.parentNode) {
        const dashBtn = favTab.cloneNode(true);
        dashBtn.id = "cfHeaderDashboardBtn";
        if (dashBtn.tagName === "A") {
          dashBtn.setAttribute("href", "#/dashboard");
        }
        const textEl = Array.from(dashBtn.querySelectorAll("*")).find(
          el => el.children.length === 0 && (el.textContent || "").trim() === "Favorites"
        );
        if (textEl) {
          textEl.textContent = "Dashboard";
        } else {
          dashBtn.textContent = "Dashboard";
        }
        dashBtn.classList.remove("Mui-selected", "emby-tab-button-active");
        dashBtn.setAttribute("aria-selected", "false");
        dashBtn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          window.location.hash = "#/dashboard";
        };
        favTab.parentNode.insertBefore(dashBtn, favTab);
      }
    }

    // 3. Hide CopperFox Home & Jellyfin Enhanced from user dropdown for non-admins
    if (!cfAdminStatus) {
      const popovers = document.querySelectorAll('.MuiPopover-root, .MuiMenu-root, .dialogContainer');
      for (const pop of popovers) {
        const items = Array.from(pop.querySelectorAll('li, a, button, [role="menuitem"]'));
        for (const el of items) {
          const txt = (el.textContent || "").trim();
          if (txt === "CopperFox Home" || /jellyfin enhanced/i.test(txt)) {
            el.style.display = "none";
          }
        }
      }
    }
  }
