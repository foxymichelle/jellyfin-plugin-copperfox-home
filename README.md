# CopperFox Home (`Jellyfin.Plugin.CopperFoxHome`)

A custom Jellyfin plugin that replaces Jellyfin's default home screen with customizable sections that isolate or exclude the JellyBridge Discover folder and that works as both a web-client injections script and on a modified branch of Starfin Roku, creating onsistent card styling across Desktop and Roku.

---

## 1. Jellyfin Plugin Overview (`Jellyfin.Plugin.CopperFoxHome`)

The C# server plugin exposes the CopperFoxHome Rows API endpoint and a dashboard configuration UI that can be accessed at both **Dashboard > Plugins > CopperFox Home** and in the user profile dropdown menu.

### Key Features
* **Discover Library Isolation:** In the UI, identify which library is the dedicated Discover/Jellybridge library so any row can be scoped exclusively to **Owned Libraries Only** or **Discover Folder Only**.
* **Custom Home Row Types:**
  * **My Media:** The standard, reorderable library folders section with per-folder visibility toggles.
  * **Continue & Up Next:** Merges resumable movies and episodes with Next Up episodes, removing duplications so that only the latest active or next episode per show appears.
  * **Collections & Playlists:** Direct row rendering for any BoxSet or Playlist.
  * **Tag Match & Specific Genre:** Filter by included and/or excluded, comma-separated tags or specific genres.
    * Example: Create a Christmas row using include 'christmas', a 'More Holidays row using 'thanksgiving, winter, halloween' + exclude 'christmas' and a Discover More this Season using including all tags, but set to Discover folder only.
  * **Personalized Recommendations:** Automatic **User Top Genre #1–#3** (`More of {Genre}` / `DISCOVER More of {Genre}`) and **Because You Watched** (`Because You Watched {Title}` / `DISCOVER More Like {Title}`).
  * **Latest Movies & Latest Shows:** Separate recently added rows with Owned vs. Discover isolation, with shows grouped by series rather than individual episodes.
  * **Streaming Services:** Renders quick-launch service tiles (`Netflix`, `Hulu`, `Disney+`, `Max`, `Prime Video`, `Apple TV+`, `Paramount+`, `Peacock`) on the web client that open dedicated Discover only landing pages filtered by service tags.
* **Per-Row Display & Pagination:** Choose between **Poster** (`2:3`) and **Thumb** (`16:9` with automatic Backdrop fallback) per row, loading 20 posters or 14 thumbs initially with inline **MORE** pagination.

---

## 2. Additional Web Client Files on the Jellyfin Server

To render the custom rows and styling on the Jellyfin web interface, two files are mounted and served from the Jellyfin `/config` directory (`/opt/stacks/jellyfin/config/`):

* **`custom-index.html`**
  * Mounted over `/jellyfin/jellyfin-web/index.html` in the Jellyfin container.
  * Loads `custom-home.js` with a cache-busting query string (e.g., `custom-home.js?v=36`), allowing Cmd+shift+R to reload the page to show the newest saved version.
* **`custom-home.js`**
  * **Home Screen Renderer:** Fetches `/CopperFoxHome/Rows` in two batches (first 3 rows immediately, remaining rows after) for fast initial paint and renders horizontal scroll rows without visible scrollbars.
  * **Card Styling & Hover Overlays:** Applies transparent card backgrounds, hover zoom, copper progress bars, permanent top-right `S:E` badges on Continue Watching, and hover overlays featuring top-left metadata badges (`movie`, `collection | x`, `xS | yE` - indicating number of items in collection or number of seasons/episodes for a show), bottom-left watched toggle, bottom-center play button, and bottom-right favorite toggle. Discover item hover only displays a 'movie' or 'show' badge and favorite toggle.
  * **Context Menu & Sub-Pages:** Adds right-click and double-click quick menus (`Open Details`, `Mark Watched`, `Favorite`, `Add to Collection/Playlist`, `Edit Metadata/Images`, `Refresh Metadata`), renders `#/list.html?cfService=...` streaming service grids, and injects the **CopperFox Home** shortcut into the user profile menu.

---

## 3. Starfin Roku Fork (`starfin-roku` — `custom-home` Branch)

The Roku client consumes the same `/CopperFoxHome/Rows` endpoint so row order, library isolation, and card badges stay synchronized between web and TV.

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

---

## 4. Quick Setup & Build Checklist

### Jellyfin Plugin Build (`Jellyfin.Plugin.CopperFoxHome`)
1. Build the plugin DLL via GitHub Actions or locally with the .NET SDK:
   ```bash
   dotnet publish src/Jellyfin.Plugin.CopperFoxHome/Jellyfin.Plugin.CopperFoxHome.csproj -c Release -o ./publish
   ```
2. Copy `Jellyfin.Plugin.CopperFoxHome.dll` and `meta.json` into `/opt/stacks/jellyfin/config/plugins/CopperFoxHome/`.
3. Restart Jellyfin and configure your rows under **Dashboard > Plugins > CopperFox Home** (and set **User Settings > Home > Home Sections 1–7** to **None**).

### Jellyfin Web Injection (`docker-compose.yml`)
1. Ensure `/opt/stacks/jellyfin/config/custom-index.html` and `/opt/stacks/jellyfin/config/custom-home.js` are mapped into the container:
   ```yaml
   volumes:
     - /opt/stacks/jellyfin/config:/config
     - /opt/stacks/jellyfin/config/custom-index.html:/jellyfin/jellyfin-web/index.html:ro
     - /opt/stacks/jellyfin/config/custom-home.js:/jellyfin/jellyfin-web/custom-home.js:ro
   ```
2. Whenever `custom-home.js` is updated, bump the query parameter in `custom-index.html` then restart Jellyfin from Dockge:
   ```bash
   sed -i 's|custom-home.js[^"]*|custom-home.js?v=37|' /opt/stacks/jellyfin/config/custom-index.html
   ```

### Major Jellyfin Update Note (`custom-index.html`)
Because `custom-index.html` overrides Jellyfin's built-in `/jellyfin/jellyfin-web/index.html` via a read-only Docker volume mount, a major Jellyfin version upgrade (e.g., `10.12` to `10.13`) may change the hashed bundle filenames inside Jellyfin's default `index.html`.

If the Jellyfin web interface fails to load or shows a blank screen after a major update:
1. Temporarily comment out the `custom-index.html` volume mount in `docker-compose.yml` and restart the container so Jellyfin exposes its fresh `index.html`:
   ```bash
   docker restart jellyfin
   ```
2. Copy the updated default `index.html` from the container into your `/config` folder:
   ```bash
   docker cp jellyfin:/jellyfin/jellyfin-web/index.html /opt/stacks/jellyfin/config/custom-index.html
   ```
3. Re-inject the `custom-home.js` script tag right before `</body>` in `/opt/stacks/jellyfin/config/custom-index.html`:
   ```bash
   sed -i 's|</body>|<script src="custom-home.js?v=37"></script></body>|' /opt/stacks/jellyfin/config/custom-index.html
   ```
4. Uncomment the `custom-index.html` volume mount in `docker-compose.yml` and restart Jellyfin:
   ```bash
   docker restart jellyfin
   ```

### Starfin Roku Package (`starfin-roku`)
1. From the root of `/workspaces/starfin-roku` (on the `custom-home` branch), validate function headers, compile BrighterScript, and package the sideloadable zip:
   ```bash
   npm run package
   ```
2. Open your Roku's Developer Application Installer (`http://<ROKU_IP>`) in a browser and upload **`out/starfin.2.2.2.zip`**.
