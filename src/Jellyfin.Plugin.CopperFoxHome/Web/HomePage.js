(function () {
  let inFlight = false;
  let lastFetchTime = 0;
  
  function getItemHref(item) {
    if (item.Type === "CollectionFolder" || item.Type === "UserView") {
      const cType = (item.CollectionType || "").toLowerCase();
      if (cType === "movies") return `#/movies.html?topParentId=${item.Id}`;
      if (cType === "tvshows") return `#/tv.html?topParentId=${item.Id}`;
      if (cType === "music") return `#/music.html?topParentId=${item.Id}`;
      return `#/list.html?parentId=${item.Id}&serverId=${item.ServerId || ApiClient.serverId()}`;
    }
    if (item.SeriesId) {
      return `#/details?id=${item.SeriesId}`;
    }
    return `#/details?id=${item.Id}`;
  }
  
  function getThumbOrBackdropUrl(item, maxWidth) {
    const imgTags = item.ImageTags || {};

    if (item.Type === "CollectionFolder" || item.Type === "UserView") {
      if (imgTags.Primary) {
        return ApiClient.getImageUrl(item.Id, { type: "Primary", maxWidth: maxWidth, tag: imgTags.Primary });
      }
      if (imgTags.Thumb) {
        return ApiClient.getImageUrl(item.Id, { type: "Thumb", maxWidth: maxWidth, tag: imgTags.Thumb });
      }
    }

    if (item.Type === "Episode") {
      if (item.ParentThumbItemId && item.ParentThumbImageTag) {
        return ApiClient.getImageUrl(item.ParentThumbItemId, { type: "Thumb", maxWidth: maxWidth, tag: item.ParentThumbImageTag });
      }
      if (item.SeriesId) {
        return ApiClient.getImageUrl(item.SeriesId, { type: "Thumb", maxWidth: maxWidth, fallbackType: "Backdrop" });
      }
    }

    if (imgTags.Thumb) {
      return ApiClient.getImageUrl(item.Id, { type: "Thumb", maxWidth: maxWidth });
    }
    if (Array.isArray(item.BackdropImageTags) && item.BackdropImageTags.length > 0) {
      return ApiClient.getImageUrl(item.Id, { type: "Backdrop", maxWidth: maxWidth });
    }
    if (item.ParentBackdropItemId && Array.isArray(item.ParentBackdropImageTags) && item.ParentBackdropImageTags.length > 0) {
      return ApiClient.getImageUrl(item.ParentBackdropItemId, { type: "Backdrop", maxWidth: maxWidth });
    }

    return ApiClient.getImageUrl(item.Id, { type: "Primary", maxWidth: maxWidth });
  }
  
  const STREAMING_SERVICES = [
    { name: "Netflix", tags: ["netflix"], bg: "linear-gradient(135deg,#6e1116 0%,#141414 100%)", logo: "https://wikimedia.org" },
    { name: "Hulu", tags: ["hulu"], bg: "linear-gradient(135deg,#0f6b3e 0%,#0b1912 100%)", logo: "https://wikimedia.org" },
    { name: "Disney+", tags: ["disney+", "disney plus", "disney"], bg: "linear-gradient(135deg,#12357a 0%,#091124 100%)", logo: "https://wikimedia.org" },
    { name: "Max", tags: ["max", "hbo max", "hbo"], bg: "linear-gradient(135deg,#3b1d7a 0%,#120b24 100%)", logo: "https://wikimedia.org" },
    { name: "Prime Video", tags: ["prime", "prime video", "amazon prime", "amazon"], bg: "linear-gradient(135deg,#0d4f6b 0%,#0b151c 100%)", logo: "https://wikimedia.org" },
    { name: "Apple TV+", tags: ["apple", "apple tv", "apple tv+", "apple tv plus"], bg: "linear-gradient(135deg,#383838 0%,#121212 100%)", logo: "https://wikimedia.org" },
    { name: "Paramount+", tags: ["paramount", "paramount+", "paramount plus"], bg: "linear-gradient(135deg,#0e3a7d 0%,#081226 100%)", logo: "https://wikimedia.org" },
    { name: "Peacock", tags: ["peacock"], bg: "linear-gradient(135deg,#5e4810 0%,#17140a 100%)", logo: "https://wikimedia.org" }
  ];

  function renderCardHtml(item, styleMode, isContinueRow, isDiscoverRow) {
    if (item.isServiceTile) {
      return `<a href="#/list.html?cfService=${encodeURIComponent(item.Name)}&cfTags=${encodeURIComponent((item.tags || []).join(","))}" class="cf-service-tile" style="background:${item.bg};"><img src="${item.logo}" alt="${item.Name}" onerror="this.style.display='none';this.parentNode.textContent='${item.Name}';" /></a>`;
    }

    const isThumb = styleMode === "Thumb";
    const cardWidth = isThumb ? "330px" : "182px";
    const padderClass = isThumb ? "cardPadder-backdrop" : "cardPadder-portrait";
    const imgUrl = isThumb
      ? getThumbOrBackdropUrl(item, 600)
      : ApiClient.getImageUrl(item.Id, { type: "Primary", maxWidth: 360 });

    const href = getItemHref(item);
    const navId = item.SeriesId || item.Id;
    const isFolder = item.Type === "CollectionFolder" || item.Type === "UserView";
    const isBoxSet = item.Type === "BoxSet";
    const isSeries = item.Type === "Series" || item.Type === "Episode" || !!item.SeriesId;
    const isPlayed = !!(item.UserData && item.UserData.Played);
    const isFav = !!(item.UserData && item.UserData.IsFavorite);
    const isDiscover = !!(item.IsDiscover || isDiscoverRow);

    let tlText = "movie";
    if (isBoxSet) {
      tlText = item.ChildCount != null ? `collection | ${item.ChildCount}` : "collection";
    } else if (isSeries) {
      const sCount = item.SeriesChildCount != null ? item.SeriesChildCount : item.ChildCount;
      const eCount = item.SeriesEpisodeCount != null ? item.SeriesEpisodeCount : item.RecursiveItemCount;
      if (!isDiscover && sCount != null && eCount != null) {
        tlText = `${sCount}S | ${eCount}E`;
      } else {
        tlText = "show";
      }
    }
    const tlBadgeHtml = isFolder ? "" : `<div class="cf-badge-tl">${tlText}</div>`;

    const trBadgeHtml = (isContinueRow && item.SeriesName && item.ParentIndexNumber != null && item.IndexNumber != null)
      ? `<div class="cf-badge-tr">S${item.ParentIndexNumber}:E${item.IndexNumber}</div>`
      : "";

    const posTicks = (item.UserData && item.UserData.PlaybackPositionTicks > 0) ? item.UserData.PlaybackPositionTicks : 0;
    let progressBarHtml = "";
    if (posTicks > 0 && item.RunTimeTicks > 0) {
      const pct = Math.min(99, Math.max(2, Math.round((posTicks / item.RunTimeTicks) * 100)));
      progressBarHtml = `<div class="cf-progress-track"><div class="cf-progress-fill" style="width:${pct}%;"></div></div>`;
    }

    const watchedBtnHtml = isDiscover
      ? `<span style="width:30px;"></span>`
      : `<button type="button" class="cf-hover-btn cf-btn-played ${isPlayed ? "active-played" : ""}" data-id="${item.Id}" data-played="${isPlayed}" title="Mark Watched">
           <span class="material-icons check" style="font-size:22px;"></span>
         </button>`;

    const serverId = ApiClient.serverId();
    const playTargetId = item.Id;
    const playBtnHtml = isDiscover
      ? `<span style="width:40px;"></span>`
      : `<button type="button" class="cf-hover-btn cf-btn-play" data-id="${playTargetId}" title="Play">
           <span class="material-icons play_arrow" style="font-size:28px;"></span>
         </button>`;

    const overlayHtml = isFolder ? "" : `
      <div class="cf-hover-overlay">
        ${watchedBtnHtml}
        ${playBtnHtml}
        <button type="button" class="cf-hover-btn cf-btn-fav ${isFav ? "active-fav" : ""}" data-id="${item.Id}" data-fav="${isFav}" title="Favorite">
          <span class="material-icons favorite" style="font-size:22px;"></span>
        </button>
      </div>`;

    const fullHref = href.indexOf("serverId=") === -1 ? `${href}${href.indexOf("?") === -1 ? "?" : "&"}serverId=${serverId}` : href;
    const itemNameEscaped = (item.Name || "").replace(/"/g, "&quot;");
    const pathAttr = item.Path ? ` data-path="${String(item.Path).replace(/"/g, "&quot;")}"` : "";
    const prefixAttr = item.Name ? ` data-prefix="${String(item.Name).substring(0, 3).toUpperCase().replace(/"/g, "&quot;")}"` : "";

    return `
      <div class="card ${isThumb ? "backdropCard" : "portraitCard"} card-hoverable card-withuserdata cf-item-card" data-index="0" data-isfolder="${isFolder}" data-serverid="${serverId}" data-id="${playTargetId}" data-item-id="${item.Id}" data-type="${item.Type || ""}" data-mediatype="${item.MediaType || "Video"}" data-positionticks="${posTicks}"${pathAttr} data-context="home"${prefixAttr} style="width:${cardWidth};min-width:${cardWidth};flex:0 0 auto;">        <div class="cardBox">
          <div class="cardScalable">
            <div class="cardPadder ${padderClass}"></div>
            <a href="${fullHref}" aria-label="${itemNameEscaped}" class="cardImageContainer coveredImage cardContent itemAction" data-action="link" style="background-image:url('${imgUrl}');"></a>
            ${tlBadgeHtml}
            ${trBadgeHtml}
            ${progressBarHtml}
            ${overlayHtml}
          </div>
        </div>
      </div>`;
  }

  function renderLoadMoreCard(row) {
    if (!row.hasMore) return "";
    return `
      <div class="cf-load-more-card" data-row-index="${row.rowIndex}" data-row-key="${row.key}" data-row-type="${row.rowType}" data-scope="${row.scope || ""}">
        <span>MORE</span>
      </div>`;
  }

  function bindCardInteractions(scopeEl) {
    scopeEl.querySelectorAll(".cf-item-card").forEach(card => {
      if (card.dataset.cfNavBound) return;
      card.dataset.cfNavBound = "1";
      card.addEventListener("click", async function (e) {
        
      const playBtn = e.target.closest(".cf-btn-play");
        if (playBtn) {
          e.preventDefault();
          e.stopPropagation();
          playBtn.blur();
          const playId = playBtn.getAttribute("data-id") || card.getAttribute("data-item-id");
          const srvId = playBtn.getAttribute("data-serverid") || ApiClient.serverId();
          const itemType = card.getAttribute("data-type") || "Movie";
          const mediaType = card.getAttribute("data-mediatype") || "Video";
          const startPos = parseInt(card.getAttribute("data-positionticks") || "0", 10) || 0;

          if (window.playbackManager && typeof window.playbackManager.play === "function") {
            window.playbackManager.play({
              ids: [playId],
              serverId: srvId,
              startPositionTicks: startPos
            });
            return;
          }

          let nativeContainer = document.querySelector(".itemsContainer");
          let tempContainer = null;
          if (!nativeContainer) {
            tempContainer = document.createElement("div");
            tempContainer.className = "itemsContainer";
            tempContainer.style.display = "none";
            document.body.appendChild(tempContainer);
            nativeContainer = tempContainer;
          }

          const proxyCard = document.createElement("div");
          proxyCard.className = "card";
          proxyCard.setAttribute("data-id", playId);
          proxyCard.setAttribute("data-serverid", srvId);
          proxyCard.setAttribute("data-type", itemType);
          proxyCard.setAttribute("data-mediatype", mediaType);
          proxyCard.setAttribute("data-isfolder", "false");
          if (startPos > 0) {
            proxyCard.setAttribute("data-positionticks", String(startPos));
          }

          const proxyBtn = document.createElement("button");
          proxyBtn.type = "button";
          proxyBtn.className = "itemAction";
          proxyBtn.setAttribute("data-action", "resume");
          proxyCard.appendChild(proxyBtn);
          nativeContainer.appendChild(proxyCard);

          proxyBtn.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
          proxyCard.remove();
          if (tempContainer) tempContainer.remove();
          return;
        }

        const playedBtn = e.target.closest(".cf-btn-played");
        if (playedBtn) {
          e.preventDefault();
          e.stopPropagation();
          playedBtn.blur();
          const itemId = playedBtn.getAttribute("data-id");
          const nextPlayed = playedBtn.getAttribute("data-played") !== "true";
          const uid = ApiClient.getCurrentUserId();
          try {
            await ApiClient.ajax({
              type: nextPlayed ? "POST" : "DELETE",
              url: ApiClient.getUrl(`Users/${uid}/PlayedItems/${itemId}`)
            });
            playedBtn.setAttribute("data-played", String(nextPlayed));
            playedBtn.classList.toggle("active-played", nextPlayed);
          } catch (err) {
            console.error("Toggle watched failed:", err);
          }
          return;
        }

        const favBtn = e.target.closest(".cf-btn-fav");
        if (favBtn) {
          e.preventDefault();
          e.stopPropagation();
          favBtn.blur();
          const itemId = favBtn.getAttribute("data-id");
          const nextFav = favBtn.getAttribute("data-fav") !== "true";
          const uid = ApiClient.getCurrentUserId();
          try {
            await ApiClient.ajax({
              type: nextFav ? "POST" : "DELETE",
              url: ApiClient.getUrl(`Users/${uid}/FavoriteItems/${itemId}`)
            });
            favBtn.setAttribute("data-fav", String(nextFav));
            favBtn.classList.toggle("active-fav", nextFav);
          } catch (err) {
            console.error("Toggle favorite failed:", err);
          }
        }
      }, true);
    });

    scopeEl.querySelectorAll(".cf-item-card").forEach(card => {
      if (card.dataset.ctxBound) return;
      card.dataset.ctxBound = "1";

      const openContextMenu = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const itemId = card.getAttribute("data-item-id");
        const srvId = card.getAttribute("data-serverid") || ApiClient.serverId();
        const itemType = card.getAttribute("data-type") || "Movie";

        const existing = document.getElementById("cfQuickMenu");
        if (existing) existing.remove();

        const menu = document.createElement("div");
        menu.id = "cfQuickMenu";
        menu.style.cssText = `position:fixed;top:${Math.min(e.clientY, window.innerHeight - 140)}px;left:${Math.min(e.clientX, window.innerWidth - 200)}px;background:#202020;border:1px solid #444;border-radius:6px;padding:6px 0;z-index:99999;min-width:180px;box-shadow:0 8px 24px rgba(0,0,0,0.8);`;

        const triggerNativeAction = (action) => {
          const nativeContainer = document.querySelector(".itemsContainer");
          if (!nativeContainer) return;

          const scroller = nativeContainer.closest(".emby-scroller");
          const savedScroll = scroller ? scroller.scrollLeft : 0;

          const proxyCard = document.createElement("div");
          proxyCard.className = "card";
          proxyCard.style.cssText = "position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none;";
          proxyCard.setAttribute("data-id", itemId);
          proxyCard.setAttribute("data-serverid", srvId);
          proxyCard.setAttribute("data-type", itemType);

          const proxyBtn = document.createElement("button");
          proxyBtn.type = "button";
          proxyBtn.className = "itemAction";
          proxyBtn.setAttribute("data-action", action);
          proxyCard.appendChild(proxyBtn);
          nativeContainer.appendChild(proxyCard);

          proxyBtn.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
          proxyCard.remove();

          if (scroller) {
            scroller.scrollLeft = savedScroll;
            requestAnimationFrame(() => { scroller.scrollLeft = savedScroll; });
          }
        };

        const options = [
          { name: "Edit Metadata", id: "edit" },
          { name: "Edit Images", id: "images" },
          { name: "Refresh Metadata", id: "refresh" }
        ];

        options.forEach(opt => {
          const row = document.createElement("div");
          row.textContent = opt.name;
          row.style.cssText = "padding:9px 14px;color:#fff;font-size:14px;cursor:pointer;";
          row.onmouseenter = () => row.style.background = "#333";
          row.onmouseleave = () => row.style.background = "transparent";
          row.onclick = async () => {
            menu.remove();
            if (opt.id === "edit") triggerNativeAction("edit");
            if (opt.id === "images") {
              triggerNativeAction("menu");
              let attempts = 0;
              const pickEditImages = setInterval(() => {
                attempts++;
                const sheetBtns = Array.from(document.querySelectorAll(".actionSheetMenuItem, .listItem"));
                const imgBtn = sheetBtns.find(b => /edit images/i.test(b.textContent || ""));
                if (imgBtn) {
                  clearInterval(pickEditImages);
                  imgBtn.click();
                } else if (attempts > 20) {
                  clearInterval(pickEditImages);
                }
              }, 25);
            }
            if (opt.id === "refresh") {
              await ApiClient.ajax({
                type: "POST",
                url: ApiClient.getUrl(`Items/${itemId}/Refresh`, {
                  Recursive: true,
                  ImageRefreshMode: "Default",
                  MetadataRefreshMode: "Default"
                })
              });
            }
          };
          menu.appendChild(row);
        });

        document.body.appendChild(menu);
        setTimeout(() => document.addEventListener("click", () => menu.remove(), { once: true }), 10);
      };

      card.addEventListener("contextmenu", openContextMenu);
      card.addEventListener("dblclick", openContextMenu);
    });
  }

  function paintRows(container, rows) {
    if (!container || !rows || !rows.length) return;

    const existingCustom = Array.from(container.querySelectorAll(".cf-custom-section"));
    const activeKeys = new Set(rows.filter(r => r.items && r.items.length).map(r => r.key));
    existingCustom.forEach(el => {
      if (!activeKeys.has(el.id)) el.remove();
    });

    for (const row of rows) {
      if (!row.items || !row.items.length) continue;

      if (row.rowType === "SliderRow") {
        const sliderTitle = (row.title || "Featured").replace(/:$/, "");
        const isDiscoverSlider = (row.scope === "DiscoverOnly") || (row.title || "").toLowerCase().startsWith("discover");
        if (isDiscoverSlider && !container.querySelector(".cf-discover-divider")) {
          const hr = document.createElement("hr");
          hr.className = "cf-discover-divider";
          container.appendChild(hr);
        }

        const slidesHtml = row.items.map((item, idx) => {
          const imgUrl = item.BackdropImageTags && item.BackdropImageTags.length > 0
            ? ApiClient.getUrl(`Items/${item.Id}/Images/Backdrop/0`, { maxWidth: 1920, quality: 90 })
            : ApiClient.getUrl(`Items/${item.Id}/Images/Thumb`, { maxWidth: 1920, quality: 90 });
          const year = item.ProductionYear ? ` (${item.ProductionYear})` : "";
          const overview = (item.Overview || "").replace(/</g, "&lt;").replace(/>/g, "&gt;");
          return `
            <div class="cf-slider-slide${idx === 0 ? " active" : ""}" data-idx="${idx}" data-href="#/details?id=${item.Id}" style="background-image:url('${imgUrl}');">
              <div class="cf-slider-gradient"></div>
              <div class="cf-slider-caption">
                <h3>${(item.Name || "").replace(/</g, "&lt;")}${year}</h3>
                <p>${overview}</p>
              </div>
            </div>`;
        }).join("");

        const dotsHtml = row.items.map((_, idx) =>
          `<span class="cf-slider-dot${idx === 0 ? " active" : ""}" data-idx="${idx}"></span>`
        ).join("");

        let section = document.getElementById(row.key);
        if (!section) {
          section = document.createElement("div");
          section.id = row.key;
          section.className = "cf-custom-section";
          section.style.cssText = "display:block;width:100%;";
          container.appendChild(section);
        }

        section.innerHTML = `
          <div class="cf-slider-wrap" data-active="0" data-count="${row.items.length}">
            <div class="cf-slider-header">${sliderTitle}</div>
            ${slidesHtml}
            <button type="button" class="cf-slider-arrow cf-slider-prev" aria-label="Previous"><span class="material-icons chevron_left" style="font-size:30px;"></span></button>
            <button type="button" class="cf-slider-arrow cf-slider-next" aria-label="Next"><span class="material-icons chevron_right" style="font-size:30px;"></span></button>
            <div class="cf-slider-dots">${dotsHtml}</div>
          </div>`;

        const wrap = section.querySelector(".cf-slider-wrap");
        const goSlide = (nextIdx) => {
          const count = parseInt(wrap.getAttribute("data-count"), 10);
          const target = ((nextIdx % count) + count) % count;
          wrap.setAttribute("data-active", String(target));
          wrap.querySelectorAll(".cf-slider-slide").forEach(el => el.classList.toggle("active", parseInt(el.getAttribute("data-idx"), 10) === target));
          wrap.querySelectorAll(".cf-slider-dot").forEach(el => el.classList.toggle("active", parseInt(el.getAttribute("data-idx"), 10) === target));
        };

        wrap.onclick = () => {
          const activeSlide = wrap.querySelector(".cf-slider-slide.active");
          if (activeSlide) window.location.hash = activeSlide.getAttribute("data-href");
        };

        let autoTimer = null;
        const startAuto = () => {
          if (autoTimer) clearInterval(autoTimer);
          autoTimer = setInterval(() => {
            if (!document.body.contains(wrap)) {
              clearInterval(autoTimer);
              return;
            }
            goSlide(parseInt(wrap.getAttribute("data-active"), 10) + 1);
          }, 5000);
        };

        wrap.onmouseenter = () => {
          if (autoTimer) clearInterval(autoTimer);
        };
        wrap.onmouseleave = () => startAuto();

        wrap.querySelector(".cf-slider-prev").onclick = (e) => {
          e.stopPropagation();
          goSlide(parseInt(wrap.getAttribute("data-active"), 10) - 1);
          startAuto();
        };
        wrap.querySelector(".cf-slider-next").onclick = (e) => {
          e.stopPropagation();
          goSlide(parseInt(wrap.getAttribute("data-active"), 10) + 1);
          startAuto();
        };

        startAuto();
        continue;
      }

      const styleMode = row.imageStyle || ((row.rowType === "MyMedia" || row.rowType === "ContinueAndUpNext" || row.rowType === "RecentlyAdded" || row.rowType === "LatestMovies" || row.rowType === "LatestShows" || row.rowType === "StreamingServices") ? "Thumb" : "Poster");
      const isContinueRow = row.rowType === "ContinueAndUpNext";
      const isDiscoverRow = row.scope === "DiscoverOnly";
      const cardsHtml = row.items.map(item => renderCardHtml(item, styleMode, isContinueRow, isDiscoverRow)).join("") + renderLoadMoreCard(row);
      const displayTitle = (row.title || "").replace(/:$/, "");

      let section = document.getElementById(row.key);
      if (!section) {
        section = document.createElement("div");
        section.id = row.key;
        section.className = "cf-custom-section";
        section.style.cssText = "display:block;width:100%;margin-bottom:1.5em;";
      }

      section.innerHTML = `
        <div class="sectionTitleContainer sectionTitleContainer-cards padded-left">
          <h2 class="sectionTitle sectionTitle-cards cf-section-title">${displayTitle}</h2>
        </div>
        <div class="cf-scroll-row">
          ${cardsHtml}
        </div>`;

      container.appendChild(section);
    }

    bindCardInteractions(container);

    container.querySelectorAll(".cf-load-more-card").forEach(btn => {
      btn.onclick = async function () {
        const rowIndex = parseInt(btn.getAttribute("data-row-index"), 10);
        const rowType = btn.getAttribute("data-row-type");
        const scope = btn.getAttribute("data-scope");
        const scrollRow = btn.parentElement;
        const currentCount = scrollRow.querySelectorAll(".cf-item-card").length;
        btn.style.opacity = "0.5";
        btn.style.pointerEvents = "none";
        try {
          const uid = ApiClient.getCurrentUserId();
          if (rowType === "LatestMovies" || rowType === "LatestShows") {
            const cfgData = await ApiClient.fetch({ url: ApiClient.getUrl("CopperFoxHome/Rows", { userId: uid }), type: "GET", dataType: "json" });
            const discoverLibId = (cfgData && cfgData.discoverLibraryId) || "";
            const itemType = rowType === "LatestMovies" ? "Movie" : "Series";
            const res = await ApiClient.getItems(uid, {
              ParentId: discoverLibId,
              IncludeItemTypes: itemType,
              Recursive: true,
              SortBy: "DateCreated,SortName",
              SortOrder: "Descending",
              StartIndex: currentCount,
              Limit: 14,
              Fields: "PrimaryImageAspectRatio,BackdropImageTags,UserData,ChildCount,RecursiveItemCount,RunTimeTicks",
              ImageTypeLimit: 1,
              EnableImageTypes: "Primary,Backdrop,Thumb"
            });
            const newItems = (res && res.Items) || [];
            const total = (res && res.TotalRecordCount) || 0;
            const styleMode = btn.closest(".cf-custom-section").querySelector(".backdropCard") ? "Thumb" : "Poster";
            const newHtml = newItems.map(item => renderCardHtml(item, styleMode, false, scope === "DiscoverOnly")).join("");
            btn.insertAdjacentHTML("beforebegin", newHtml);
            bindCardInteractions(scrollRow);
            if (currentCount + newItems.length >= total || newItems.length === 0) {
              btn.remove();
            } else {
              btn.style.opacity = "1";
              btn.style.pointerEvents = "auto";
            }
            return;
          }

          const data = await ApiClient.fetch({
            url: ApiClient.getUrl("CopperFoxHome/Rows", { userId: uid, rowIndex: rowIndex, skip: currentCount }),
            type: "GET",
            dataType: "json"
          });
          const updatedRow = data && Array.isArray(data.rows) && data.rows[0];
          if (updatedRow && updatedRow.items && updatedRow.items.length) {
            const styleMode = updatedRow.imageStyle || "Poster";
            const isDiscoverRow = updatedRow.scope === "DiscoverOnly";
            const newHtml = updatedRow.items.map(item => renderCardHtml(item, styleMode, false, isDiscoverRow)).join("");
            btn.insertAdjacentHTML("beforebegin", newHtml);
            bindCardInteractions(scrollRow);
            if (!updatedRow.hasMore) {
              btn.remove();
            } else {
              btn.style.opacity = "1";
              btn.style.pointerEvents = "auto";
            }
          } else {
            btn.remove();
          }
        } catch (err) {
          console.error("Load more error:", err);
          btn.remove();
        }
      };
    });
  }

  async function resolveClientRows(userId, payload) {
    const rows = payload.rows || [];
    const myMediaOrder = payload.myMediaOrder || [];
    const excludedMyMediaIds = new Set(payload.excludedMyMediaIds || []);
    const discoverLibId = payload.discoverLibraryId || "";

    await Promise.all(rows.map(async (row) => {
      if (row.rowType === "StreamingServices") {
        row.items = STREAMING_SERVICES.map(s => ({ isServiceTile: true, Name: s.name, tags: s.tags, bg: s.bg, logo: s.logo }));
        if (!row.title) row.title = "Streaming Services";
      } else if (row.rowType === "Collection" && row.targetValue && (!row.items || !row.items.length)) {
        const res = await ApiClient.getItems(userId, { ParentId: row.targetValue, Fields: "UserData,ChildCount,RecursiveItemCount,RunTimeTicks,BackdropImageTags", EnableImageTypes: "Primary,Backdrop,Thumb" });
        row.items = (res && res.Items) || [];
        if (!row.title) row.title = "Collection";
      } else if (row.rowType === "MyMedia") {
        const viewsRes = await ApiClient.getUserViews(userId);
        const allViews = (viewsRes && viewsRes.Items) || [];
        const visible = allViews.filter(v => !excludedMyMediaIds.has(v.Id));
        const ordered = [];
        myMediaOrder.forEach(id => {
          const found = visible.find(v => v.Id === id);
          if (found) ordered.push(found);
        });
        visible.forEach(v => {
          if (!ordered.some(o => o.Id === v.Id)) ordered.push(v);
        });
        row.items = ordered;
        if (!row.title) row.title = "My Media";
      } else if (row.rowType === "ContinueAndUpNext") {
        const [resumeRes, nextUpRes] = await Promise.all([
          ApiClient.getResumableItems(userId, { Limit: 25, Fields: "PrimaryImageAspectRatio,ParentThumbItemId,ParentThumbImageTag,UserData,RunTimeTicks,BackdropImageTags", ImageTypeLimit: 1, EnableImageTypes: "Primary,Backdrop,Thumb" }).catch(() => ({ Items: [] })),
          ApiClient.getNextUpEpisodes({ UserId: userId, Limit: 25, Fields: "PrimaryImageAspectRatio,ParentThumbItemId,ParentThumbImageTag,UserData,RunTimeTicks,BackdropImageTags", ImageTypeLimit: 1, EnableImageTypes: "Primary,Backdrop,Thumb" }).catch(() => ({ Items: [] }))
        ]);

        const resumeItems = (resumeRes && resumeRes.Items) || [];
        const nextUpItems = (nextUpRes && nextUpRes.Items) || [];
        const latestBySeries = new Map();
        const allCandidates = [...resumeItems, ...nextUpItems].filter(item => item.Type !== "Series");

        for (const item of allCandidates) {
          if (item.SeriesId) {
            const existing = latestBySeries.get(item.SeriesId);
            if (!existing) {
              latestBySeries.set(item.SeriesId, item);
            } else {
              const curScore = ((item.ParentIndexNumber || 0) * 10000) + (item.IndexNumber || 0);
              const exScore = ((existing.ParentIndexNumber || 0) * 10000) + (existing.IndexNumber || 0);
              if (curScore > exScore) latestBySeries.set(item.SeriesId, item);
            }
          }
        }

        const combined = [];
        const seen = new Set();
        for (const item of allCandidates) {
          const chosen = item.SeriesId ? latestBySeries.get(item.SeriesId) : item;
          if (chosen && !seen.has(chosen.Id)) {
            seen.add(chosen.Id);
            combined.push(chosen);
          }
        }

        const seriesIds = Array.from(latestBySeries.keys());
        if (seriesIds.length > 0) {
          const seriesRes = await ApiClient.getItems(userId, { Ids: seriesIds.join(","), Fields: "ChildCount,RecursiveItemCount" }).catch(() => null);
          const sMap = new Map(((seriesRes && seriesRes.Items) || []).map(s => [s.Id, s]));
          combined.forEach(item => {
            if (item.SeriesId && sMap.has(item.SeriesId)) {
              const sObj = sMap.get(item.SeriesId);
              item.SeriesChildCount = sObj.ChildCount;
              item.SeriesEpisodeCount = sObj.RecursiveItemCount;
            }
          });
        }

        row.items = combined;
        if (!row.title) row.title = "Continue Watching";
      } else if (row.rowType === "LatestMovies") {
        const isDiscover = row.scope === "DiscoverOnly";
        if (isDiscover && discoverLibId) {
          const res = await ApiClient.getItems(userId, {
            ParentId: discoverLibId,
            IncludeItemTypes: "Movie",
            Recursive: true,
            SortBy: "DateCreated,SortName",
            SortOrder: "Descending",
            Limit: 14,
            Fields: "PrimaryImageAspectRatio,BackdropImageTags,UserData,RunTimeTicks",
            ImageTypeLimit: 1,
            EnableImageTypes: "Primary,Backdrop,Thumb"
          }).catch(() => null);
          row.items = (res && res.Items) || [];
          row.hasMore = ((res && res.TotalRecordCount) || 0) > row.items.length;
        } else {
          const viewsRes = await ApiClient.getUserViews(userId);
          const allViews = (viewsRes && viewsRes.Items) || [];
          const movieViews = allViews.filter(v => (!discoverLibId || v.Id !== discoverLibId) && (v.CollectionType || "").toLowerCase() === "movies");
          const fetched = await Promise.all(movieViews.map(v => ApiClient.getLatestItems({
            UserId: userId,
            ParentId: v.Id,
            IncludeItemTypes: "Movie",
            Limit: 14,
            Fields: "PrimaryImageAspectRatio,BackdropImageTags,UserData,RunTimeTicks",
            ImageTypeLimit: 1,
            EnableImageTypes: "Primary,Backdrop,Thumb"
          })));
          row.items = fetched.flat().sort((a, b) => new Date(b.DateCreated || 0) - new Date(a.DateCreated || 0)).slice(0, 12);
        }
        if (!row.title) row.title = row.scope === "DiscoverOnly" ? "DISCOVER Latest Movies" : "Latest Movies";
      } else if (row.rowType === "LatestShows") {
        const isDiscover = row.scope === "DiscoverOnly";
        if (isDiscover && discoverLibId) {
          const res = await ApiClient.getItems(userId, {
            ParentId: discoverLibId,
            IncludeItemTypes: "Series",
            Recursive: true,
            SortBy: "DateCreated,SortName",
            SortOrder: "Descending",
            Limit: 14,
            Fields: "PrimaryImageAspectRatio,BackdropImageTags,UserData,ChildCount,RecursiveItemCount",
            ImageTypeLimit: 1,
            EnableImageTypes: "Primary,Backdrop,Thumb"
          }).catch(() => null);
          row.items = (res && res.Items) || [];
          row.hasMore = ((res && res.TotalRecordCount) || 0) > row.items.length;
        } else {
          const viewsRes = await ApiClient.getUserViews(userId);
          const allViews = (viewsRes && viewsRes.Items) || [];
          const showViews = allViews.filter(v => (!discoverLibId || v.Id !== discoverLibId) && (v.CollectionType || "").toLowerCase() === "tvshows");
          const fetched = await Promise.all(showViews.map(v => ApiClient.getLatestItems({
            UserId: userId,
            ParentId: v.Id,
            IncludeItemTypes: "Series",
            GroupItems: true,
            Limit: 14,
            Fields: "PrimaryImageAspectRatio,BackdropImageTags,UserData,ChildCount,RecursiveItemCount",
            ImageTypeLimit: 1,
            EnableImageTypes: "Primary,Backdrop,Thumb"
          })));
          row.items = fetched.flat().sort((a, b) => new Date(b.DateCreated || 0) - new Date(a.DateCreated || 0)).slice(0, 12);
        }
        if (!row.title) row.title = row.scope === "DiscoverOnly" ? "DISCOVER Latest Shows" : "Latest Shows";
      }
    }));

    return rows;
  }

  async function renderServiceSubPage() {
    const hash = window.location.hash || "";
    if (!hash.includes("cfService=")) return false;

    const queryString = hash.includes("?") ? hash.split("?")[1] : "";
    const params = new URLSearchParams(queryString);
    const serviceName = params.get("cfService") || "Streaming";
    const serviceTags = (params.get("cfTags") || serviceName.toLowerCase())
      .split(",")
      .map(t => t.trim().toLowerCase())
      .filter(Boolean);

    const activePage = document.querySelector(".page:not(.hide)") || document.body;
    const pageContainer = activePage.querySelector(".content-primary, .itemsContainer") || activePage;

    pageContainer.innerHTML = `<div style="padding:40px;text-align:center;opacity:0.75;font-size:16px;">Loading ${serviceName}...</div>`;

    try {
      const uid = ApiClient.getCurrentUserId();
      const cfgData = await ApiClient.fetch({
        url: ApiClient.getUrl("CopperFoxHome/Rows", { userId: uid }),
        type: "GET",
        dataType: "json"
      });
      const discoverLibId = (cfgData && cfgData.discoverLibraryId) || "";

      const queryOpts = {
        Recursive: true,
        IncludeItemTypes: "Movie,Series",
        SortBy: "SortName",
        SortOrder: "Ascending",
        Fields: "PrimaryImageAspectRatio,BackdropImageTags,UserData,ChildCount,RecursiveItemCount,RunTimeTicks,Tags",
        EnableImageTypes: "Primary,Backdrop,Thumb",
        Limit: 1000
      };
      if (discoverLibId) {
        queryOpts.ParentId = discoverLibId;
      }

      const allRes = await ApiClient.getItems(uid, queryOpts);
      const allItems = (allRes && allRes.Items) || [];
      const discoverItems = allItems.filter(item =>
        Array.isArray(item.Tags) && item.Tags.some(t =>
          serviceTags.some(st => t.toLowerCase().includes(st))
        )
      );

      const cardsHtml = discoverItems.length
        ? discoverItems.map(item => renderCardHtml(item, "Poster", false, true)).join("")
        : `<div style="padding:24px 0;opacity:0.75;font-size:15px;">No items found in Discover for ${serviceName}.</div>`;

      pageContainer.innerHTML = `
        <div id="cfServiceSubPage" class="cf-custom-section" style="padding:20px 3.3%;">
          <div style="display:flex;align-items:center;gap:14px;margin-bottom:18px;">
            <button type="button" id="cfSvcBackBtn" style="background:rgba(255,255,255,0.12);border:none;color:#fff;border-radius:6px;padding:7px 14px;cursor:pointer;font-size:14px;">← Back</button>
            <h2 class="sectionTitle sectionTitle-cards cf-section-title" style="margin:0;">DISCOVER on ${serviceName}</h2>
          </div>
          <div class="cf-service-grid">
            ${cardsHtml}
          </div>
        </div>`;

      const backBtn = document.getElementById("cfSvcBackBtn");
      if (backBtn) {
        backBtn.onclick = () => window.history.back();
      }
      bindCardInteractions(pageContainer);
    } finally {
      if (window.Dashboard && Dashboard.hideLoadingMsg) Dashboard.hideLoadingMsg();
      document.querySelectorAll(".docspinner").forEach(el => el.remove());
    }
    return true;
  }

  async function loadOnce() {
    if (!window.ApiClient || inFlight) return;
    if (await renderServiceSubPage()) return;

    const container = document.querySelector(".homeSectionsContainer");
    if (!container) return;

    const now = Date.now();
    if (now - lastFetchTime < 4000) return;

    const userId = ApiClient.getCurrentUserId();
    if (!userId) return;

    inFlight = true;
    lastFetchTime = now;
    try {
      let accumulatedRows = [];

      // Stage 1: Instant 6-hour cached Top Hero Slider
      const data1 = await ApiClient.fetch({
        url: ApiClient.getUrl("CopperFoxHome/Rows", { userId: userId, stage: 1 }),
        type: "GET",
        dataType: "json"
      }).catch(() => null);

      if (data1 && data1.rows && data1.rows.length > 0) {
        const resolved1 = await resolveClientRows(userId, data1);
        accumulatedRows = [...resolved1];
        paintRows(container, accumulatedRows);
      }

      // Stage 2: Owned Library Rows
      const data2 = await ApiClient.fetch({
        url: ApiClient.getUrl("CopperFoxHome/Rows", { userId: userId, stage: 2 }),
        type: "GET",
        dataType: "json"
      }).catch(() => null);

      if (data2 && data2.rows && data2.rows.length > 0) {
        const resolved2 = await resolveClientRows(userId, data2);
        accumulatedRows = [...accumulatedRows, ...resolved2];
        paintRows(container, accumulatedRows);
      }

      // Stage 3: Discover Only Rows
      const data3 = await ApiClient.fetch({
        url: ApiClient.getUrl("CopperFoxHome/Rows", { userId: userId, stage: 3 }),
        type: "GET",
        dataType: "json"
      }).catch(() => null);

      if (data3 && data3.rows && data3.rows.length > 0) {
        const resolved3 = await resolveClientRows(userId, data3);
        accumulatedRows = [...accumulatedRows, ...resolved3];
        paintRows(container, accumulatedRows);
      }
    } catch (e) {
      console.error("CopperFox Home rows error:", e);
    } finally {
      inFlight = false;
    }
  }

  let cfIsAdminCache = null;
  async function checkIsAdmin() {
    if (cfIsAdminCache !== null) return cfIsAdminCache;
    try {
      const user = await ApiClient.getCurrentUser();
      cfIsAdminCache = !!(user && user.Policy && user.Policy.IsAdministrator);
      return cfIsAdminCache;
    } catch {
      return false;
    }
  }

  async function injectUserMenuLink() {
    const isAdmin = await checkIsAdmin();
    const popovers = document.querySelectorAll('.MuiPopover-root, .MuiMenu-root, .dialogContainer');

    // Hide plugin links (CopperFox Home & Jellyfin Enhanced) for non-admin users
    if (!isAdmin) {
      for (const pop of popovers) {
        const items = Array.from(pop.querySelectorAll('li, a, button, [role="menuitem"]'));
        for (const el of items) {
          const txt = (el.textContent || "").trim();
          if (txt === "CopperFox Home" || /jellyfin enhanced/i.test(txt)) {
            el.style.display = "none";
          }
        }
      }
      return;
    }

    if (document.getElementById("cfHomeUserMenuLink")) return;
    for (const pop of popovers) {
      const items = Array.from(pop.querySelectorAll('li, a, button, [role="menuitem"]'));
      const settingsItem = items.find(el => el.textContent && el.textContent.trim() === "Settings");
      if (!settingsItem) continue;

      const clone = settingsItem.cloneNode(true);
      clone.id = "cfHomeUserMenuLink";

      const textNode = Array.from(clone.querySelectorAll("*")).find(
        el => el.children.length === 0 && el.textContent.trim() === "Settings"
      );
      if (textNode) textNode.textContent = "CopperFox Home";

      clone.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        const backdrop = pop.querySelector(".MuiBackdrop-root");
        if (backdrop) backdrop.click();
        window.location.hash = "#/configurationpage?name=CopperFox%20Home";
      });

      settingsItem.parentNode.insertBefore(clone, settingsItem.nextSibling);
      break;
    }
  }

  const menuObserver = new MutationObserver(function (mutations) {
    for (const m of mutations) {
      if (m.addedNodes.length > 0) {
        injectUserMenuLink();
        break;
      }
    }
  });
  menuObserver.observe(document.body, { childList: true });

  const isHomeRoute = () => {
    const h = window.location.hash || "";
    return h === "" || h === "#" || h.startsWith("#/home");
  };
  document.addEventListener("viewshow", () => { if (isHomeRoute()) setTimeout(loadOnce, 350); });
  window.addEventListener("hashchange", () => { if (isHomeRoute()) setTimeout(loadOnce, 350); });
  setInterval(() => {
    const s = document.getElementById("cfHomeStyles");
    if (s && document.head.lastElementChild !== s) document.head.appendChild(s);
  }, 800);
  setTimeout(loadOnce, 600);
})();