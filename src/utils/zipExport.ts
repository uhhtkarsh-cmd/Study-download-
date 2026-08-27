import JSZip from "jszip";
import { saveAs } from "file-saver";
import { BOT_FILES } from "../data/botFiles";

export async function exportBotAsZip(customConfig?: {
  botToken?: string;
  apiId?: string;
  apiHash?: string;
}) {
  const zip = new JSZip();

  BOT_FILES.forEach((file) => {
    let content = file.content;
    
    // Replace credentials if custom ones are provided
    if (customConfig?.botToken && file.name === "config.py") {
      content = content.replace(/BOT_TOKEN = os\.getenv\("BOT_TOKEN", ".*?"\)/, `BOT_TOKEN = os.getenv("BOT_TOKEN", "${customConfig.botToken}")`);
    }
    if (customConfig?.apiId && file.name === "config.py") {
      content = content.replace(/API_ID = int\(os\.getenv\("API_ID", ".*?"\)\)/, `API_ID = int(os.getenv("API_ID", "${customConfig.apiId}"))`);
    }
    if (customConfig?.apiHash && file.name === "config.py") {
      content = content.replace(/API_HASH = os\.getenv\("API_HASH", ".*?"\)/, `API_HASH = os.getenv("API_HASH", "${customConfig.apiHash}")`);
    }

    zip.file(file.path, content);
  });

  // Add a README.md
  const readmeContent = `# ⚡ ThorStream Ultra Telegram Downloader Bot

High-speed Telegram Bot to download PWThor and HLS (.m3u8) video streams with 1000x multi-threading, custom titles, 16:9 thumbnails, and Pyrogram MTProto 2GB bypass.

## 🚀 Quick Start on VPS (Ubuntu / Debian)

\`\`\`bash
chmod +x setup_vps.sh
./setup_vps.sh
\`\`\`

## 🐳 Docker Run

\`\`\`bash
docker compose up -d --build
\`\`\`

## 💻 Manual Run

\`\`\`bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python3 bot.py
\`\`\`

## ⚙️ Configuration
Pre-configured in \`config.py\` or can be overridden via \`.env\` file.
`;

  zip.file("README.md", readmeContent);

  // Generate ZIP
  const blob = await zip.generateAsync({ type: "blob" });
  saveAs(blob, "ThorStream_Telegram_Bot_Package.zip");
}
