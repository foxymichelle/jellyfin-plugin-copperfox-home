# CopperFox Home — System Architecture

## 1. Overview & Repository Layout

CopperFox Home is a two-part system that replaces Jellyfin's default home screen across both the **Jellyfin Web UI** (via an ASP.NET Core plugin) and **Roku TV** (via a BrighterScript fork of Starfin). Both clients consume a single unified backend API (`/CopperFoxHome/Rows`) so row ordering, library separation (`OwnedOnly` vs. `DiscoverOnly`), hero sliders, and item filtering remain synchronized across devices.

### Jellyfin Server Plugin (`Jellyfin.Plugin.CopperFoxHome`)
* **`Plugin.cs`** — Registers the plugin with Jellyfin (`Id = Guid.Parse("...")`), binds `PluginConfiguration`, and exposes `Configuration/configPage.html` as an embedded dashboard resource.
* **`Configuration/PluginConfiguration.cs`** — Defines the persistent XML configuration model (`HeroSlider`, `DiscoverSlider`, `Rows`, `DiscoverLibraryId`, `MyMediaLibraryOrder`, `ExcludedMyMediaIds`).
* **`Configuration/configPage.html`** — Dashboard settings UI for configuring the Top Hero Slider, Owned Library Rows, Discover Hero Slider, Discover Only Rows, and My Media library ordering/visibility.
* **`Api/CopperFoxHomeController.cs`** — REST controller serving `/CopperFoxHome/Rows`, `/CopperFoxHome/ClientScript`, and `/CopperFoxHome/ClearSliderCache`, plus server-side filtering, collection grouping, and 24-hour in-memory caching.
* **`Web/HomePage.js`** — Embedded client script injected into the Jellyfin web app to render custom rows, hero sliders, horizontal scroll containers, service tiles, and inline pagination.

---

## 2. Configuration Schema (`PluginConfiguration.cs`)

| Property | Type | Purpose |
| :--- | :--- | :--- |
| `DiscoverLibraryId` | `string` | Library `Guid` (e.g., Jellybridge/Discover folder) used to partition `OwnedOnly` items from `DiscoverOnly` items. |
| `HeroSlider` | `HeroSliderConfig` | Locked Row 0 banner for Owned Library items (`Enabled`, `Title`, `IncludeTags`, `ExcludeTags`). |
| `DiscoverSlider` | `HeroSliderConfig` | Locked top banner for the Discover section (`Enabled`, `Title`, `IncludeTags`, `ExcludeTags`). |
| `Rows` | `List<CustomHomeRowDefinition>` | Ordered list of Owned and Discover rows (`Title`, `RowType`, `Scope`, `TargetValue`, `ExcludeTags`, `ImageStyle`, `GroupIntoCollections`). |
| `MyMediaLibraryOrder` | `List<string>` | Explicit display order of library `Guid`s inside the `MyMedia` row. |
| `ExcludedMyMediaIds` | `List<string>` | Library `Guid`s hidden from the `MyMedia` row. |

---

## 3. Backend API Endpoints (`CopperFoxHomeController.cs`)

### `GET /CopperFoxHome/Rows`
Returns resolved, filtered, and paginated home rows for the requesting user.

* **Query Parameters:**
  * `userId` (`Guid`, required) — Target Jellyfin user ID.
  * `stage` (`int?`, optional) — Progressive loading stage (`1` = Top Hero Slider, `2` = Owned Library Rows, `3` = Discover Hero Slider + Discover Only Rows). When omitted, all stages are returned in a single payload.
  * `rowIndex` (`int?`, optional) & `skip` (`int`, default `0`) — Used by inline **MORE** pagination to fetch the next 20 items for a specific row without re-evaluating other rows.
* **Unified Row Ordering (`unifiedRows`):**
  1. **Stage 1 (`rowIndex = 0`):** `HeroSlider` (`RowType = "SliderRow"`, `Scope = "OwnedOnly"`, max 10 items).
  2. **Stage 2:** All `Rows` where `Scope != "DiscoverOnly"`.
  3. **Stage 3:** `DiscoverSlider` (`RowType = "SliderRow"`, `Scope = "DiscoverOnly"`, max 16 items), followed by all `Rows` where `Scope == "DiscoverOnly"`.

