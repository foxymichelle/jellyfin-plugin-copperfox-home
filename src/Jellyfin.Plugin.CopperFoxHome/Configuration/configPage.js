define([], function () {
    "use strict";

    const pluginId = "c099e7f0-4a1b-4c8d-9e2a-7f1b3c5d8e9a";
    let collectionsList = [];
    let currentRows = [];

    async function loadCollectionsAndLibraries(page) {
        try {
            const userId = ApiClient.getCurrentUserId();
            if (!userId) return;

            const views = await ApiClient.getUserViews(userId);
            const libSelect = page.querySelector("#selectDiscoverLibrary");
            libSelect.innerHTML = '<option value="">None (No Discover Folder)</option>';
            (views.Items || []).forEach(v => {
                const opt = document.createElement("option");
                opt.value = v.Id;
                opt.textContent = v.Name;
                libSelect.appendChild(opt);
            });

            const boxSets = await ApiClient.getItems(userId, {
                IncludeItemTypes: "BoxSet,Playlist",
                Recursive: true,
                SortBy: "SortName"
            });
            collectionsList = boxSets.Items || [];
        } catch (err) {
            console.error("CopperFox Home: failed loading libraries/collections", err);
        }
    }

    function renderRows(page) {
        const container = page.querySelector("#rowsContainer");
        container.innerHTML = "";

        currentRows.forEach((row, idx) => {
            const card = document.createElement("div");
            card.style.cssText = "border:1px solid rgba(255,255,255,0.15);border-radius:8px;padding:16px;margin-bottom:14px;background:rgba(0,0,0,0.2);";

            const collectionOptions = collectionsList.map(c =>
                `<option value="${c.Id}" ${row.TargetValue === c.Id ? "selected" : ""}>${c.Name} (${c.Type})</option>`
            ).join("");

            const targetField = row.RowType === "Collection"
                ? `<select class="row-target emby-select" style="width:100%;padding:8px;margin-top:4px;background:#181818;color:#fff;border:1px solid #444;">
                     <option value="">-- Select Collection or Playlist --</option>
                     ${collectionOptions}
                   </select>`
                : `<input type="text" class="row-target emby-input" value="${row.TargetValue || ""}" placeholder="${row.RowType === "Keyword" ? "e.g. Christmas" : "Auto-generated from watch history"}" style="width:100%;margin-top:4px;" />`;

            card.innerHTML = `
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
                    <strong>Row #${idx + 1}</strong>
                    <div>
                        <button type="button" class="btn-up" style="margin-right:6px;padding:4px 10px;cursor:pointer;">↑</button>
                        <button type="button" class="btn-down" style="margin-right:6px;padding:4px 10px;cursor:pointer;">↓</button>
                        <button type="button" class="btn-del" style="color:#ff6b6b;padding:4px 10px;cursor:pointer;">Remove</button>
                    </div>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                    <div>
                        <label>Row Title</label>
                        <input type="text" class="row-title emby-input" value="${row.Title || ""}" style="width:100%;margin-top:4px;" />
                    </div>
                    <div>
                        <label>Row Type</label>
                        <select class="row-type emby-select" style="width:100%;padding:8px;margin-top:4px;background:#181818;color:#fff;border:1px solid #444;">
                            <option value="Collection" ${row.RowType === "Collection" ? "selected" : ""}>Collection / Playlist</option>
                            <option value="TopGenre" ${row.RowType === "TopGenre" ? "selected" : ""}>Top Genre For You (Auto)</option>
                            <option value="BecauseYouWatched" ${row.RowType === "BecauseYouWatched" ? "selected" : ""}>Because You Watched (Auto)</option>
                            <option value="Keyword" ${row.RowType === "Keyword" ? "selected" : ""}>Keyword / Title Match</option>
                        </select>
                    </div>
                    <div>
                        <label>Collection / Keyword Target</label>
                        ${targetField}
                    </div>
                    <div>
                        <label>Library Scope</label>
                        <select class="row-scope emby-select" style="width:100%;padding:8px;margin-top:4px;background:#181818;color:#fff;border:1px solid #444;">
                            <option value="OwnedOnly" ${row.Scope === "OwnedOnly" ? "selected" : ""}>Owned Libraries Only</option>
                            <option value="DiscoverOnly" ${row.Scope === "DiscoverOnly" ? "selected" : ""}>Discover Folder Only</option>
                        </select>
                    </div>
                </div>
            `;

            card.querySelector(".row-title").addEventListener("input", e => currentRows[idx].Title = e.target.value);
            card.querySelector(".row-type").addEventListener("change", e => {
                currentRows[idx].RowType = e.target.value;
                renderRows(page);
            });
            card.querySelector(".row-target").addEventListener("change", e => {
                currentRows[idx].TargetValue = e.target.value;
                if (currentRows[idx].RowType === "Collection" && !currentRows[idx].Title) {
                    const selected = collectionsList.find(c => c.Id === e.target.value);
                    if (selected) currentRows[idx].Title = selected.Name;
                    renderRows(page);
                }
            });
            card.querySelector(".row-scope").addEventListener("change", e => currentRows[idx].Scope = e.target.value);

            card.querySelector(".btn-up").addEventListener("click", () => {
                if (idx > 0) {
                    [currentRows[idx - 1], currentRows[idx]] = [currentRows[idx], currentRows[idx - 1]];
                    renderRows(page);
                }
            });
            card.querySelector(".btn-down").addEventListener("click", () => {
                if (idx < currentRows.length - 1) {
                    [currentRows[idx + 1], currentRows[idx]] = [currentRows[idx], currentRows[idx + 1]];
                    renderRows(page);
                }
            });
            card.querySelector(".btn-del").addEventListener("click", () => {
                currentRows.splice(idx, 1);
                renderRows(page);
            });

            container.appendChild(card);
        });
    }

    return function (view) {
        view.addEventListener("viewshow", async function () {
            Dashboard.showLoadingMsg();
            try {
                await loadCollectionsAndLibraries(view);
                const config = await ApiClient.getPluginConfiguration(pluginId);
                view.querySelector("#selectDiscoverLibrary").value = config.DiscoverLibraryId || "";
                currentRows = Array.isArray(config.Rows) ? config.Rows : [];
                renderRows(view);
            } catch (err) {
                console.error("CopperFox Home: failed loading config", err);
            } finally {
                Dashboard.hideLoadingMsg();
            }
        });

        view.querySelector("#btnAddRow").addEventListener("click", function () {
            currentRows.push({
                Title: "",
                RowType: "Collection",
                TargetValue: "",
                Scope: "OwnedOnly",
                SortBy: "SortName",
                SortOrder: "Ascending",
                Limit: 25
            });
            renderRows(view);
        });

        view.querySelector("#CopperFoxHomeConfigForm").addEventListener("submit", async function (e) {
            e.preventDefault();
            Dashboard.showLoadingMsg();
            try {
                const config = await ApiClient.getPluginConfiguration(pluginId);
                config.DiscoverLibraryId = view.querySelector("#selectDiscoverLibrary").value;
                config.Rows = currentRows;
                await ApiClient.updatePluginConfiguration(pluginId, config);
                Dashboard.processPluginConfigurationUpdateResult();
            } catch (err) {
                Dashboard.hideLoadingMsg();
                console.error("CopperFox Home: failed saving config", err);
            }
        });
    };
});
