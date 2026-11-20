# CopperFox Home (`Jellyfin.Plugin.CopperFoxHome`)

A custom Jellyfin plugin that replaces Jellyfin's default home screen with customizable sections that isolate or exclude the JellyBridge Discover folder and that works as both a web-client injections script and on a modified branch of Starfin Roku, creating onsistent card styling across Desktop and Roku. 

There are 3 components that work together to accomplish this:

---

## 1. Index File on the Jellyfin Server

To render the custom rows and styling on the Jellyfin web interface, a file is mounted and served from the Jellyfin `/config` directory (`/opt/stacks/jellyfin/config/`):

* **`copperfox-home-index.html`**
  * Mounted over `/jellyfin/jellyfin-web/index.html` in the Jellyfin container.
  * Loads the `HomePage.js` file in the plugin that includes:
    * **Home Screen Renderer:** Fetches `/CopperFoxHome/Rows` in three batches for fast initial paint (First slider row, Owned libraries rows, then Discover library rows).
    * **Card Styling & Hover Overlays:** Applies transparent card backgrounds, hover zoom, copper progress bars, permanent top-right `S:E` badges on Continue Watching, and hover overlays featuring top-left metadata badges (`movie`, `collection | x`, `xS | yE`), bottom-left watched toggle, bottom-center play button, and bottom-right favorite toggle, while Discover item hover only displays a 'movie' or 'show' badge and favorite toggle.
    * **Context Menu & Sub-Pages:** Adds right-click and double-click quick menus (`Open Details`, `Mark Watched`, `Favorite`, `Add to Collection/Playlist`, `Edit Metadata/Images`, `Refresh Metadata`), renders `#/list.html?cfService=...` streaming service grids, and injects the **CopperFox Home** shortcut into the user profile menu.

Requirement: `/opt/stacks/jellyfin/config/copperfox-home-index.html` must be mapped into the dockge container:
   ```yaml
   volumes:
     - /opt/stacks/jellyfin/config:/config
     - /opt/stacks/jellyfin/config/copperfox-home-index.html:/jellyfin/jellyfin-web/index.html:ro
   ```
NOTE ABOUT FUTURE RELEASE CONFLICTS: Because `custom-index.html` overrides Jellyfin's built-in `/jellyfin/jellyfin-web/index.html` via a read-only Docker volume mount, a major Jellyfin version upgrade (e.g., `10.12` to `10.13`) may change the hashed bundle filenames inside Jellyfin's default `index.html`.

If the Jellyfin web interface fails to load or shows a blank screen after a major update:
1. Temporarily comment out the `copperfox-home-index.html` volume mount in `docker-compose.yml` and restart the container so Jellyfin exposes its fresh `index.html`:
   ```bash
   docker restart jellyfin
   ```
2. Copy the updated default `index.html` from the container into the `/config` folder:
   ```bash
   docker cp jellyfin:/jellyfin/jellyfin-web/index.html /opt/stacks/jellyfin/config/copperfox-home-index.html
   ```
3. Re-inject the plugin ClientScript script tag right before `</body>` in `/opt/stacks/jellyfin/config/custom-index.html`:
   ```bash
   sed -i 's|</body>|<script src="/CopperFoxHome/ClientScript"></script></body>|' /opt/stacks/jellyfin/config/custom-index.html
   ```
4. Uncomment the `copperfox-home-index.html` volume mount in `docker-compose.yml` and restart Jellyfin:
   ```bash
   docker restart jellyfin
   ```


---

## 2. CopperFox Home Plugin (`Jellyfin.Plugin.CopperFoxHome`)

The C# server plugin exposes the CopperFoxHome Rows API endpoint and a dashboard configuration UI that can be accessed at both **Dashboard > Plugins > CopperFox Home** and in the user profile dropdown menu (Admin only). All user profiles follow the rules set by admin. Sections isolate content to owned content or discover folder content only.

### Key Features
* **Section 1:** Top Hero Slider 
  * A single top row for a quick initial load. This row can be toggled on and off, and the featured are chosen at random and cached for 24 hours. Include/exclude tags can be entered to define the search, and a Refresh button allows for a new selection of shows to be selected on demand.
  * UPDATE: Tag/Genre match rows are now also cached when the hero slider is cached to speed up page load and to keep the display consistent for users throughout a given day.
* **Section 2:** Owned Library Rows where rows can be added, deleted, reordered, and set to show poster or thumb images.
* **Section 3:** Discover Library Rows with the same features as section 2 (minus My Media and Continue & Up Next), but isolates search results to the SeerBridge discover folder only. There is a locked slider in the first row position identical to the top hero slider.

