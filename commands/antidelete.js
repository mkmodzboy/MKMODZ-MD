const fs = require('fs');

// Global store for messages in RAM
if (!global.messageStore) global.messageStore = {};

/**
 * Settings Management
 */
function getSettings() {
    try {
        if (!fs.existsSync('./data/antidelete.json')) return {};
        return JSON.parse(fs.readFileSync('./data/antidelete.json'));
    } catch { return {}; }
}

function saveSettings(settings) {
    if (!fs.existsSync('./data')) fs.mkdirSync('./data', { recursive: true });
    fs.writeFileSync('./data/antidelete.json', JSON.stringify(settings, null, 2));
}

/**
 * Command Handler
 */
async function handleAntideleteCommand(sock, chatId, message, match) {
    let settings = getSettings();
    const action = match ? match.toLowerCase() : '';
    if (action === 'on') {
        settings[chatId] = true;
        saveSettings(settings);
        await sock.sendMessage(chatId, { text: "✅ *Anti-Delete PRO Enabled!*\nAb Text, Video, Audio aur Photos sab recover honge." }, { quoted: message });
    } else if (action === 'off') {
        settings[chatId] = false;
        saveSettings(settings);
        await sock.sendMessage(chatId, { text: "❌ *Anti-Delete Disabled!*" }, { quoted: message });
    }
}

/**
 * Message Storage Logic
 * Isay aapne apne main event listener 'messages.upsert' mein call karna hai.
 */
function storeMessage(msg) {
    try {
        // Sirf real messages save karein, protocol ya delete wale nahi
        if (!msg.message || msg.message.protocolMessage) return;
        
        const key = msg.key.id;
        // Deep clone taake original data delete hone ke baad bhi hamare paas rahe
        global.messageStore[key] = JSON.parse(JSON.stringify(msg));
        
        // RAM clean up after 2 hours
        setTimeout(() => { 
            if (global.messageStore[key]) delete global.messageStore[key]; 
        }, 7200000); 
    } catch (e) {
        console.log("Error storing message:", e);
    }
}

/**
 * Recovery Logic
 * Isay 'messages.update' ya revocation listener mein call karein.
 */
async function handleMessageRevocation(sock, revokeUpdate) {
    try {
        const settings = getSettings();
        const chatId = revokeUpdate.key.remoteJid;
        
        if (!settings[chatId]) return;

        const key = revokeUpdate.message.protocolMessage.key.id;
        const m = global.messageStore[key];

        if (m) {
            const sender = m.key.participant || m.key.remoteJid;
            const pushName = m.pushName || "User";
            const msgType = Object.keys(m.message)[0];
            
            // Extract content for the report
            const deletedText = m.message.conversation || 
                                m.message.extendedTextMessage?.text || 
                                m.message[msgType]?.caption || 
                                m.message[msgType]?.text || 
                                `*(Deleted ${msgType.replace('Message', '')})*`;

            // Professional Report Layout
            let report = `╔══════════════════╗\n`;
            report += `║   🗑️ *MESSAGE DELETED* \n`;
            report += `╠══════════════════╝\n`;
            report += `╟👤 *Sender:* @${sender.split('@')[0]}\n`;
            report += `╟📛 *Name:* ${pushName}\n`;
            report += `╟🕒 *Time:* ${new Date().toLocaleTimeString()}\n`;
            report += `╟📄 *Content:* ${deletedText}\n`;
            report += `╚══════════════════╝\n\n`;
            report += `*Powered by mkmodz*`;

            // List of media types to handle
            const mediaTypes = ['imageMessage', 'videoMessage', 'audioMessage', 'stickerMessage', 'documentMessage'];

            if (mediaTypes.includes(msgType)) {
                // Media recovery logic
                // Hum report ko caption mein daal kar message forward kar rahe hain
                await sock.sendMessage(chatId, { 
                    forward: m, 
                    caption: report, 
                    mentions: [sender] 
                }, { quoted: m });
            } else {
                // Pure Text recovery logic
                await sock.sendMessage(chatId, { 
                    text: report, 
                    mentions: [sender] 
                });
            }
            
            // Delete from RAM after recovery
            delete global.messageStore[key];
        }
    } catch (e) {
        console.error("Anti-delete Error:", e);
    }
}

module.exports = { handleAntideleteCommand, handleMessageRevocation, storeMessage };
