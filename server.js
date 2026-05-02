const express = require('express');
const crypto = require('crypto');
const cors = require('cors');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const API_BASE_URL = 'https://api.itniotech.com';
const API_KEY = process.env.API_KEY || 'tHdCLW9R3Cgfd8HdNaw3xAeKRJUfH9NQ';
const API_SECRET = process.env.API_SECRET || 'oDCYdY24XcYHBMRRLAHXf0Fazq4PkjvT';

// MD5 签名函数
function generateSign(timestamp) {
    const stringToSign = API_KEY + API_SECRET + timestamp;
    const md5Hash = crypto.createHash('md5').update(stringToSign).digest('hex');
    console.log('[签名] 待签字符串:', stringToSign);
    console.log('[签名] MD5结果:', md5Hash);
    return md5Hash;
}

// 发起 HTTPS GET 请求
function httpsGetRequest(url, headers) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const options = {
            hostname: urlObj.hostname,
            port: 443,
            path: urlObj.pathname + urlObj.search,
            method: 'GET',
            headers: headers
        };
        
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    const jsonData = JSON.parse(data);
                    resolve({ status: res.statusCode, data: jsonData });
                } catch (e) {
                    resolve({ status: res.statusCode, data: data });
                }
            });
        });
        
        req.on('error', (error) => reject(error));
        req.end();
    });
}

// 心跳接口
app.get('/ping', (req, res) => {
    res.json({ status: 'alive', timestamp: Date.now() });
});

// 查询验证码/短信报告接口
app.get('/api/query-report', async (req, res) => {
    console.log('========================================');
    console.log('[请求] 查询参数:', req.query);
    
    const { appId, msgIds } = req.query;
    
    if (!appId) {
        return res.status(400).json({ error: '请输入 appId' });
    }
    if (!msgIds) {
        return res.status(400).json({ error: '请输入 msgIds' });
    }
    
    const timestamp = Math.floor(Date.now() / 1000);
    const sign = generateSign(timestamp);
    
    const headers = {
        'Content-Type': 'application/json;charset=UTF-8',
        'Api-Key': API_KEY,
        'Timestamp': String(timestamp),
        'Sign': sign
    };
    
    // 构建完整 URL
    const fullUrl = `${API_BASE_URL}/sms/getReport?appId=${encodeURIComponent(appId)}&msgIds=${encodeURIComponent(msgIds)}`;
    
    console.log('[请求] 目标URL:', fullUrl);
    console.log('[请求] Headers:', JSON.stringify(headers, null, 2));
    
    try {
        const response = await httpsGetRequest(fullUrl, headers);
        console.log('[响应] 状态码:', response.status);
        console.log('[响应] 数据:', response.data);
        
        // 根据文档：status: "0" 表示成功
        if (response.data && response.data.status === '0') {
            res.json({ success: true, message: '查询成功', data: response.data });
        } else {
            res.json({ success: false, message: response.data?.reason || '查询失败', data: response.data });
        }
    } catch (error) {
        console.error('[错误]:', error.message);
        res.status(500).json({ error: '请求失败', message: error.message });
    }
});

// POST 方式查询（更方便）
app.post('/api/query-report', async (req, res) => {
    const { appId, msgIds } = req.body;
    
    if (!appId || !msgIds) {
        return res.status(400).json({ error: '请提供 appId 和 msgIds' });
    }
    
    const timestamp = Math.floor(Date.now() / 1000);
    const sign = generateSign(timestamp);
    
    const headers = {
        'Content-Type': 'application/json;charset=UTF-8',
        'Api-Key': API_KEY,
        'Timestamp': String(timestamp),
        'Sign': sign
    };
    
    const fullUrl = `${API_BASE_URL}/sms/getReport?appId=${encodeURIComponent(appId)}&msgIds=${encodeURIComponent(msgIds)}`;
    
    try {
        const response = await httpsGetRequest(fullUrl, headers);
        if (response.data && response.data.status === '0') {
            res.json({ success: true, data: response.data });
        } else {
            res.json({ success: false, message: response.data?.reason, data: response.data });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/', (req, res) => {
    res.json({
        message: '短信报告查询代理服务',
        endpoints: {
            query: 'GET /api/query-report?appId=xxx&msgIds=xxx',
            queryPost: 'POST /api/query-report (Body: {appId, msgIds})',
            ping: 'GET /ping'
        }
    });
});

app.listen(PORT, () => {
    console.log(`✅ 服务启动在端口 ${PORT}`);
});
