const BrowserManagerClass = require("../src/browser").constructor;
const HarvesterClass = require("../src/harvester").constructor;
const path = require("path");

async function testPlatformLogic() {
    console.log("--- CROSS-PLATFORM LOGIC TEST ---");
    
    // 1. Test Windows
    process.env.LOCALAPPDATA = "C:\\Users\\Reaper\\AppData\\Local";
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    
    const winBrowser = new BrowserManagerClass();
    const winHarvester = new HarvesterClass();
    
    console.log(`[WIN] UserData: ${winBrowser.userDataDir}`);
    console.log(`[WIN] Binary: ${winHarvester.binaryName}`);

    // 2. Test Linux
    process.env.HOME = "/home/reaper";
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
    
    const linBrowser = new BrowserManagerClass();
    const linHarvester = new HarvesterClass();

    console.log(`[LIN] UserData: ${linBrowser.userDataDir}`);
    console.log(`[LIN] Binary: ${linHarvester.binaryName}`);

    // Validation
    const winOk = winBrowser.userDataDir.includes("AppData") && winHarvester.binaryName === "yt-dlp.exe";
    const linOk = linBrowser.userDataDir.includes(".config") && linHarvester.binaryName === "yt-dlp";

    if (winOk && linOk) {
        console.log("\nSUCCESS: Dynamic cross-platform logic is valid.");
    } else {
        console.error("\nFAIL: Logic mismatch detected.");
        process.exit(1);
    }
}

testPlatformLogic();
