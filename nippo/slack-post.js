// 【重要】発行したGASのウェブアプリURLをここに設定してください
const GAS_URL = "https://script.google.com/macros/s/AKfycbx_Sp4e5kHGZczVQoli40OzwrVAGrlQuilqP1K6A0x0HtenLhScDee_mTEF1IA2-PNAVw/exec";

async function sendToSlackViaGAS(token, channel, payload) {
    if (!GAS_URL || GAS_URL.includes("ここに")) return false;

    // 送信データの整形
    let postData = {
        token: token,
        channel: channel,
        text: (typeof payload === 'object') ? payload.text : payload,
        blocks: (typeof payload === 'object') ? payload.blocks : null
    };

    try {
        const response = await fetch(GAS_URL, {
            method: 'POST',
            // mode: 'no-cors' はレスポンスを無視するため、
            // 成功・失敗を判定したい場合は指定しないでください。
            body: JSON.stringify(postData)
        });

        // 302リダイレクトが発生しても、GAS側で処理されていればOK
        if (!response.ok && response.status !== 0) {
             throw new Error("Network response was not ok");
        }

        const data = await response.json();
        return data.ok;
    } catch (error) {
        console.error("Slack送信エラー:", error);
        // エラーが出ていてもSlackに届いている場合があるため、
        // 挙動を確認してください
        return false;
    }
}

/**
 * 日報用 Block Kit テンプレート
 */
function createReportBlocks(data) {
    const mentionText = data.mentions ? data.mentions.split(' ').map(m => `<@${m.trim().replace('@','')}>`).join(' ') + '\n' : '';
    const remoteStatus = data.isRemote ? "【在宅】" : "";
    
    return {
        text: `日報: ${data.project}`,
        blocks: [
            {
                "type": "section",
                "text": { 
                      "type": "mrkdwn", 
                      "text": `${mentionText}\n*作業時間：* ${data.date} ${data.startTime} 〜 ${data.endTime} ${remoteStatus}`
                }
            },
            { "type": "divider" },
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": `*担当業務*: ${data.project}\n` +
                            `*作業実績*: \n` +
                            `> 案件名　: ${data.task}\n` +
                            `> フェーズ: ${data.phase}\n` +
                            `> 状況　　: ${data.status}\n` +
                            `> 　　　　: (${data.statusDetail || 'なし'})\n` +
                            `> 案件数　: ${data.count}`
                }
            },
            {
                "type": "section",
                "text": { "type": "mrkdwn", "text": `*問題点・課題*\n${data.issue || 'なし'}` }
            },
            {
                "type": "context",
                "elements": [
                    { "type": "mrkdwn", "text": `*備考:* ${data.note || '特記事項なし'}` }
                ]
            }
        ]
    };
}