* **Custom Row Types:**
  * **My Media:** The standard library folders row with order and per-folder visibility toggles (set at the bottom of the settings page).
  * **Continue & Up Next:** Merges resumable movies and episodes with Next Up episodes, removing duplications so that only the latest active or next episode per show appears.
  * **Collections & Playlists:** Direct row rendering for any BoxSet or Playlist.
  * **Tag Match & Specific Genre:** Filter by included and/or excluded, comma-separated tags or specific genres.
    * Example: Create a Christmas row using include 'christmas', a 'More Holidays row using 'thanksgiving, winter, halloween' + exclude 'christmas' and a Discover More this Season using including all tags, but set to Discover folder only.
  * **Personalized Recommendations:** Automatic **User Top Genre #1–#3** and **Because You Watched** based on the current users viewing history.
    * NOTE: Through use, these tend to be redundant, espeically if the top 3 are Family, Animation, and Fantasy. It's better to use the Specific Genre to create groups, which each successive group excluding previous groups. These rows also slow down build as it takes more time to identify top genres/because you watched and search for matches.
  * **Recently Added, Recently Added Movies & Recently added Shows:** A variety of ways to display recently added media. Shows will be featured here if there are any recently added series or episodes.
    * NOTE: This section is not cached, so using this with a large discover folder could slow down load time.
  * **Streaming Services:** Renders quick-launch service tiles (`Netflix`, `Hulu`, `Disney+`, `Max`, `Prime Video`, `Apple TV+`, `Paramount+`, `Peacock`) on the web client that open dedicated Discover only landing pages filtered by service tags.
* **Per-Row Display & Pagination:** Choose between **Poster** (`2:3`) and **Thumb** (`16:9` with automatic Backdrop fallback) per row, loading 20 posters or 14 thumbs initially with inline **MORE** pagination.


---

## 3. Starfin Roku Fork (`starfin-roku` — `copperfox-tv` Branch)

The Roku client consumes the `/CopperFoxHome/Rows` endpoint so row ordering, library isolation, slider banners, and card badges stay synchronized between desktop and TV.

### Added Files (Conflict-Free on Upstream Updates)
* **`components/tasks/CustomHomeRowsTask/CustomHomeRowsTask.xml`**
  * Defines the SceneGraph `Task` node interface (`request` and `response` fields) used to fetch custom home rows asynchronously from the Jellyfin server.
* **`components/tasks/CustomHomeRowsTask/CustomHomeRowsTask.bs`**
  * Queries `/CopperFoxHome/Rows` using `stage` (`1`, `2`, `3`) for progressive startup loading, as well as `rowIndex` and `skip` for inline **MORE** pagination.
  * Skips web-only `StreamingServices` rows, routes episode items to their parent `Series` screen, formats permanent top-right badge text (`S1:E1` and `xS | yE`), tags `SliderRow` items, and appends `CF_LOAD_MORE` nodes when `hasMore` is true.

### Modified Files
* **`manifest`**
  * Renames the channel title to **CopperFox TV** and bumps the build version to `3.1.1`.
* **`source/main.bs`**
  * Sets the initial global theme mode to `Theme.Mode.PureBlack`.
* **`source/store/SettingsStore.bs`**
  * Updates default preferences to `Theme.Mode.PureBlack`, enables `DisplayAccountBadge` (`"on"`), and sets the default `NextEpisodePromptSeconds` fallback interval to `"60"`.
* **`components/controls/AccountBadge/AccountBadge.xml`**
  * Makes the top-left user badge focusable (`focusable="true"`), exposes `focused`, `buttonSelected`, and `getContentWidth()`, and wraps visuals in `badgeRoot` for focus scaling.
* **`components/controls/AccountBadge/AccountBadge.bs`**
  * Scales the avatar and username by `1.12x` with a bright white border ring when focused, opens the account switcher on `OK`, and measures rendered text width via `getContentWidth()` for dynamic icon spacing.
* **`components/pages/Header/Header.xml`**
  * Hides the center glass navigation bar (`navGroup`), adds page-aware `activePage` and horizontal exit fields, and places icon-only **Home** (`topHomeGroup`) and **Search** (`topSearchGroup`) controls to the right of the user badge.
