# CopperFox Home — System Architecture

## 1. Overview & Repository Layout
CopperFox Home is a two-part system that replaces Jellyfin's default home screen across both the Jellyfin Web UI (via an ASP.NET Core plugin) and Roku TV (via a BrighterScript fork of Starfin). Both clients consume a single unified backend API (`/CopperFoxHome/Rows`) so row ordering, library separation (`OwnedOnly` vs. `DiscoverOnly`), hero sliders, and item filtering remain synchronized across devices.

### Jellyfin Server Plugin (`Jellyfin.Plugin.CopperFoxHome`)
* **`Plugin.cs`** — Registers the plugin with Jellyfin (`Id = Guid.Parse("...")`), binds `PluginConfiguration`, and exposes `Configuration/configPage.html` as an embedded dashboard resource.
* **`Configuration/PluginConfiguration.cs`** — Defines the persistent XML configuration model (`HeroSlider`, `DiscoverSlider`, `Rows`, `DiscoverLibraryId`, `MyMediaLibraryOrder`, `ExcludedMyMediaIds`).
* **`Configuration/configPage.html`** — Dashboard settings UI for configuring the Top Hero Slider, Owned Library Rows, Discover Hero Slider, Discover Only Rows, and My Media library ordering/visibility.
* **`Api/CopperFoxHomeController.cs`** — REST controller serving `/CopperFoxHome/Rows`, `/CopperFoxHome/ClientScript`, `/CopperFoxHome/Logo`, and `/CopperFoxHome/ClearSliderCache`, plus server-side filtering, collection grouping, `Path` projection, and 24-hour in-memory caching.
* **`Web/Styles.js`** — Embedded stylesheet injector (`#cfHomeStyles`) defining card hover scaling, bottom gradient overlays, circular play controls, watched/favorite states, badges, sliders, and Discover element hiding rules.
* **`Web/HomePage.js`** — Embedded client script injected into the Jellyfin web app to render custom rows, hero sliders, horizontal scroll containers, service tiles, inline pagination, hover playback/resume delegation, and the admin right-click context menu.
* **`Web/Pages.js`** — Embedded client script handling non-home views: custom header/sidebar/favicon logo swapping, admin `Dashboard` header link injection, non-admin menu cleanup, library folder quick-filter shortcut bars, and Discover isolation on item detail pages and *More Like This* rows.
* **`Web/logo.png`** — Embedded custom brand logo served at `/CopperFoxHome/Logo` for the web header, admin sidebar, and browser tab favicon.

---

## 2. Configuration Schema (`PluginConfiguration.cs`)

| Property | Type | Purpose |
| :--- | :--- | :--- |
| `DiscoverLibraryId` | `string` | Library `Guid` (e.g., SeerBridge/JellyBridge Discover folder) used to partition `OwnedOnly` items from `DiscoverOnly` items. |
| `HeroSlider` | `HeroSliderConfig` | Locked Row 0 banner for Owned Library items (`Enabled`, `Title`, `IncludeTags`, `ExcludeTags`). |
| `DiscoverSlider` | `HeroSliderConfig` | Locked top banner for the Discover section (`Enabled`, `Title`, `IncludeTags`, `ExcludeTags`). |
| `Rows` | `List<CustomHomeRowDefinition>` | Ordered list of Owned and Discover rows (`Title`, `RowType`, `Scope`, `TargetValue`, `ExcludeTags`, `ImageStyle`, `GroupIntoCollections`). |
| `MyMediaLibraryOrder` | `List<string>` | Explicit display order of library `Guid`s inside the `MyMedia` row. |
| `ExcludedMyMediaIds` | `List<string>` | Library `Guid`s hidden from the `MyMedia` row. |

---

## 3. Backend API Endpoints (`CopperFoxHomeController.cs`)

### `GET /CopperFoxHome/Rows`
Returns resolved, filtered, and paginated home rows for the requesting user, including `Path` metadata for client-side Discover detection.
* **Query Parameters:**
  * `userId` (`Guid`, required) — Target Jellyfin user ID.
  * `stage` (`int?`, optional) — Progressive loading stage (`1` = Top Hero Slider, `2` = Owned Library Rows, `3` = Discover Hero Slider + Discover Only Rows). When omitted, all stages are returned in a single payload.
  * `rowIndex` (`int?`, optional) & `skip` (`int`, default `0`) — Used by inline **MORE** pagination to fetch the next 20 items for a specific row without re-evaluating other rows.
* **Unified Row Ordering (`unifiedRows`):**
  * **Stage 1 (`rowIndex = 0`):** `HeroSlider` (`RowType = "SliderRow"`, `Scope = "OwnedOnly"`, max 10 items).
  * **Stage 2:** All `Rows` where `Scope != "DiscoverOnly"`.
  * **Stage 3:** `DiscoverSlider` (`RowType = "SliderRow"`, `Scope = "DiscoverOnly"`, max 16 items), followed by all `Rows` where `Scope == "DiscoverOnly"`.

### `POST /CopperFoxHome/ClearSliderCache`
Clears the 24-hour in-memory row cache (`_rowCache`).
* **Query Parameters:**
  * `scope` (`string?`, optional) — Pass `OwnedOnly` or `DiscoverOnly` to clear only that section's cached items, or omit to clear all cached rows.
