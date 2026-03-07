const browserManager = require("./browser");
const logger = require("./logger");

class Scraper {
  async getLibraryAlbums() {
    const page = await browserManager.newPage();
    const url = "https://music.youtube.com/library/albums";
    logger.info(`Navigating to library albums: ${url}`);
    
    await page.goto(url, { waitUntil: "networkidle2" });
    
    // Wait for the content to appear
    await page.waitForSelector("ytmusic-grid-renderer, ytmusic-responsive-list-item-renderer", { timeout: 30000 });
    
    // Scroll to load all albums
    await this.autoScroll(page);

    const albumUrls = await page.evaluate(() => {
      // Try grid items first
      const gridItems = Array.from(document.querySelectorAll("ytmusic-grid-album-cell-renderer a.ytmusic-grid-album-cell-renderer, a#thumbnail, .title a"));
      // Try list items as backup
      const listItems = Array.from(document.querySelectorAll("ytmusic-responsive-list-item-renderer .title a"));
      
      const allLinks = [...gridItems, ...listItems];
      return [...new Set(allLinks
        .map(a => a.href)
        .filter(href => href && (href.includes("browse/MPREb_") || href.includes("browse/FEmusic_library_privately_owned_release_detail")))
      )];
    });

    logger.info(`Found ${albumUrls.length} albums in library.`);
    await page.close();
    return albumUrls;
  }

  async getPlaylistSongs(playlistUrl) {
    const page = await browserManager.newPage();
    
    // Explicitly check for My Likes if no URL provided
    const url = playlistUrl || "https://music.youtube.com/playlist?list=LM";
    
    if (!playlistUrl && !url.includes("list=LM")) {
        throw new Error("A valid URL is required for this mode.");
    }
    
    logger.info(`Navigating to: ${url}`);
    
    await page.goto(url, { waitUntil: "networkidle2" });
    
    // Give it a moment to settle dynamic elements
    await new Promise(r => setTimeout(r, 2000));

    try {
        await page.waitForSelector("ytmusic-responsive-list-item-renderer", { timeout: 30000 });
    } catch (e) {
        const path = require('path');
        const debugPath = path.join(__dirname, '../logs/error_fetch.png');
        await page.screenshot({ path: debugPath });
        logger.error(`Fetch failed. Screenshot saved to ${debugPath}`);
        throw e;
    }

    // Scroll to load more songs (simple version)
    await this.autoScroll(page);

    const songs = await page.evaluate(() => {
      // 1. Get header metadata (Primary source for albums)
      const header = document.querySelector("ytmusic-responsive-header-renderer, ytmusic-detail-header-renderer");
      const headerTitle = header?.querySelector(".title")?.innerText?.trim();
      
      // Extract Year from header subtitle (e.g., "Album • 2008")
      const subtitleText = header?.querySelector(".subtitle")?.innerText || "";
      const yearMatch = subtitleText.match(/\b(19|20)\d{2}\b/);
      const year = yearMatch ? yearMatch[0] : "";

      // Better artist from header
      let headerArtist = "";
      const subtitleLinks = header?.querySelectorAll(".subtitle a, .strapline-text a");
      if (subtitleLinks && subtitleLinks.length > 0) {
          headerArtist = Array.from(subtitleLinks).map(a => a.innerText.trim()).join(", ");
      } else {
          headerArtist = header?.querySelector(".subtitle, .strapline-text")?.innerText?.split("•")[0]?.trim();
      }

      const url = window.location.href;
      const sectionList = document.querySelector("ytmusic-section-list-renderer");
      const pageType = sectionList?.getAttribute("page-type");
      
      const isAlbumPage = pageType === "MUSIC_PAGE_TYPE_ALBUM" || 
                          url.includes("browse/MPREb_") || 
                          url.includes("list=OLAK5uy") || 
                          url.includes("privately_owned_release_detail");

      const items = Array.from(document.querySelectorAll("ytmusic-responsive-list-item-renderer"));
      
      return items.map((item, index) => {
        const titleEl = item.querySelector(".title-column .title");
        const flexColumns = Array.from(item.querySelectorAll(".secondary-flex-columns yt-formatted-string"));
        const imgEl = item.querySelector("img");
        
        const columnTexts = flexColumns.map(c => c.innerText.trim());
        const allLinks = Array.from(item.querySelectorAll(".secondary-flex-columns a"));

        let artist = "";
        let album = "";

        const junkPattern = /\d+(\.\d+)?\s*(M|k|K)?\s*(reproducciones|views|vistas|visualizaciones|vists)/i;

        if (isAlbumPage) {
            album = headerTitle || "Unknown Album";
            const cleanParts = columnTexts.map(t => t.split("•")[0].trim()).filter(t => !junkPattern.test(t));
            artist = allLinks[0]?.innerText || cleanParts[0] || headerArtist || "Unknown Artist";
        } else {
            // PLAYLIST MODE: Strictly use the links inside the row, ignore the header
            if (allLinks.length >= 2) {
                artist = allLinks[0].innerText;
                album = allLinks[1].innerText;
            } else if (allLinks.length === 1) {
                artist = allLinks[0].innerText;
                album = "Unknown Album"; // If only one link, it's the artist, album is missing
            } else {
                const clean = (s) => {
                    if (!s) return "";
                    const yearPattern = /^\d{4}$/;
                    const timePattern = /^\d+:\d+/;
                    if (junkPattern.test(s) || yearPattern.test(s) || timePattern.test(s)) return "";
                    return s.split("•")[0].trim();
                };
                const candidates = columnTexts.map(clean).filter(v => v.length > 0 && v !== "Playlist autogenerada" && v !== "Auto-generated playlist");
                artist = candidates[0] || "Unknown Artist";
                album = candidates[1] || "Unknown Album";
            }
        }

        const finalize = (s) => s.replace(/[\r\n\t]/g, " ").replace(/\s+/g, " ").trim();

        return {
          trackNumber: isAlbumPage ? index + 1 : "", // Don't use playlist index as track number
          year: isAlbumPage ? year : "", // Year is often wrong in playlist context
          title: finalize(titleEl?.innerText || "Unknown Title"),
          artist: finalize(artist),
          album: finalize(album),
          albumArtist: finalize(artist), // For playlists, track artist is album artist
          artwork: (imgEl?.src || "").replace("=w120-h120", "=w600-h600"),
          duration: item.querySelector(".fixed-columns yt-formatted-string")?.innerText || "0:00",
          url: item.querySelector(".title-column .title a")?.href
        };
      });
    });

    logger.info(`Found ${songs.length} songs in playlist.`);
    await page.close();
    return songs;
  }

