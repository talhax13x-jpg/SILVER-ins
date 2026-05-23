const axios = require('axios');

// ============ CONFIGURATION ============
const API_KEY = 'sk_7b5304bd5c52a605117cd4853e615f1e2fd3cc38626a60975041edf186d65933';
const BASE_URL = 'http://203.161.58.20/api/functions/agent-api';

// ============ EXTRACT OTP FROM MESSAGE ============
function extractOTP(message) {
    if (!message) return null;
    let match = message.match(/(\d{3,4})[- ](\d{3,4})/);
    if (match) return match[1] + match[2];
    match = message.match(/\b(\d{4,6})\b/);
    if (match) return match[1];
    match = message.match(/OTP[:\s]*(\d{4,6})/i);
    if (match) return match[1];
    match = message.match(/code[:\s]*(\d{4,6})/i);
    if (match) return match[1];
    match = message.match(/(\d{5,6})/);
    if (match) return match[1];
    return null;
}

// ============ GET ALL NUMBERS ============
async function getNumbers(countryCode = null) {
    try {
        const response = await axios.get(`${BASE_URL}/numbers`, {
            headers: { 'x-api-key': API_KEY },
            params: { page: 1, limit: 500 },
            timeout: 15000
        });
        if (!response.data.ok) return [];
        let numbers = response.data.data || [];
        numbers = numbers.filter(n => n.number && n.status === 'assigned');
        let numberList = numbers.map(n => n.number);
        if (countryCode) {
            numberList = numberList.filter(n => n.toString().startsWith(countryCode));
        }
        return numberList;
    } catch (err) {
        return [];
    }
}

// ============ GET MESSAGES FOR A NUMBER ============
async function getMessagesForNumber(number, limit = 5) {
    try {
        const response = await axios.get(`${BASE_URL}/otp`, {
            headers: { 'x-api-key': API_KEY },
            params: { number: number, limit: limit, page: 1 },
            timeout: 10000
        });
        if (!response.data.ok) return [];
        return response.data.data || [];
    } catch (err) {
        return [];
    }
}

// ============ GET LIVE OTP FROM ALL NUMBERS ============
async function getLiveOTP(countryCode = null) {
    try {
        const numbers = await getNumbers(countryCode);
        if (numbers.length === 0) return [];
        const numberMap = new Map();
        for (const number of numbers) {
            const messages = await getMessagesForNumber(number, 5);
            for (const msg of messages) {
                const messageText = msg.message || msg.text || msg.content || '';
                const otp = extractOTP(messageText);
                if (otp) {
                    const msgTime = msg.time || msg.created_at || msg.timestamp;
                    if (!numberMap.has(number) || new Date(msgTime) > new Date(numberMap.get(number).time)) {
                        numberMap.set(number, {
                            number: number,
                            otp: otp,
                            service: msg.platform || msg.service || msg.cli || 'Unknown',
                            time: msgTime,
                            message: messageText
                        });
                    }
                    break;
                }
            }
            await new Promise(r => setTimeout(r, 100));
        }
        return Array.from(numberMap.values());
    } catch (err) {
        return [];
    }
}

// ============ GET STATS ============
async function getStats() {
    try {
        const response = await axios.get(`${BASE_URL}/stats`, {
            headers: { 'x-api-key': API_KEY },
            timeout: 10000
        });
        if (response.data.ok) return response.data.data;
        return null;
    } catch (err) {
        return null;
    }
}

// ============ GET BALANCE ============
async function getBalance() {
    try {
        const response = await axios.get(`${BASE_URL}/balance`, {
            headers: { 'x-api-key': API_KEY },
            timeout: 10000
        });
        if (response.data.ok) return response.data.data;
        return null;
    } catch (err) {
        return null;
    }
}

// ============ MAIN HANDLER ============
module.exports = async (req, res) => {
    const { path, country } = req.query;
    
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');
    
    if (path === 'numbers') {
        const numbers = await getNumbers(country);
        return res.json({ success: true, source: 'INS Panel', result: numbers, count: numbers.length });
    }
    
    if (path === 'liveotp') {
        const otps = await getLiveOTP(country);
        return res.json({ success: true, source: 'INS Panel', result: otps, count: otps.length });
    }
    
    if (path === 'stats') {
        const stats = await getStats();
        return res.json({ success: true, source: 'INS Panel', result: stats });
    }
    
    if (path === 'balance') {
        const balance = await getBalance();
        return res.json({ success: true, source: 'INS Panel', result: balance });
    }
    
    return res.json({
        success: false,
        error: 'Invalid path',
        source: 'INS Panel',
        available: ['numbers', 'liveotp', 'stats', 'balance'],
        example: {
            numbers: '/api?path=numbers&country=92',
            liveotp: '/api?path=liveotp&country=92',
            stats: '/api?path=stats',
            balance: '/api?path=balance'
        }
    });
};