* **Triggers:** Called automatically when saving `configPage.html` or manually via the **Refresh Owned Library Rows** / **Refresh Discover Rows** buttons.

### `GET /CopperFoxHome/ClientScript`
Concatenates and serves the embedded `Web/Styles.js`, `Web/HomePage.js`, and `Web/Pages.js` scripts (`application/javascript`) as a single bundle to the Jellyfin web client.

### `GET /CopperFoxHome/Logo`
Serves the embedded `Web/logo.png` asset (`image/png`, `[AllowAnonymous]`) used across the web header, admin dashboard drawer, and browser tab favicon.

---

## 4. Row Resolution, Filtering & Caching Pipeline

* **Scope Isolation (`ApplyScopeFilter`):**
  * `OwnedOnly` excludes any item whose ancestor chain contains `DiscoverLibraryId`.
  * `DiscoverOnly` restricts items exclusively to descendants of `DiscoverLibraryId`.
* **Collection Grouping (`GroupIntoCollections`):**
  * Enabled by default for all dynamic rows (`Genre`, `Tag`, `TopGenre1–3`, `BecauseYouWatched`, `RecentlyAdded`, `LatestMovies`, `LatestShows`).
  * Maps movies belonging to a `BoxSet` to their parent collection so multi-part franchises appear once rather than flooding rows.
  * For `SliderRow`, deduplicates by `BoxSet` so at most one movie from any collection appears in the banner rotation.
* **24-Hour In-Memory Cache (`_rowCache`):**
  * `ConcurrentDictionary<string, (DateTime ExpiresAt, List<Guid> ItemIds)>` caches randomized item ID lists for 24 hours on `SliderRow`, `Genre`, and `Tag`/`Keyword` rows.
  * Subsequent page loads and inline `skip` pagination requests hydrate `BaseItem` objects directly from `_libraryManager.GetItemById(id)` without re-running expensive random pool queries.
  * Dynamic user-state rows (`ContinueAndUpNext`, `RecentlyAdded`, `TopGenre1–3`, `BecauseYouWatched`) bypass the 24-hour cache so watch progress and recent additions update immediately.

---

## 5. Client Rendering Architecture

### Jellyfin Web UI (`Web/Styles.js`, `Web/HomePage.js`, `Web/Pages.js`)
* **3-Stage Progressive Paint (`HomePage.js`):** Fetches `stage=1`, `stage=2`, and `stage=3` sequentially via `ApiClient.fetch` and paints rows into `.homeSectionsContainer` as each stage arrives, guarded by route checks so playback transitions (`#/video`) do not tear down active rows.
* **Client-Only Rows:** `StreamingServices` rows are preserved when empty on the server (`isClientOnlyRow = true`) and resolved client-side into styled service tiles (`.cf-service-tile`) linking to filtered tag views.
* **Visual Separation:** Automatically injects `<hr class="cf-discover-divider">` immediately above the Discover Hero Slider (`scope === "DiscoverOnly"`).
* **Card Overlays & Native Playback Delegation:** Renders top-left type/count badges (`movie`, `show`, `xS | yE`, `collection | N`), top-right episode badges (`S1:E1` on `ContinueAndUpNext`), playback progress bars, and bottom hover buttons for **Mark Watched**, **Play / Resume** (delegated with `data-positionticks` through Jellyfin's hidden native `.itemsContainer` listener), and **Favorite**.
* **Admin Quick Context Menu:** Right-clicking or double-clicking any Home card opens a custom context menu for **Edit Metadata**, **Edit Images**, and **Refresh Metadata** without scrolling underlying horizontal rows.
* **Non-Home Page Enhancements (`Pages.js`):**
  * Swaps the header icon, Dashboard drawer banner, and browser tab favicon to `/CopperFoxHome/Logo`.
  * Injects a **Dashboard** navigation button before **Favorites** in the top header for administrators and hides plugin menu items (`CopperFox Home`, `Jellyfin Enhanced`) from non-admin user dropdowns.
  * Injects a two-row quick-filter pill bar (**Favorites** + **Unwatched / Continue / Watched** in Row 1; multi-select **Genres** including **Other** in Row 2) on library folder views, omitting Row 1 on the Discover folder.
  * Hides playback, watched, and more buttons on Discover cards and item detail toolbars while stripping Discover items from *More Like This* recommendation rows.

### Starfin Roku Client (`starfin-roku` — `copperfox-tv` branch)
* **Parallel 3-Stage Tasks (`HomePage.bs` + `CustomHomeRowsTask.bs`):** Launches `customHomeRows1` (`stage=1`), `customHomeRows2` (`stage=2`), and `customHomeRows3` (`stage=3`) concurrently, dismisses the loading spinner as soon as Stage 1 renders, and sorts shelves by server `rowIndex` as Stages 2 and 3 arrive.
* **GPU Texture Optimization (`getHomeItemImageUrl`):** Requests `1280px` backdrops for `SliderRow` and `500px` thumbnails at `quality=85` to stay within Roku's hardware texture cache during vertical scrolling.
* **Slider Timer Lifecycle (`HomeShelf.bs`):** Runs a 5-second auto-advance timer (`cfSliderTimer`) only while the `SliderRow` shelf has focus (`onCfShelfFocusChanged`) and pauses it automatically when scrolled off-screen.