* **`components/pages/Header/Header.bs`**
  * Dynamically positions **Home** and **Search** icons with equal spacing after the username, toggles icon visibility by `activePage` (hiding Home on the home screen and Search on the search screen), scales focused icons by `1.15x`, bridges right-edge navigation into library sort controls, and returns focus down to the active page on `Back`.
* **`components/pages/AccountPicker/AccountPickerContent/AccountPickerContent.xml`**
  * Adds `navSelected` output and embeds a **Settings** navigation button (`pickerNavGroup`) between the user list and the sign-in button.
* **`components/pages/AccountPicker/AccountPickerContent/AccountPickerContent.bs`**
  * Wires vertical focus navigation between the account row, the embedded **Settings** button, and the sign-in button, emitting `navSelected = "settings"` when selected.
* **`components/pages/AccountPicker/AccountPickerDialog/AccountPickerDialog.xml`**
  * Exposes the `navSelected` field to forward picker navigation events to `MainScene`.
* **`components/pages/AccountPicker/AccountPickerDialog/AccountPickerDialog.bs`**
  * Forwards `navSelected` from `AccountPickerContent` and closes the dialog automatically.
* **`components/MainScene/Helpers/Auth.bs`**
  * Handles `overlay.navSelected` in `authHandleAccountPickerClosed` to launch the Settings overlay directly when selected from the account switcher.
* **`components/MainScene/Helpers/Navigation.bs`**
  * Syncs `m.header.activePage` (`"home"`, `"search"`, or `"other"`) across page transitions, triggers a full home refresh when clicking the **Home** icon, and bridges horizontal top-row focus between `Header` and `VideoLibrary`.
* **`components/MainScene/Helpers/Collections.bs`**
  * Syncs `m.header.activePage` when opening the Collections screen.
* **`components/MainScene/Helpers/VideoLibrary.bs`**
  * Wires `exitLeftToHeader` and `wrapRightToHeaderUser` observers on newly created library/collection views and syncs `m.header.activePage`.
* **`components/pages/HomePage/HomePage.bs`**
  * Launches parallel 3-stage `CustomHomeRowsTask` requests (`stage=1` Top Hero Slider, `stage=2` Owned Library Rows, `stage=3` Discover Rows), sorts arriving shelves by server `rowIndex`, suppresses default Starfin home rows, skips full reload when returning via `Back`, handles `BoxSet` collection navigation, and appends inline pagination results via `loadMoreCustomRow`.
* **`components/pages/HomePage/Helpers/HomeFocus.bs`**
  * Saves `shelfIndex` alongside `itemId` in `captureHomeFocus()` and matches `shelfIndex` in `resolveHomeFocus()` so pressing `Back` returns to the exact shelf and card.
* **`components/pages/HomePage/Helpers/HomeReconciliation.bs`**
  * Captures active shelf and card focus inside `deactivate()` before hiding `HomePage`.
* **`components/pages/HomePage/HomeShelf/HomeShelf.xml`**
  * Adds a 5-second repeating `Timer` (`cfSliderTimer`) to drive automatic slide transitions on `SliderRow` shelves.
* **`components/pages/HomePage/HomeShelf/HomeShelf.bs`**
  * Starts `cfSliderTimer` when a `SliderRow` is focused, pauses it automatically when scrolled off-screen (`onCfShelfFocusChanged`), resets the countdown on manual left/right scrolling, and wires up `focusExitDown` for vertical shelf navigation.
* **`components/pages/Search/Search.xml`**
  * Hides and disables focus on the manual **Search** submit button (`searchButton`) for live query execution.
* **`components/pages/Search/Search.bs`**
  * Lowers `minimumQueryLength` to `2`, triggers live searches automatically on `keyboard.text` changes without stealing keyboard focus, cancels in-flight requests smoothly when typing continues, exits upward to the top header from row `0`, and renders 5 dedicated rows (**Movies**, **Shows**, **Episodes**, **Discover**, and **People**).
* **`components/tasks/SearchTask/SearchTask.bs`**
  * Requests item `Path` metadata, separates Discover library items (`/discover/`) into a dedicated `discover` payload array, and splits owned titles into `movies` and `shows`.
* **`components/pages/Video/VideoLibrary/VideoLibrary.xml`**
  * Moves `browseByButton` and `sortButton` onto the top header row (`y=36`), shifts `titleLabel` below the top bar (`y=118`), and exposes `exitLeftToHeader`, `wrapRightToHeaderUser`, and `focusSortControlsFromHeader()`.
* **`components/pages/Video/VideoLibrary/VideoLibrary.bs`**
  * Updates `m.chromeLayout.y` to `36` and adds `focusSortControlsFromHeader()` to receive horizontal focus from the top header bar.