### `POST /CopperFoxHome/ClearSliderCache`
Clears the 24-hour in-memory row cache (`_rowCache`).

* **Query Parameters:**
  * `scope` (`string?`, optional) — Pass `OwnedOnly` or `DiscoverOnly` to clear only that section's cached items, or omit to clear all cached rows.
* **Triggers:** Called automatically when saving `configPage.html` or manually via the **Refresh Owned Library Rows** / **Refresh Discover Rows** buttons.

### `GET /CopperFoxHome/ClientScript`
Serves the embedded `Web/HomePage.js` script (`application/javascript`) to the Jellyfin web client.

---

## 4. Row Resolution, Filtering & Caching Pipeline

1. **Scope Isolation (`ApplyScopeFilter`):**
   * `OwnedOnly` excludes any item whose ancestor chain contains `DiscoverLibraryId`.
   * `DiscoverOnly` restricts items exclusively to descendants of `DiscoverLibraryId`.
2. **Collection Grouping (`GroupIntoCollections`):**
   * Enabled by default for all dynamic rows (`Genre`, `Tag`, `TopGenre1–3`, `BecauseYouWatched`, `RecentlyAdded`, `LatestMovies`, `LatestShows`).
   * Maps movies belonging to a `BoxSet` to their parent collection so multi-part franchises appear once rather than flooding rows.
   * For `SliderRow`, deduplicates by `BoxSet` so at most one movie from any collection appears in the banner rotation.
3. **24-Hour In-Memory Cache (`_rowCache`):**
   * `ConcurrentDictionary<string, (DateTime ExpiresAt, List<Guid> ItemIds)>` caches randomized item ID lists for **24 hours** on `SliderRow`, `Genre`, and `Tag`/`Keyword` rows.
   * Subsequent page loads and inline `skip` pagination requests hydrate `BaseItem` objects directly from `_libraryManager.GetItemById(id)` without re-running expensive random pool queries.
   * Dynamic user-state rows (`ContinueAndUpNext`, `RecentlyAdded`, `TopGenre1–3`, `BecauseYouWatched`) bypass the 24-hour cache so watch progress and recent additions update immediately.

---

## 5. Client Rendering Architecture

### Jellyfin Web UI (`Web/HomePage.js`)
* **3-Stage Progressive Paint (`loadOnce`):** Fetches `stage=1`, `stage=2`, and `stage=3` sequentially via `ApiClient.fetch` and paints rows into `.homeSectionsContainer` as each stage arrives.
* **Client-Only Rows:** `StreamingServices` rows are preserved when empty on the server (`isClientOnlyRow = true`) and resolved client-side into styled service tiles (`#cf-service-tile`) linking to filtered tag views.
* **Visual Separation:** Automatically injects `<hr class="cf-discover-divider">` immediately above the Discover Hero Slider (`scope === "DiscoverOnly"`).
* **Card Overlays:** Renders top-left type/count badges (`movie`, `show`, `xS | yE`, `collection | N`), top-right episode badges (`S1:E1` on `ContinueAndUpNext`), playback progress bars, and hover toggles for **Mark Watched** and **Favorite**.

### Starfin Roku Client (`starfin-roku` — `copperfox-tv` branch)
* **Parallel 3-Stage Tasks (`HomePage.bs` + `CustomHomeRowsTask.bs`):** Launches `customHomeRows1` (`stage=1`), `customHomeRows2` (`stage=2`), and `customHomeRows3` (`stage=3`) concurrently, dismisses the loading spinner as soon as Stage 1 renders, and sorts shelves by server `rowIndex` as Stages 2 and 3 arrive.
* **GPU Texture Optimization (`getHomeItemImageUrl`):** Requests `1280px` backdrops for `SliderRow` and `500px` thumbnails at `quality=85` to stay within Roku's hardware texture cache during vertical scrolling.
* **Slider Timer Lifecycle (`HomeShelf.bs`):** Runs a 5-second auto-advance timer (`cfSliderTimer`) only while the `SliderRow` shelf has focus (`onCfShelfFocusChanged`) and pauses it automatically when scrolled off-screen.
