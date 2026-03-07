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
        const imgEl = item.querySelector("img");
        
        const flexColumns = Array.from(item.querySelectorAll(".secondary-flex-columns .flex-column"));
        
        let artist = "";
        let album = "";

        const junkPattern = /\d+(\.\d+)?\s*(M|k|K)?\s*(reproducciones|views|vistas|visualizaciones|vists)/i;

        if (isAlbumPage) {
            album = headerTitle || "Unknown Album";
            const columnTexts = flexColumns.map(c => c.innerText.trim());
            const cleanParts = columnTexts.map(t => t.split("•")[0].trim()).filter(t => !junkPattern.test(t));
            const firstLink = flexColumns[0]?.querySelector("a");
            artist = firstLink?.innerText || cleanParts[0] || headerArtist || "Unknown Artist";
        } else {
            // PLAYLIST MODE: Use the separate flex columns to distinguish between Artist and Album
            if (flexColumns.length > 0) {
                // Column 0 is Artists. If there are multiple links (collaborations), take the first one.
                const artistLinks = Array.from(flexColumns[0].querySelectorAll("a"));
                if (artistLinks.length > 0) {
                    artist = artistLinks[0].innerText.trim();
                } else {
                    artist = flexColumns[0].getAttribute("title") || flexColumns[0].innerText.trim();
                }
            }

            if (flexColumns.length > 1) {
                // Column 1 is usually the Album.
                const albumLink = flexColumns[1].querySelector("a");
                if (albumLink) {
                    album = albumLink.innerText.trim();
                } else {
                    album = flexColumns[1].getAttribute("title") || flexColumns[1].innerText.trim();
                }
            }

            // Fallbacks for completely unstructured text
            if (!artist) artist = "Unknown Artist";
            if (!album || album === "Playlist autogenerada" || album === "Auto-generated playlist") {
                 album = "Unknown Album";
            }
        }

        const finalize = (s) => s.replace(/[\r\n\t]/g, " ").replace(/\s+/g, " ").trim();

        return {
          trackNumber: isAlbumPage ? index + 1 : "", 
          year: isAlbumPage ? year : "", 
          title: finalize(titleEl?.innerText || "Unknown Title"),
          artist: finalize(artist),
          album: finalize(album),
          albumArtist: finalize(artist),
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

  async getLyricsAndArtwork(page) {
    let lyrics = "";
    let highResArtwork = null;

    try {
        // 1. Extract High-Res Artwork
        const artworkUrl = await page.evaluate(() => {
            const img = document.querySelector('#song-image img#img') || 
                        document.querySelector('ytmusic-player img#img') ||
                        document.querySelector('.ytmusic-player img#img');
            return img ? img.src : null;
        });
        
        if (artworkUrl) {
            // Remove sizing parameters to get the max resolution original
            highResArtwork = artworkUrl.split("=")[0];
            logger.success(`Extracted absolute high-res cover.`);
        }

        // 2. Extract Lyrics
        // YouTube Music uses localized text for tabs (e.g., "Lyrics", "Letra"). We must find and click it.
        const clicked = await page.evaluate(() => {
            const tabs = Array.from(document.querySelectorAll('tp-yt-paper-tab'));
            const lyricsTab = tabs.find(tab => {
                const text = tab.innerText.trim().toLowerCase();
                return text === 'lyrics' || text === 'letra' || text === 'paroles';
            });
            
            const isDisabled = lyricsTab && (lyricsTab.hasAttribute('disabled') || lyricsTab.getAttribute('aria-disabled') === 'true');

            if (lyricsTab && !isDisabled) {
                lyricsTab.click();
                return true;
            }
            return false;
        });

        if (clicked) {
            await new Promise(r => setTimeout(r, 2000)); // Wait for content to load

            lyrics = await page.evaluate(() => {
                // 1. Try synced lyrics first
                const syncedLines = Array.from(document.querySelectorAll(".ytmusic-lyrics-line-renderer"));
                if (syncedLines.length > 0) {
                    return syncedLines.map(line => line.innerText.trim()).join("\n");
                }
                
                // 2. Try static lyrics with extremely robust selectors
                const staticLyricsNode = 
                    document.querySelector("yt-formatted-string.ytmusic-description-shelf-renderer[split-lines]") ||
                    document.querySelector("ytmusic-description-shelf-renderer yt-formatted-string") ||
                    document.querySelector("yt-formatted-string.description.ytmusic-description-shelf-renderer") || 
                    document.querySelector("ytmusic-description-shelf-renderer #description-text") ||
                    document.querySelector(".ytmusic-description-shelf-renderer #description-text");
                
                return staticLyricsNode?.innerText?.trim() || "";
            });

            if (lyrics && lyrics.length > 0) {
                logger.success(`Extracted ${lyrics.length} characters of lyrics.`);
            } else {
                logger.info("Lyrics tab opened, but no text could be parsed.");
            }
        } else {
            logger.info("Lyrics tab is disabled or not found. Skipping extraction to agilize process.");
        }

    } catch (err) {
        logger.error(`Error fetching lyrics/artwork: ${err.message}`);
    }

    return { lyrics, highResArtwork };
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