* **`components/pages/Video/VideoLibrary/Helpers/Browse.bs`**
  * Disables library sort state persistence so Movies and TV Shows always load sorted by Title and Collections always load sorted by Release Date.
* **`components/pages/Video/VideoLibrary/Helpers/Loading.bs`**
  * Defaults `isCollectionContentRequest(request)` views to `LibraryBrowse.Option.ReleaseDate` (`Ascending`).
* **`components/pages/Video/VideoLibrary/Helpers/Layout.bs`**
  * Positions `browseByButton` and `sortButton` on the top header row to the right of the Home/Search icons and keeps `titleLabel` centered below at `y=118`.
* **`components/pages/Video/VideoLibrary/Helpers/Navigation.bs`**
  * Routes upward navigation from the first grid row straight to the top header bar and bridges left/right navigation across the top bar between `Header` and the sort controls.
* **`components/pages/Video/VideoToolbar/VideoToolbar.xml`**
  * Adds `isFavorite`, `favoriteSelected`, `unfavoriteSelected`, `focusFavoriteAction()`, and `favoriteButton` / `unfavoriteButton` (`DynamicButton` controls using custom light and focused heart icons).
* **`components/pages/Video/VideoToolbar/VideoToolbar.bs`**
  * Manages visibility, ordering (placing **Favorite / Unfavorite** ahead of **Mark as Watched / Unwatched**), click events, and focus retention for the Favorite heart toolbar buttons.
* **`components/pages/Video/Movie/Movie.xml`**
  * Embeds `<FavoriteItemTask id="favoriteItemTask" />` on the Movie details screen.
* **`components/pages/Video/Movie/Movie.bs`**
  * Initializes `m.mediaToolbar.isFavorite` from `item.UserData.IsFavorite` and executes `AddToFavorites` / `RemoveFromFavorites` via `FavoriteItemTask`.
* **`components/pages/Video/TVShow/TVShow.xml`**
  * Embeds `<FavoriteItemTask id="favoriteItemTask" />` on the TV Show details screen.
* **`components/pages/Video/TVShow/TVShow.bs`**
  * Initializes `m.favoriteItemTask` and observes `favoriteSelected` / `unfavoriteSelected` on `m.videoToolbar`.
* **`components/pages/Video/TVShow/Helpers/WatchedState.bs`**
  * Syncs `m.videoToolbar.isFavorite` from `series.UserData.IsFavorite` and executes `AddToFavorites` / `RemoveFromFavorites` via `FavoriteItemTask`.
* **`components/pages/Video/Cards/VideoMediaCard/VideoMediaCard.xml`**
  * Adds SceneGraph overlays for the permanent top-right badge (`cfBadgeGroup`), the inline **MORE** pagination tile (`cfMoreGroup`), and the full-width `1760x540` Hero Slider card (`cfSliderGroup` with focus border, backdrop poster, scrim, title, and overview).
* **`components/pages/Video/Cards/VideoMediaCard/VideoMediaCard.bs`**
  * Binds `cfBadgeText` dynamically to card width, toggles the **MORE** card focus styling, and renders the full-width `SliderRow` backdrop banner with a crisp focus border.

NOTE: This plugin will populate Jellyfin setting rows first, so each user needs to go to **User Settings > Home** and set all of the Home Sections to **None**.

---

## Work Environment & Updates

Both Github repos are available on Github Desktop and are edited using Visual Studio Code. 

### Plugin Build Updates (`Jellyfin.Plugin.CopperFoxHome`)
1. Pushing updates to GitHub triggers Github Actions, which will compile and, if it passes without errors, will update the mainifest.
2. Restarting Jellyfin will pick up the update, then restart again to activate.

### Starfin Roku Package (`starfin-roku`)
1. Using the VSC terminal (on the `copperfox-tv` branch), run
   ```bash
   npm run package
   ```
to validate function headers, compile BrighterScript, and package the sideloadable zip.
2. Open your Roku's Developer Application Installer (`http://<ROKU_IP>`) in a browser and upload **`Documents/Githum/starfin-roku/out/starfin.2.2.2.zip`**.
3. When the orgininal starfin-roku releases an update, sync the main branch and review what changes were made - in particular to the modified files listed above.
4. Make a backup branch based on the copperfox-tv branch, then sync the copperfox-tv branch with the main branch. Any new code that specifically conficts with line-item edits in my modified files will be flagged for review in the process. 