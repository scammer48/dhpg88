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

// ========== 修正签名函数：使用 MD5 ==========
function generateSign(timestamp) {
    // 按照文档：MD5(Api Key + Api Secret + Timestamp)
    const stringToSign = API_KEY + API_SECRET + timestamp;
    const md5Hash = crypto.createHash('md5').update(stringToSign).digest('hex');
    console.log('[签名调试] 待签名字符串:', stringToSign);
    console.log('[签名调试] MD5结果:', md5Hash);
    return md5Hash;
}

// 手动实现请求功能
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
    console.log('========================================');
    console.log('[请求] 收到验证码请求:', req.body);
    
    const { phone } = req.body;
    
    // 校验手机号
    if (!phone) {
        return res.status(400).json({ error: '请输入手机号' });
    }
    
    if (!/^1[3-9]\d{9}$/.test(phone)) {
        return res.status(400).json({ error: '请输入正确的11位手机号' });
    }
    
    // 生成时间戳（秒）
    const timestamp = Math.floor(Date.now() / 1000);
    
    // 使用 MD5 生成签名（只包含 Api-Key + Api-Secret + Timestamp）
    const sign = generateSign(timestamp);
    
    // 准备请求头（按照文档要求）
    const headers = {
        'Content-Type': 'application/json;charset=UTF-8',
        'Api-Key': API_KEY,
        'Timestamp': String(timestamp),
        'Sign': sign
    };
    
    // ⚠️ 重要：需要确认正确的验证码发送接口路径
    // 根据文档，可能路径是根路径 '/' 或 '/sendCode' 等
    // 这里提供几个常见可能性，请根据实际情况调整
    const apiPath = '/';  // 尝试根路径，如果不行请修改
    // const apiPath = '/sendCode';
    // const apiPath = '/api/sendCode';
    // const apiPath = '/sms/send';
    
    const fullUrl = `${API_BASE_URL}${apiPath}`;
    
    // 构造请求体（根据文档，需要发送手机号）
    const requestBody = {
        mobile: phone  // 也可能是 phone 或 mobileNumber
    };
    
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
        
        // 检查业务状态码（文档说 status: "0" 表示成功）
        if (response.data && response.data.status === '0') {
            res.status(200).json({ 
                success: true, 
                message: response.data.reason || '验证码发送成功',
                data: response.data 
            });
        } else {
            res.status(200).json({ 
                success: false, 
                message: response.data?.reason || '验证码发送失败',
                data: response.data 
            });
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
    console.log(`📝 签名方式: MD5(Api-Key + Api-Secret + Timestamp)`);
});
