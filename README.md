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
Because `custom-index.html` overrides Jellyfin's built-in `/jellyfin/jellyfin-web/index.html` via a read-only Docker volume mount, a major Jellyfin version upgrade (e.g., `10.12` to `10.13`) may change the hashed bundle filenames inside Jellyfin's default `index.html`.

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
  * A single top row for a quick initial load. This row can be toggled on and off, and the featured are chosen at random and saved for 24 hours. Include/exclude tags can be entered to define the search, and a Refresh button allows for a new selection of shows to be selected on demand.
* **Section 2:** Owned Library Rows where rows can be added, deleted, reordered, and set to show poster or thumb images.
* **Section 3:** Discover Library Rows with the same features as section 2, but isolates search results to the SeerBridge discover folder only.

* **Custom Row Types:**
  * **Slider Row:** Identical to the top hero slider to feature another selection of shows chosen at random on load per included/exclude tags, if included. This is particularly useful as a header to the discover section.
  * **My Media:** The standard library folders row with order and per-folder visibility toggles (set at the bottom of the settings page).
  * **Continue & Up Next:** Merges resumable movies and episodes with Next Up episodes, removing duplications so that only the latest active or next episode per show appears.
  * **Collections & Playlists:** Direct row rendering for any BoxSet or Playlist.
  * **Tag Match & Specific Genre:** Filter by included and/or excluded, comma-separated tags or specific genres.
    * Example: Create a Christmas row using include 'christmas', a 'More Holidays row using 'thanksgiving, winter, halloween' + exclude 'christmas' and a Discover More this Season using including all tags, but set to Discover folder only.
  * **Personalized Recommendations:** Automatic **User Top Genre #1–#3** and **Because You Watched** based on the current users viewing history.
  * **Recently Added, Recently Added Movies & Recently added Shows:** A variety of ways to discplay recently added media with shows being featured here if there are any recently added series or episodes.
  * **Streaming Services:** Renders quick-launch service tiles (`Netflix`, `Hulu`, `Disney+`, `Max`, `Prime Video`, `Apple TV+`, `Paramount+`, `Peacock`) on the web client that open dedicated Discover only landing pages filtered by service tags.
* **Per-Row Display & Pagination:** Choose between **Poster** (`2:3`) and **Thumb** (`16:9` with automatic Backdrop fallback) per row, loading 20 posters or 14 thumbs initially with inline **MORE** pagination.

---

## 3. Starfin Roku Fork (`starfin-roku` — `custom-home` Branch)

The Roku client consumes the same `/CopperFoxHome/Rows` endpoint, so row order, library isolation, and card badges stay synchronized between web and TV.

### Modified Files
* **`source/tasks/CustomHomeRowsTask.bs`** *(or `components/tasks/CustomHomeRowsTask.bs`)*
  * Replaced static `/web/custom-home-rows.json` polling with `/CopperFoxHome/Rows?userId=...` (including `rowIndex` and `skip` parameters for **MORE** pagination).
  * Skips web-only `StreamingServices` rows, routes episode items directly to their parent `Series` detail screen, builds permanent Roku badge strings (`S1:E1`, `collection | X`, `xS | yE`), and appends the `CF_LOAD_MORE` node when `hasMore` is true.
* **`components/pages/HomePage/HomePage.bs`**
  * Stores custom row metadata (`m.homeState.customRowMeta`), replaces default Starfin shelves (`libraries`, `continueWatching`, `continueListening`, `nextUp`, `liveTvOnNow`) when CopperFox rows are active, and guards `onLibrariesResponse` and `onSectionResponse` so background tasks do not re-insert default rows.
  * Updates `getRowLayout`, `getRowImageAspect`, and `getHomeItemImageUrl` to support mixed `16:9` Thumbnail and `2:3` Poster shelves with proper image fallbacks.
  * Adds `loadMoreCustomRow` and `onCustomRowMoreResponse` to handle **MORE** tile clicks and append items inline.
* **`components/pages/Video/Cards/VideoMediaCard/VideoMediaCard.xml`**
  * Added the permanent top-right badge overlay (`cfBadgeGroup` with semi-transparent black `Rectangle` and `Label`) and the **MORE** card layout (`cfMoreGroup`).
* **`components/pages/Video/Cards/VideoMediaCard/VideoMediaCard.bs`**
  * Binds `raw.cfBadgeText` to the top-right badge dynamically sized to text width, toggles the **MORE** card presentation with focus highlight states, and conforms to the repository's `verify-function-headers.mjs` linter rules.

### Jellyfin Plugin Build (`Jellyfin.Plugin.CopperFoxHome`)
1. Build the plugin DLL via GitHub Actions (updates mainifest)
2. Restart Jellyfin to pick up the update, then restart again to activate.
3. Set **User Settings > Home > Home Sections 1–7** to **None** so that they do not populate sections above the custom rows created through the plugin.

### Starfin Roku Package (`starfin-roku`)
1. From the root of `/workspaces/starfin-roku` (on the `custom-home` branch), validate function headers, compile BrighterScript, and package the sideloadable zip:
   ```bash
   npm run package
   ```
2. Open your Roku's Developer Application Installer (`http://<ROKU_IP>`) in a browser and upload **`out/starfin.2.2.2.zip`**.