  async getLyrics(page) {
    try {
        // 1. Try to click the Lyrics tab in the right panel
        const lyricsTabSelector = 'tp-yt-paper-tab[aria-label="Lyrics"], .tab-header[aria-label="Lyrics"]';
        const lyricsTab = await page.$(lyricsTabSelector);
        if (lyricsTab) {
            await lyricsTab.click();
            await new Promise(r => setTimeout(r, 2000)); // Wait for content load
        }

        // 2. Try to extract lyrics (check both timed and static containers)
        const lyricsData = await page.evaluate(() => {
            // Check for synced lyrics first (list of lines)
            const syncedLines = Array.from(document.querySelectorAll(".ytmusic-lyrics-line-renderer"));
            if (syncedLines.length > 0) {
                return syncedLines.map(line => line.innerText.trim()).join("\n");
            }

            // Fallback to static description shelf
            const staticLyrics = document.querySelector("ytmusic-description-shelf-renderer #description-text") ||
                                 document.querySelector(".ytmusic-description-shelf-renderer #description-text");
            return staticLyrics?.innerText?.trim() || "";
        });

        return lyricsData;
    } catch (err) {
        return "";
    }
  }

  async autoScroll(page) {
    await page.evaluate(async () => {
      await new Promise((resolve) => {
        let totalHeight = 0;
        let distance = 100;
        let timer = setInterval(() => {
          let scrollHeight = document.body.scrollHeight;
          window.scrollBy(0, distance);
          totalHeight += distance;

          if (totalHeight >= scrollHeight) {
            clearInterval(timer);
            resolve();
          }
        }, 100);
      });
    });
  }
}

module.exports = new Scraper();
