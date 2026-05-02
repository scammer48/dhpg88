const express = require('express');
const crypto = require('crypto');
const cors = require('cors');
const https = require('https');
const http = require('http');

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(cors());
app.use(express.json());

// 从环境变量读取敏感信息
const API_BASE_URL = 'https://api.itniotech.com';
const API_KEY = process.env.API_KEY || 'tHdCLW9R3Cgfd8HdNaw3xAeKRJUfH9NQ';
const API_SECRET = process.env.API_SECRET || 'oDCYdY24XcYHBMRRLAHXf0Fazq4PkjvT';

// 签名函数
function generateSign(timestamp, requestBody) {
    let params = {
        'Api-Key': API_KEY,
        'Timestamp': timestamp
    };
    
    for (let key in requestBody) {
        if (requestBody.hasOwnProperty(key)) {
            params[key] = requestBody[key];
        }
    }
    
    const sortedKeys = Object.keys(params).sort();
    const stringToSign = sortedKeys.map(key => `${key}=${params[key]}`).join('&');
    
    console.log('[签名调试] 待签名字符串:', stringToSign);
    
    const hmac = crypto.createHmac('sha256', API_SECRET);
    hmac.update(stringToSign);
    return hmac.digest('hex');
}

// 手动实现 fetch 功能（兼容所有 Node.js 版本）
function httpsRequest(url, options, bodyData) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const isHttps = urlObj.protocol === 'https:';
        const requestModule = isHttps ? https : http;
        
        const requestOptions = {
            hostname: urlObj.hostname,
            port: urlObj.port || (isHttps ? 443 : 80),
            path: urlObj.pathname + urlObj.search,
            method: options.method || 'POST',
            headers: options.headers || {}
        };
        
        const req = requestModule.request(requestOptions, (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                let jsonData = null;
                try {
                    jsonData = JSON.parse(data);
                } catch (e) {
                    jsonData = data;
                }
                resolve({
                    status: res.statusCode,
                    json: () => Promise.resolve(jsonData),
                    data: jsonData
                });
            });
        });
        
        req.on('error', (error) => {
            reject(error);
        });
        
        if (bodyData) {
            req.write(bodyData);
        }
        req.end();
    });
}

// 心跳接口
app.get('/ping', (req, res) => {
    res.json({ 
        status: 'alive', 
        timestamp: Date.now(),
        uptime: process.uptime()
    });
});

// 发送验证码的接口
app.post('/api/send-code', async (req, res) => {
    console.log('[请求] 收到验证码请求:', req.body);
    
    const { phone } = req.body;
    
    // 校验手机号
    if (!phone) {
        return res.status(400).json({ error: '请输入手机号' });
    }
    
    if (!/^1[3-9]\d{9}$/.test(phone)) {
        return res.status(400).json({ error: '请输入正确的11位手机号' });
    }
    
    const timestamp = Math.floor(Date.now() / 1000);
    const requestBody = { mobile: phone };
    
    // 生成签名
    const sign = generateSign(timestamp, requestBody);
    console.log('[签名] 生成的Sign:', sign);
    
    // 准备请求头
    const headers = {
        'Content-Type': 'application/json;charset=UTF-8',
        'Api-Key': API_KEY,
        'Timestamp': String(timestamp),
        'Sign': sign
    };
    
    // 实际接口路径（根据文档可能需要调整）
    const apiPath = '/api/v1/sms/sendCode';
    const fullUrl = `${API_BASE_URL}${apiPath}`;
    
    console.log('[请求] 目标URL:', fullUrl);
    console.log('[请求] Headers:', JSON.stringify(headers, null, 2));
    console.log('[请求] Body:', JSON.stringify(requestBody));
    
    try {
        // 发送请求到真实 API
        const response = await httpsRequest(fullUrl, {
            method: 'POST',
            headers: headers
        }, JSON.stringify(requestBody));
        
        console.log('[响应] 状态码:', response.status);
        console.log('[响应] 数据:', response.data);
        
        // 返回结果给前端
        if (response.status === 200 || response.status === 201) {
            res.status(200).json(response.data);
        } else {
            res.status(response.status).json(response.data);
        }
        
    } catch (error) {
        console.error('[错误] 请求失败:', error.message);
        res.status(500).json({ 
            error: '服务端请求失败', 
            message: error.message,
            hint: '请检查 API 接口地址是否正确，或网络是否可达'
        });
    }
});

// 健康检查接口
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: Date.now(),
        uptime: process.uptime()
    });
});

// 根路径
app.get('/', (req, res) => {
    res.json({
        message: '验证码代理服务运行中',
        endpoints: {
            sendCode: 'POST /api/send-code',
            ping: 'GET /ping',
            health: 'GET /health'
        }
    });
});

// 启动服务器
app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`📍 本地地址: http://localhost:${PORT}`);
    console.log(`🔧 环境: ${process.env.NODE_ENV || 'development'}`);
});