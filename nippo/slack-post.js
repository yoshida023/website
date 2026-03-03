// 【重要】発行したGASのウェブアプリURLをここに設定してください
const GAS_URL = "https://script.google.com/macros/s/AKfycbxF7HAXjFlbROff9HN4knL_s-bywKATwIholbMIFEVs_dvNzoh-xRMqCk4A6d2avNbCEw/exec";

/**
 * Slackへメッセージを送信する（GAS経由）
 * @param {string} token - Slack API Token
 * @param {string} channel - 送信先チャンネル (例: "#general")
 * @param {string} text - 送信するテキスト
 * @returns {Promise<boolean>} - 送信成否
 */
async function sendToSlackViaGAS(token, channel, text) {
    if (!GAS_URL || GAS_URL.includes("ここに")) {
        console.error("GAS_URLが設定されていません。");
        return false;
    }

    try {
        const response = await fetch(GAS_URL, {
            method: 'POST',
            body: JSON.stringify({
                token: token,
                channel: channel,
                text: text
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        return data.ok;
    } catch (error) {
        console.error("Slack送信エラー (GAS経由):", error);
        return false;
    }
}