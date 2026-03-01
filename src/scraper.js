const browserManager = require("./browser");

class Scraper {
  async getLibraryAlbums() {
    const page = await browserManager.newPage();
    const url = "https://music.youtube.com/library/albums";
    console.log(`Navigating to library albums: ${url}`);
    
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

    console.log(`Found ${albumUrls.length} albums in library.`);
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
    
    console.log(`Navigating to: ${url}`);
    
    await page.goto(url, { waitUntil: "networkidle2" });

    // Wait for the song list to appear
    await page.waitForSelector("ytmusic-responsive-list-item-renderer", { timeout: 30000 });

    // Scroll to load more songs (simple version)
    await this.autoScroll(page);

    const songs = await page.evaluate(() => {
      // 1. Try to get header metadata (useful for album pages)
      const header = document.querySelector("ytmusic-detail-header-renderer");
      const headerTitle = header?.querySelector(".title")?.innerText;
      const headerArtist = header?.querySelector(".subtitle a")?.innerText || header?.querySelector(".subtitle")?.innerText;
      const isAlbumPage = window.location.href.includes("browse/MPREb_") || window.location.href.includes("list=OLAK5uy");

      const items = Array.from(document.querySelectorAll("ytmusic-responsive-list-item-renderer"));
      return items.map(item => {
        const titleEl = item.querySelector(".title-column .title");
        const flexColumns = Array.from(item.querySelectorAll(".secondary-flex-columns yt-formatted-string"));
        const lengthEl = item.querySelector(".fixed-columns yt-formatted-string");
        const imgEl = item.querySelector("img");
        const links = Array.from(item.querySelectorAll(".secondary-flex-columns a"));
        
        // Extract all text parts across all columns, splitting by dot
        let allParts = [];
        flexColumns.forEach(col => {
            const text = col.innerText;
            if (text) {
                text.split("•").forEach(p => {
                    const cleanP = p.trim();
                    if (cleanP) allParts.push(cleanP);
                });
            }
        });

        // Filter out view counts and dates from parts
        const viewPattern = /\d+(\.\d+)?\s*(M|k|K)?\s*(reproducciones|views|vistas|visualizaciones|vists)/i;
        const yearPattern = /^\d{4}$/;
        allParts = allParts.filter(p => !viewPattern.test(p) && !yearPattern.test(p));

        let artist = links[0]?.innerText || allParts[0] || (isAlbumPage ? headerArtist : "");
        let album = links[1]?.innerText || allParts[1] || (isAlbumPage ? headerTitle : "");

        // If it's an album page and we only found one part in the row, 
        // that part is usually the artist, and the album is in the header.
        if (isAlbumPage && allParts.length === 1) {
            artist = allParts[0];
            album = headerTitle;
        }

        artist = artist?.trim() || "Unknown Artist";
        album = album?.trim() || "Unknown Album";

        let artwork = imgEl?.src || "";
        if (artwork.includes("=w120-h120")) {
            artwork = artwork.replace("=w120-h120", "=w600-h600");
        }

        return {
          title: titleEl?.innerText || "Unknown Title",
          artist,
          album,
          artwork,
          duration: lengthEl?.innerText || "0:00",
          url: item.querySelector(".title-column .title a")?.href
        };
      });
    });

    console.log(`Found ${songs.length} songs in playlist.`);
    await page.close();
    return songs;
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
