(function () {
  if (document.getElementById("cfHomeStyles")) return;

  const style = document.createElement("style");
  style.id = "cfHomeStyles";
  style.textContent = `
    /* ==========================================================================
       1. CARD CONTAINERS & HOVER ZOOM
       ========================================================================== */
    .cf-custom-section .cardBox,
    .itemsContainer .cardBox,
    .cardBox {
      background: transparent !important;
      box-shadow: none !important;
    }

    .cf-custom-section .cardText,
    .itemsContainer .cardText,
    .cardText {
      background: transparent !important;
      color: inherit !important;
    }

    .itemsContainer .card:not(.episodeCard):not(.personCard) .cardText {
      display: none !important;
    }

    .cf-custom-section .cardScalable,
    .itemsContainer .cardScalable,
    .cardScalable {
      position: relative;
      transition: transform 0.18s ease, box-shadow 0.18s ease !important;
      border-radius: 6px !important;
      overflow: hidden !important;
    }

    .cf-custom-section .card:hover .cardScalable,
    .itemsContainer .card:hover .cardScalable,
    .card:hover .cardScalable {
      transform: scale(1.04) !important;
      box-shadow: 0 6px 18px rgba(0, 0, 0, 0.55) !important;
    }

    /* ==========================================================================
       2. HOVER OVERLAY & ACTION BUTTONS (WATCHED, PLAY, FAVORITE)
       ========================================================================== */
    .cf-hover-overlay {
      position: absolute !important;
      inset: 0 !important;
      background: linear-gradient(
        to top,
        rgba(0, 0, 0, 0.72) 0%,
        rgba(0, 0, 0, 0.4) 42px,
        rgba(0, 0, 0, 0) 90px
      ) !important;
      border-radius: 6px !important;
      opacity: 0;
      transition: opacity 0.18s ease;
      display: flex !important;
      align-items: flex-end !important;
      justify-content: space-between !important;
      padding: 10px 12px 14px 12px !important;
      pointer-events: none !important;
      z-index: 10 !important;
    }

    .cf-custom-section .card:hover .cf-hover-overlay {
      opacity: 1 !important;
    }

    .cf-hover-btn {
      pointer-events: auto !important;
      position: relative !important;
      z-index: 20 !important;
      background: transparent !important;
      border: none;
      color: rgba(255, 255, 255, 0.85) !important;
      cursor: pointer !important;
      padding: 4px !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      opacity: 0.92 !important;
      transition: opacity 0.15s ease, transform 0.15s ease, background-color 0.15s ease !important;
    }

    .cf-hover-btn:hover {
      opacity: 1 !important;
      color: #ffffff !important;
      transform: scale(1.18) !important;
    }

    /* Bottom-Center Play Button */
    .cf-btn-play {
      width: 48px !important;
      height: 48px !important;
      border-radius: 50% !important;
      background-color: rgba(0, 0, 0, 0.7) !important;
      border: 1px solid rgba(255, 255, 255, 0.7) !important;
      color: #fff !important;
      padding: 0 !important;
      box-shadow: none !important;
    }

    .cf-btn-play:hover {
      background-color: rgba(0, 0, 0, 0.95) !important;
      border: 1px solid rgba(255, 255, 255, 0.9) !important;
      transform: scale(1.12) !important;
    }

    .cf-btn-play .material-icons {
      color: #fff !important;
      font-size: 32px !important;
    }

    /* Watched Button States */
    .cf-btn-played .material-icons {
      font-size: 26px !important;
      text-shadow: 0 1px 4px rgba(0, 0, 0, 0.9) !important;
    }

    .cf-btn-played.active-played .material-icons {
      color: #f5a289 !important;
      -webkit-text-stroke: 0.5px #f5a289 !important;
    }

    /* Favorite Button States */
    .cf-btn-fav .material-icons {
      font-size: 26px !important;
      -webkit-text-stroke: 1px #ffffff !important;
    }

    .cf-btn-fav.active-fav .material-icons {
      color: #b5583c !important;
      -webkit-text-stroke: 1px #ffffff !important;
    }

    /* ==========================================================================
       3. BADGES & PROGRESS BAR
       ========================================================================== */
    .cf-badge-tl {
      position: absolute;
      top: 8px;
      left: 8px;
      background: rgba(0, 0, 0, 0.7);
      color: #fff;
      font-size: 13px;
      font-weight: 500;
      padding: 3px 7px;
      border-radius: 4px;
      opacity: 0;
      transition: opacity 0.18s ease;
      pointer-events: none;
      z-index: 3;
    }

    .cf-custom-section .card:hover .cf-badge-tl {
      opacity: 1;
    }

    .cf-badge-tr {
      position: absolute;
      top: 8px;
      right: 8px;
      background: rgba(0, 0, 0, 0.7);
      color: #fff;
      font-size: 13px;
      font-weight: 500;
      padding: 3px 5px;
      border-radius: 4px;
      pointer-events: none;
      z-index: 3;
    }

    .cf-progress-track {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      height: 5px;
      background: rgba(255, 255, 255, 0.5);
      z-index: 11;
      pointer-events: none;
    }

    .cf-progress-fill {
      height: 100%;
      background: #a85c32;
    }

    /* ==========================================================================
       4. HORIZONTAL SCROLL ROWS, LOAD MORE TILE & DISCOVER DIVIDER
       ========================================================================== */
    .cf-scroll-row {
      display: flex;
      flex-wrap: nowrap;
      overflow-x: auto;
      padding: 8px 3.3% 16px 3.3%;
      gap: 14px;
      -webkit-overflow-scrolling: touch;
      scrollbar-width: none;
      -ms-overflow-style: none;
    }

    .cf-scroll-row::-webkit-scrollbar {
      display: none;
    }

    .cf-load-more-card {
      width: 136px;
      min-width: 136px;
      flex: 0 0 auto;
      align-self: stretch;
      margin-bottom: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
      background: linear-gradient(135deg, #242424 0%, #0d0d0d 100%);
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: 6px;
      cursor: pointer;
      color: #fff;
      font-size: 14px;
      font-weight: 700;
      letter-spacing: 0.5px;
      transition: background 0.18s, transform 0.18s;
    }

    .cf-load-more-card:hover {
      background: linear-gradient(135deg, #323232 0%, #161616 100%);
      transform: scale(1.03);
    }

    .cf-discover-divider {
      width: 93.4%;
      margin: 28px 3.3% 28px 3.3%;
      border: none;
      border-top: 2px outset rgba(255, 255, 255, 0.45);
    }

    /* ==========================================================================
       5. STREAMING SERVICE TILES & SERVICE GRID
       ========================================================================== */
    .cf-service-grid {
      display: flex !important;
      flex-direction: row !important;
      flex-wrap: wrap !important;
      align-items: flex-start !important;
      gap: 16px !important;
      width: 100% !important;
    }

    .cf-service-grid .card {
      width: 182px !important;
      min-width: 182px !important;
      max-width: 182px !important;
      flex: 0 0 182px !important;
    }

    .cf-service-tile {
      width: 220px;
      min-width: 220px;
      height: 110px;
      flex: 0 0 auto;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 18px 24px;
      box-sizing: border-box;
      text-decoration: none !important;
      color: #fff !important;
      font-size: 23px !important;
      font-weight: 700;
      letter-spacing: 0.5px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.45);
      transition: transform 0.18s ease, box-shadow 0.18s ease;
    }

    .cf-service-tile:hover,
    .cf-service-tile:visited,
    .cf-service-tile:active {
      color: #fff !important;
      text-decoration: none !important;
      transform: scale(1.04);
      box-shadow: 0 8px 20px rgba(0, 0, 0, 0.65);
    }

    .cf-service-tile img {
      max-width: 78%;
      max-height: 56%;
      object-fit: contain;
      filter: brightness(0) invert(1);
    }

    /* ==========================================================================
       6. HERO / FEATURED SLIDER
       ========================================================================== */
    .cf-slider-wrap {
      position: relative;
      width: 93.4%;
      margin: 8px 3.3% 24px 3.3%;
      height: 480px;
      border-radius: 10px;
      overflow: hidden;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.65);
      cursor: pointer;
      background: #111;
    }

    .cf-slider-slide {
      position: absolute;
      inset: 0;
      background-size: cover;
      background-position: center 20%;
      opacity: 0;
      transition: opacity 0.45s ease;
      pointer-events: none;
    }

    .cf-slider-slide.active {
      opacity: 1;
      pointer-events: auto;
    }

    .cf-slider-gradient {
      position: absolute;
      inset: 0;
      background: linear-gradient(
        180deg,
        rgba(0, 0, 0, 0.65) 0%,
        rgba(0, 0, 0, 0.15) 40%,
        rgba(0, 0, 0, 0.85) 100%
      );
      pointer-events: none;
    }

    .cf-slider-header {
      position: absolute;
      top: 20px;
      left: 26px;
      z-index: 4;
      font-size: 1.25em;
      font-weight: 700;
      color: #fff;
      text-shadow: 0 2px 8px rgba(0, 0, 0, 0.8);
      pointer-events: none;
    }

    .cf-slider-caption {
      position: absolute;
      bottom: 26px;
      left: 28px;
      right: 90px;
      z-index: 4;
      color: #fff;
      pointer-events: none;
    }

    .cf-slider-caption h3 {
      margin: 0 0 6px 0;
      font-size: 26px;
      font-weight: 700;
      text-shadow: 0 2px 10px rgba(0, 0, 0, 0.9);
}

.cf-slider-caption p {
      margin: 0;
      font-size: 14px;
      opacity: 0.85;
      max-width: 720px;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .cf-slider-arrow {
      position: absolute;
      top: 50%;
      transform: translateY(-50%);
      z-index: 5;
      width: 44px;
      height: 44px;
      border-radius: 50%;
      border: none;
      background: rgba(0, 0, 0, 0.65);
      color: #fff;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.18s, transform 0.18s;
    }

    .cf-slider-arrow:hover {
      background: rgba(255, 255, 255, 0.85);
      color: #000;
      transform: translateY(-50%) scale(1.08);
    }

    .cf-slider-prev {
      left: 16px;
    }

    .cf-slider-next {
      right: 16px;
    }

    .cf-slider-dots {
      position: absolute;
      bottom: 22px;
      right: 26px;
      z-index: 5;
      display: flex;
      gap: 6px;
    }

    .cf-slider-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.35);
      transition: background 0.2s, transform 0.2s;
    }

    .cf-slider-dot.active {
      background: #fff;
      transform: scale(1.25);
    }

    /* ==========================================================================
       7. DISCOVER ITEMS (HIDE PLAY, WATCHED, MORE & EPISODE COUNT)
       ========================================================================== */
    .card[data-path*="discover" i] .countIndicator,
    .card[data-path*="discover" i] .cardOverlayFab-primary,
    .card[data-path*="discover" i] button[is="emby-playstatebutton"],
    .card[data-path*="discover" i] .cardOverlayButton[data-action="menu"],
    .card[data-path*="discover" i] .cf-btn-play,
    .card[data-path*="discover" i] .cf-btn-played,
    .card.cf-discover-item .countIndicator,
    .card.cf-discover-item .cardOverlayFab-primary,
    .card.cf-discover-item button[is="emby-playstatebutton"],
    .card.cf-discover-item .cardOverlayButton[data-action="menu"],
    .card.cf-discover-item .cf-btn-play,
    .card.cf-discover-item .cf-btn-played {
      display: none !important;
    }

    #itemDetailPage.cf-discover-detail .detailButtons .btnPlay,
    #itemDetailPage.cf-discover-detail .detailButtons .btnResume,
    #itemDetailPage.cf-discover-detail .detailButtons button[data-action="play"],
    #itemDetailPage.cf-discover-detail .detailButtons button[data-action="resume"],
    #itemDetailPage.cf-discover-detail .detailButtons button[is="emby-playstatebutton"],
    #itemDetailPage.cf-discover-detail .detailButtons .btnMoreCommands,
    #itemDetailPage.cf-discover-detail .detailButtons button[data-action="menu"],
    #itemDetailPage.cf-discover-detail .mainDetailButtons .btnPlay,
    #itemDetailPage.cf-discover-detail .mainDetailButtons .btnResume,
    #itemDetailPage.cf-discover-detail .mainDetailButtons button[is="emby-playstatebutton"],
    #itemDetailPage.cf-discover-detail .mainDetailButtons .btnMoreCommands {
      display: none !important;
    }
  `;
  document.head.appendChild(style);
})();