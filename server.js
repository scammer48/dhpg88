const express = require('express');
const crypto = require('crypto');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(cors()); // 允许您的前端域名访问
app.use(express.json());

// 从环境变量读取敏感信息，更加安全 (在 Render 上设置)
const API_BASE_URL = 'https://api.itniotech.com';
const API_KEY = process.env.API_KEY || 'tHdCLW9R3Cgfd8HdNaw3xAeKRJUfH9NQ';
const API_SECRET = process.env.API_SECRET || 'oDCYdY24XcYHBMRRLAHXf0Fazq4PkjvT';

// 签名函数 (服务端实现，安全可靠)
function generateSign(timestamp, requestBody) {
    // 构建参数对象
    let params = {
        'Api-Key': API_KEY,
        'Timestamp': timestamp
    };
    
    // 合并请求体参数 (phone/mobile)
    for (let key in requestBody) {
        if (requestBody.hasOwnProperty(key)) {
            params[key] = requestBody[key];
        }
    }
    
    // 按字典序排序
    const sortedKeys = Object.keys(params).sort();
    const stringToSign = sortedKeys.map(key => `${key}=${params[key]}`).join('&');
    
    // 使用 HMAC-SHA256 加密
    const hmac = crypto.createHmac('sha256', API_SECRET);
    hmac.update(stringToSign);
    return hmac.digest('hex');
}

// 发送验证码的接口
app.post('/api/send-code', async (req, res) => {
    const { phone } = req.body;
    
    // 简单校验手机号
    if (!phone || !/^1[3-9]\d{9}$/.test(phone)) {
        return res.status(400).json({ error: '请输入正确的11位手机号' });
    }
    
    const timestamp = Math.floor(Date.now() / 1000); // 秒级时间戳
    const requestBody = { mobile: phone }; // 根据接口文档，字段名改为 mobile
    
    // 生成签名
    const sign = generateSign(timestamp, requestBody);
    
    // 准备请求头
    const headers = {
        'Content-Type': 'application/json;charset=UTF-8',
        'Api-Key': API_KEY,
        'Timestamp': String(timestamp),
        'Sign': sign
    };
    
    try {
        // 调用真实 API
        // 注意：根据文档，请确认正确的验证码发送路径，这里使用常见路径 /api/v1/sms/sendCode
        const apiPath = '/api/v1/sms/sendCode'; 
        const response = await fetch(`${API_BASE_URL}${apiPath}`, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(requestBody)
        });
        
        const data = await response.json();
        
        // 返回结果给前端
        res.status(response.status).json(data);
        
    } catch (error) {
        console.error('代理请求失败:', error);
        res.status(500).json({ error: '服务端请求失败', message: error.message });
    }
});

// 健康检查接口
app.get('/health', (req, res) => {
    res.send('OK');
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});